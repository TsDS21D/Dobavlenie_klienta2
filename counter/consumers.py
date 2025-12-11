"""
consumers.py
WebSocket обработчики для реального обновления данных.
Обеспечивают двустороннюю связь между сервером и клиентами.
"""

import json  # Модуль для работы с JSON форматом
from channels.generic.websocket import AsyncWebsocketConsumer  # Базовый класс для WebSocket
from channels.db import database_sync_to_async  # Декоратор для работы с БД в асинхронном коде
from .models import Order  # Импорт модели Order
from django.utils import timezone  # Для работы с датами и временем


class OrderConsumer(AsyncWebsocketConsumer):
    """
    OrderConsumer - обработчик WebSocket соединений для системы заказов.
    Наследуется от AsyncWebsocketConsumer для асинхронной работы.
    
    Основные методы:
    - connect: вызывается при подключении клиента
    - disconnect: вызывается при отключении клиента
    - receive: вызывается при получении сообщения от клиента
    - order_update: вызывается при отправке обновления в группу
    """
    
    async def connect(self):
        """
        Метод вызывается при установке WebSocket соединения от браузера.
        Здесь мы:
        1. Принимаем соединение
        2. Добавляем клиента в группу для рассылки обновлений
        3. Отправляем текущее состояние заказов
        """
        
        # Имя группы для рассылки сообщений всем подключенным клиентам
        # Все клиенты, подписанные на эту группу, получают одинаковые сообщения
        self.room_group_name = 'orders'
        
        # Добавляем текущее соединение (канал) в группу
        # self.channel_name - уникальное имя канала для этого соединения
        await self.channel_layer.group_add(
            self.room_group_name,  # Имя группы
            self.channel_name      # Имя канала этого соединения
        )
        
        # Принимаем WebSocket соединение
        # После этого можно отправлять и получать сообщения
        await self.accept()
        
        # Получаем все заказы из базы данных
        # Разделяем на активные и выполненные для удобства клиента
        active_orders, completed_orders = await self.get_orders_by_status()
        
        # Отправляем начальные данные клиенту при подключении
        await self.send(text_data=json.dumps({
            'type': 'initial_load',           # Тип сообщения: начальная загрузка
            'active_orders': active_orders,    # Список активных заказов
            'completed_orders': completed_orders  # Список выполненных заказов
        }))
    
    async def disconnect(self, close_code):
        """
        Метод вызывается при закрытии WebSocket соединения.
        
        Параметры:
        - close_code: код закрытия соединения (может быть использован для логирования)
        
        Здесь мы удаляем клиента из группы, чтобы не отправлять ему сообщения
        после отключения.
        """
        await self.channel_layer.group_discard(
            self.room_group_name,  # Имя группы
            self.channel_name      # Имя канала для удаления
        )
    
    async def receive(self, text_data):
        """
        Метод вызывается при получении сообщения от клиента через WebSocket.
        
        Параметры:
        - text_data: текстовые данные от клиента (обычно JSON строка)
        
        Здесь мы:
        1. Парсим JSON сообщение
        2. Определяем тип действия (action)
        3. Выполняем соответствующую операцию
        4. Рассылаем обновления всем клиентам в группе
        """
        
        # Парсим JSON строку в словарь Python
        data = json.loads(text_data)
        
        # Получаем тип действия из сообщения
        action = data.get('action')
        
        # ===== ДОБАВЛЕНИЕ НОВОГО ЗАКАЗА =====
        if action == 'add_order':
            # Извлекаем данные о заказе из сообщения
            customer_name = data.get('customer_name')      # Имя клиента
            description = data.get('description')          # Описание заказа
            ready_datetime_str = data.get('ready_datetime')  # Дата готовности
            
            # Добавляем новый заказ в базу данных
            # Статус по умолчанию будет 'accepted' (определено в модели)
            await self.add_order(customer_name, description, ready_datetime_str)
            
            # Получаем обновлённые списки заказов
            active_orders, completed_orders = await self.get_orders_by_status()
            
            # Рассылаем обновление всем подключенным клиентам
            await self.channel_layer.group_send(
                self.room_group_name,  # Группа получателей
                {
                    'type': 'order_update',      # Тип события для обработчика
                    'active_orders': active_orders,    # Активные заказы
                    'completed_orders': completed_orders  # Выполненные заказы
                }
            )
        
        # ===== УДАЛЕНИЕ ЗАКАЗА =====
        elif action == 'delete_order':
            # Получаем номер заказа для удаления
            order_number = data.get('order_number')
            
            # Удаляем заказ из базы данных
            await self.delete_order(order_number)
            
            # Получаем обновлённые списки заказов
            active_orders, completed_orders = await self.get_orders_by_status()
            
            # Рассылаем обновление всем клиентам
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
            # Извлекаем все данные для обновления
            order_number = data.get('order_number')        # Номер изменяемого заказа
            customer_name = data.get('customer_name')      # Новое имя клиента
            description = data.get('description')          # Новое описание
            ready_datetime_str = data.get('ready_datetime')  # Новая дата готовности
            
            # Обновляем заказ в базе данных
            await self.update_order(order_number, customer_name, description, ready_datetime_str)
            
            # Получаем обновлённые списки заказов
            active_orders, completed_orders = await self.get_orders_by_status()
            
            # Рассылаем обновление всем клиентам
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
            # Извлекаем номер заказа и новый статус
            order_number = data.get('order_number')
            new_status = data.get('status')
            
            # Меняем статус заказа
            await self.change_order_status(order_number, new_status)
            
            # Получаем обновлённые списки заказов
            active_orders, completed_orders = await self.get_orders_by_status()
            
            # Рассылаем обновление всем клиентам
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type': 'order_update',
                    'active_orders': active_orders,
                    'completed_orders': completed_orders
                }
            )
        
        # ===== ОБНОВЛЕНИЕ СПИСКА ЗАКАЗОВ (ПЕРЕСЧЁТ РАБОЧИХ ЧАСОВ) =====
        elif action == 'refresh_orders':
            # Клиент запросил обновление (например, для пересчёта рабочих часов)
            active_orders, completed_orders = await self.get_orders_by_status()
            
            # Отправляем обновление только этому клиенту (не всей группе)
            await self.send(text_data=json.dumps({
                'type': 'order_update',
                'active_orders': active_orders,
                'completed_orders': completed_orders
            }))
    
    async def order_update(self, event):
        """
        Метод вызывается при отправке сообщения в группу (через group_send).
        Отправляет обновление данных конкретному клиенту.
        
        Параметры:
        - event: словарь с данными события, переданный в group_send
        
        Здесь мы:
        1. Извлекаем данные из события
        2. Отправляем их текущему клиенту через WebSocket
        """
        
        # Извлекаем данные из события
        active_orders = event['active_orders']        # Список активных заказов
        completed_orders = event['completed_orders']  # Список выполненных заказов
        
        # Отправляем данные клиенту в формате JSON
        await self.send(text_data=json.dumps({
            'type': 'order_update',           # Тип сообщения: обновление заказов
            'active_orders': active_orders,    # Активные заказы
            'completed_orders': completed_orders  # Выполненные заказы
        }))
    
    # ===== ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ ДЛЯ РАБОТЫ С БАЗОЙ ДАННЫХ =====
    
    @database_sync_to_async
    def add_order(self, customer_name, description, ready_datetime_str):
        """
        Добавляет новый заказ в базу данных.
        Декоратор @database_sync_to_async позволяет вызывать синхронный
        код работы с БД в асинхронном контексте.
        
        Параметры:
        - customer_name: имя клиента
        - description: описание заказа
        - ready_datetime_str: строка с датой готовности в формате ISO
        
        Создаёт новый объект Order и сохраняет его в БД.
        Статус устанавливается автоматически (по умолчанию 'accepted').
        """
        
        # Преобразуем строку даты в объект datetime
        # fromisoformat() парсит строку в формате "YYYY-MM-DDTHH:MM"
        ready_dt_naive = timezone.datetime.fromisoformat(ready_datetime_str)
        
        # Проверяем, содержит ли дата информацию о часовом поясе
        # Если нет (naive datetime), добавляем текущий часовой пояс
        if ready_dt_naive.tzinfo is None:
            ready_dt = timezone.make_aware(ready_dt_naive)
        else:
            ready_dt = ready_dt_naive
        
        # Создаём и сохраняем заказ в базе данных
        # Order.objects.create() создаёт объект и сразу сохраняет его
        order = Order.objects.create(
            customer_name=customer_name,
            description=description,
            ready_datetime=ready_dt
            # Статус будет установлен автоматически как 'accepted' (default)
        )
        
        return order  # Возвращаем созданный объект
    
    @database_sync_to_async
    def update_order(self, order_number, customer_name, description, ready_datetime_str):
        """
        Обновляет существующий заказ в базе данных.
        
        Параметры:
        - order_number: номер заказа для обновления
        - customer_name: новое имя клиента
        - description: новое описание заказа
        - ready_datetime_str: новая дата готовности
        
        Находит заказ по номеру и обновляет его поля.
        """
        try:
            # Находим заказ по номеру
            # Order.objects.get() возвращает объект или вызывает исключение
            order = Order.objects.get(order_number=order_number)
            
            # Обновляем поля заказа
            order.customer_name = customer_name
            order.description = description
            
            # Преобразуем строку даты в объект datetime
            ready_dt_naive = timezone.datetime.fromisoformat(ready_datetime_str)
            if ready_dt_naive.tzinfo is None:
                ready_dt = timezone.make_aware(ready_dt_naive)
            else:
                ready_dt = ready_dt_naive
            
            order.ready_datetime = ready_dt
            
            # Сохраняем изменения в базе данных
            order.save()
            
        except Order.DoesNotExist:
            # Если заказ не найден - игнорируем ошибку
            # В реальном приложении можно залогировать это событие
            pass
    
    @database_sync_to_async
    def change_order_status(self, order_number, new_status):
        """
        Изменяет статус заказа.
        
        Параметры:
        - order_number: номер заказа
        - new_status: новый статус (accepted, in_progress, ready, completed)
        
        Проверяет, что новый статус является допустимым значением.
        """
        try:
            # Находим заказ по номеру
            order = Order.objects.get(order_number=order_number)
            
            # Проверяем, что новый статус допустим
            # Создаём список допустимых статусов из STATUS_CHOICES
            valid_statuses = [status[0] for status in Order.STATUS_CHOICES]
            
            if new_status in valid_statuses:
                # Если статус допустим - обновляем
                order.status = new_status
                order.save()
            else:
                # Если статус недопустим - можно выбросить исключение или залогировать
                print(f"Недопустимый статус: {new_status}")
                
        except Order.DoesNotExist:
            # Заказ не найден
            pass
    
    @database_sync_to_async
    def delete_order(self, order_number):
        """
        Удаляет заказ из базы данных.
        
        Параметры:
        - order_number: номер заказа для удаления
        
        Находит заказ по номеру и удаляет его.
        """
        try:
            # Находим заказ по номеру
            order = Order.objects.get(order_number=order_number)
            
            # Удаляем заказ из базы данных
            order.delete()
            
        except Order.DoesNotExist:
            # Если заказ не найден - ничего не делаем
            pass
    
    @database_sync_to_async
    def get_orders_by_status(self):
        """
        Получает все заказы из базы данных и разделяет их на:
        1. Активные (статусы: accepted, in_progress, ready)
        2. Выполненные (статус: completed)
        
        Возвращает: кортеж (active_orders, completed_orders)
        """
        
        # Получаем ВСЕ заказы из базы данных
        all_orders = Order.objects.all()
        
        # Разделяем заказы по статусу
        active_orders = []
        completed_orders = []
        
        for order in all_orders:
            # Преобразуем объект Order в словарь с помощью метода to_dict()
            order_dict = order.to_dict()
            
            # Разделяем по статусу
            if order.status == Order.STATUS_COMPLETED:
                # Выполненные заказы
                completed_orders.append(order_dict)
            else:
                # Активные заказы (все остальные статусы)
                active_orders.append(order_dict)
        
        return active_orders, completed_orders