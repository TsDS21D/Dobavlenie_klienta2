"""
consumers.py
WebSocket обработчики для реального обновления данных в системе управления заказами типографии.
"""

import json
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from django.contrib.auth.models import AnonymousUser
from .models import Order, Client
from django.utils import timezone


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
            # Обработка с клиентом из базы
            if 'client_id' in data:
                client_id = data.get('client_id')
                description = data.get('description')
                ready_datetime_str = data.get('ready_datetime')
                
                await self.add_order_with_client(client_id, description, ready_datetime_str)
            # Обработка с ручным вводом клиента
            else:
                customer_name = data.get('customer_name')
                description = data.get('description')
                ready_datetime_str = data.get('ready_datetime')
                
                await self.add_order_with_customer_name(customer_name, description, ready_datetime_str)
            
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
            customer_name = data.get('customer_name')
            description = data.get('description')
            ready_datetime_str = data.get('ready_datetime')
            
            await self.update_order(order_number, customer_name, description, ready_datetime_str)
            
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
        """Добавляет заказ с клиентом из базы данных."""
        try:
            client = Client.objects.get(id=client_id)
            
            ready_dt_naive = timezone.datetime.fromisoformat(ready_datetime_str)
            if ready_dt_naive.tzinfo is None:
                ready_dt = timezone.make_aware(ready_dt_naive)
            else:
                ready_dt = ready_dt_naive
            
            order = Order.objects.create(
                client=client,
                description=description,
                ready_datetime=ready_dt
            )
            
            print(f"📝 Создан заказ №{order.order_number} для клиента {client.name}")
            
        except Client.DoesNotExist:
            print(f"⚠️ Клиент с ID {client_id} не найден")
        except Exception as e:
            print(f"❌ Ошибка при создании заказа: {e}")
    
    @database_sync_to_async
    def add_order_with_customer_name(self, customer_name, description, ready_datetime_str):
        """Добавляет заказ с ручным вводом имени клиента."""
        ready_dt_naive = timezone.datetime.fromisoformat(ready_datetime_str)
        if ready_dt_naive.tzinfo is None:
            ready_dt = timezone.make_aware(ready_dt_naive)
        else:
            ready_dt = ready_dt_naive
        
        order = Order.objects.create(
            customer_name=customer_name,
            description=description,
            ready_datetime=ready_dt
        )
        
        print(f"📝 Создан заказ №{order.order_number} для клиента {customer_name} (ручной ввод)")
    
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
    def update_order(self, order_number, customer_name, description, ready_datetime_str):
        """Обновляет существующий заказ."""
        try:
            order = Order.objects.get(order_number=int(order_number))
            
            order.customer_name = customer_name
            order.description = description
            
            ready_dt_naive = timezone.datetime.fromisoformat(ready_datetime_str)
            if ready_dt_naive.tzinfo is None:
                ready_dt = timezone.make_aware(ready_dt_naive)
            else:
                ready_dt = ready_dt_naive
            
            order.ready_datetime = ready_dt
            order.save()
            
        except Order.DoesNotExist:
            pass
    
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
            pass
    
    @database_sync_to_async
    def delete_order(self, order_number):
        """Удаляет заказ из базы данных."""
        try:
            order = Order.objects.get(order_number=int(order_number))
            order.delete()
            
        except Order.DoesNotExist:
            pass
    
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