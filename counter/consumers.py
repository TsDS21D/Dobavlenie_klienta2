"""
consumers.py
WebSocket обработчики для реального обновления данных в системе управления заказами типографии.
"""

import json
from datetime import datetime  # Импортируем стандартный модуль datetime
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from django.contrib.auth.models import AnonymousUser
from .models import Order, Client
from django.utils import timezone  # Используем timezone из Django


class OrderConsumer(AsyncWebsocketConsumer):
    """
    OrderConsumer - асинхронный обработчик WebSocket соединений.
    """
    
    async def connect(self):
        """Устанавливает WebSocket соединение с проверкой аутентификации."""
        user = self.scope.get('user')
        
        if isinstance(user, AnonymousUser) or not user.is_authenticated:
            print(f"❌ WebSocket: Отказ в подключении для неаутентифицированного пользователя")
            await self.close(code=4001)
            return
        
        print(f"✅ WebSocket: Подключение пользователя {user.username}")
        
        self.room_group_name = 'orders'
        
        await self.channel_layer.group_add(
            self.room_group_name,
            self.channel_name
        )
        
        await self.accept()
        
        # При подключении отправляем и заказы, и клиентов
        active_orders, completed_orders = await self.get_orders_by_status()
        clients = await self.get_all_clients()
        
        await self.send(text_data=json.dumps({
            'type': 'initial_load',
            'active_orders': active_orders,
            'completed_orders': completed_orders,
            'clients': clients
        }))
    
    async def disconnect(self, close_code):
        """Закрывает WebSocket соединение."""
        await self.channel_layer.group_discard(
            self.room_group_name,
            self.channel_name
        )
        
        print(f"🔌 WebSocket: Отключение пользователя, код: {close_code}")
    
    async def receive(self, text_data):
        """Обрабатывает сообщения от клиента."""
        data = json.loads(text_data)
        action = data.get('action')
        
        # ===== ДОБАВЛЕНИЕ НОВОГО ЗАКАЗА =====
        if action == 'add_order':
            # Обработка с клиентом из базы - теперь это единственный способ
            if 'client_id' in data:
                client_id = data.get('client_id')
                description = data.get('description')
                ready_datetime_str = data.get('ready_datetime')
                
                await self.add_order_with_client(client_id, description, ready_datetime_str)
            else:
                # Если клиент не выбран, отправляем ошибку
                print(f"❌ Ошибка: клиент не выбран при создании заказа")
                await self.send(text_data=json.dumps({
                    'type': 'error',
                    'message': 'Необходимо выбрать клиента из базы данных'
                }))
                return  # Прерываем выполнение, так как клиент обязателен
            
            # Отправляем обновления всем
            active_orders, completed_orders = await self.get_orders_by_status()
            
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type': 'order_update',
                    'active_orders': active_orders,
                    'completed_orders': completed_orders
                }
            )
        
        # ===== ДОБАВЛЕНИЕ НОВОГО КЛИЕНТА =====
        elif action == 'add_client':
            client_data = data.get('client_data')
            
            new_client = await self.add_client(
                client_data['name'],
                client_data.get('phone', ''),
                client_data.get('email', ''),
                client_data.get('uses_edo', False),
                client_data.get('notes', '')
            )
            
            # Отправляем обновленный список клиентов
            clients = await self.get_all_clients()
            
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type': 'clients_update',
                    'clients': clients
                }
            )
            
            print(f"✅ Добавлен клиент: {client_data['name']}")
        
        # ===== УДАЛЕНИЕ ЗАКАЗА =====
        elif action == 'delete_order':
            order_number = data.get('order_number')
            await self.delete_order(order_number)
            
            active_orders, completed_orders = await self.get_orders_by_status()
            
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type': 'order_update',
                    'active_orders': active_orders,
                    'completed_orders': completed_orders
                }
            )
        
        # ===== ОБНОВЛЕНИЕ ЗАКАЗА =====
        elif action == 'update_order':
            order_number = data.get('order_number')
            description = data.get('description')
            ready_datetime_str = data.get('ready_datetime')
            
            # Теперь мы не передаем customer_name, так как клиент всегда из базы
            # и не может быть изменен через редактирование заказа
            await self.update_order(order_number, description, ready_datetime_str)
            
            active_orders, completed_orders = await self.get_orders_by_status()
            
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type': 'order_update',
                    'active_orders': active_orders,
                    'completed_orders': completed_orders
                }
            )
        
        # ===== ИЗМЕНЕНИЕ СТАТУСА ЗАКАЗА =====
        elif action == 'change_status':
            order_number = data.get('order_number')
            new_status = data.get('status')
            
            await self.change_order_status(order_number, new_status)
            
            active_orders, completed_orders = await self.get_orders_by_status()
            
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type': 'order_update',
                    'active_orders': active_orders,
                    'completed_orders': completed_orders
                }
            )
        
        # ===== ОБНОВЛЕНИЕ СПИСКА ЗАКАЗОВ =====
        elif action == 'refresh_orders':
            active_orders, completed_orders = await self.get_orders_by_status()
            clients = await self.get_all_clients()
            
            await self.send(text_data=json.dumps({
                'type': 'order_update',
                'active_orders': active_orders,
                'completed_orders': completed_orders,
                'clients': clients
            }))
    
    async def order_update(self, event):
        """Отправляет обновление заказов клиенту."""
        active_orders = event['active_orders']
        completed_orders = event['completed_orders']
        
        await self.send(text_data=json.dumps({
            'type': 'order_update',
            'active_orders': active_orders,
            'completed_orders': completed_orders
        }))
    
    async def clients_update(self, event):
        """Отправляет обновление списка клиентов."""
        clients = event['clients']
        
        await self.send(text_data=json.dumps({
            'type': 'clients_update',
            'clients': clients
        }))
    
    # ===== ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ ДЛЯ РАБОТЫ С БАЗОЙ ДАННЫХ =====
    
    @database_sync_to_async
    def add_order_with_client(self, client_id, description, ready_datetime_str):
        """
        Добавляет заказ с клиентом из базы данных.
        Это теперь единственный способ добавления заказов.
        """
        try:
            # Получаем клиента по ID
            client = Client.objects.get(id=client_id)
            
            # ВАЖНО: Клиент вводит время в московском часовом поясе (локальное время браузера)
            # Преобразуем строку формата 'YYYY-MM-DDTHH:MM' в объект datetime
            
            # 1. Создаем naive datetime (без информации о часовом поясе) из строки
            ready_dt_naive = datetime.strptime(ready_datetime_str, '%Y-%m-%dT%H:%M')
            
            # 2. Предполагаем, что это московское время (так как клиент вводит в московском поясе)
            # Получаем московский часовой пояс из настроек Django
            moscow_tz = timezone.get_current_timezone()  # Вернет 'Europe/Moscow' если в настройках TIME_ZONE = 'Europe/Moscow'
            
            # 3. Делаем naive datetime aware (с часовым поясом) в московском времени
            ready_dt_moscow = timezone.make_aware(ready_dt_naive, moscow_tz)
            
            # 4. Конвертируем московское время в UTC для хранения в базе данных
            ready_dt_utc = ready_dt_moscow.astimezone(timezone.utc)
            
            # 5. Создаем заказ с клиентом из базы
            order = Order.objects.create(
                client=client,  # Клиент всегда из базы
                description=description,
                ready_datetime=ready_dt_utc  # Сохраняем в UTC
            )
            
            print(f"📝 Создан заказ №{order.order_number} для клиента {client.name}")
            
        except Client.DoesNotExist:
            print(f"⚠️ Клиент с ID {client_id} не найден")
            raise  # Пробрасываем исключение дальше
        except Exception as e:
            print(f"❌ Ошибка при создании заказа: {e}")
            raise  # Пробрасываем исключение дальше
    
    @database_sync_to_async
    def add_client(self, name, phone, email, uses_edo, notes):
        """Добавляет нового клиента в БД."""
        client = Client.objects.create(
            name=name,
            phone=phone,
            email=email,
            uses_edo=uses_edo,
            notes=notes
        )
        return client
    
    @database_sync_to_async
    def update_order(self, order_number, description, ready_datetime_str):
        """
        Обновляет существующий заказ.
        Теперь не обновляем customer_name, так как клиент всегда из базы.
        """
        try:
            order = Order.objects.get(order_number=int(order_number))
            
            # Обновляем только описание и дату готовности
            order.description = description
            
            # ВАЖНО: Та же логика конвертации времени, что и при создании заказа
            
            # 1. Создаем naive datetime из строки
            ready_dt_naive = datetime.strptime(ready_datetime_str, '%Y-%m-%dT%H:%M')
            
            # 2. Получаем московский часовой пояс
            moscow_tz = timezone.get_current_timezone()
            
            # 3. Делаем naive datetime aware в московском времени
            ready_dt_moscow = timezone.make_aware(ready_dt_naive, moscow_tz)
            
            # 4. Конвертируем в UTC для хранения в базе данных
            ready_dt_utc = ready_dt_moscow.astimezone(timezone.utc)
            
            order.ready_datetime = ready_dt_utc
            order.save()
            
        except Order.DoesNotExist:
            print(f"⚠️ Заказ №{order_number} не найден")
        except Exception as e:
            print(f"❌ Ошибка при обновлении заказа: {e}")
    
    @database_sync_to_async
    def change_order_status(self, order_number, new_status):
        """Изменяет статус заказа."""
        try:
            order = Order.objects.get(order_number=int(order_number))
            
            valid_statuses = [status[0] for status in Order.STATUS_CHOICES]
            
            if new_status in valid_statuses:
                order.status = new_status
                order.save()
                
        except Order.DoesNotExist:
            print(f"⚠️ Заказ №{order_number} не найден")
    
    @database_sync_to_async
    def delete_order(self, order_number):
        """Удаляет заказ из базы данных."""
        try:
            order = Order.objects.get(order_number=int(order_number))
            order.delete()
            print(f"🗑️ Удален заказ №{order_number}")
            
        except Order.DoesNotExist:
            print(f"⚠️ Заказ №{order_number} не найден")
    
    @database_sync_to_async
    def get_orders_by_status(self):
        """Получает все заказы, разделенные на активные и выполненные."""
        all_orders = Order.objects.all()
        
        active_orders = []
        completed_orders = []
        
        for order in all_orders:
            order_dict = order.to_dict()
            
            if order.status == Order.STATUS_COMPLETED:
                completed_orders.append(order_dict)
            else:
                active_orders.append(order_dict)
        
        return active_orders, completed_orders
    
    @database_sync_to_async
    def get_all_clients(self):
        """Получает всех клиентов из БД."""
        clients = Client.objects.all().order_by('name')
        return [client.to_dict() for client in clients]