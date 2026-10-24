# orders/consumers.py
"""
WebSocket-консьюмер приложения "Заказы".

Устроен аналогично proschety/consumers.py и counter/consumers.py.
Все открытые вкладки /orders/ подключаются к одной группе "orders_list".
При любых изменениях (создание, редактирование, удаление) сервер шлёт
сюда событие, а консьюмер — пересылает его всем участникам группы.
"""

import json
from channels.generic.websocket import AsyncWebsocketConsumer


class OrdersConsumer(AsyncWebsocketConsumer):
    """
    Асинхронный обработчик WebSocket-соединений для списка заказов.
    """

    async def connect(self):
        """Устанавливает соединение и подписывает на группу."""
        user = self.scope.get('user')
        
        # Проверка авторизации (как в proschety)
        if not user or not user.is_authenticated:
            await self.close()
            return

        self.room_group_name = 'orders_list'

        # Подписываемся на группу
        await self.channel_layer.group_add(
            self.room_group_name,
            self.channel_name
        )

        await self.accept()

    async def disconnect(self, close_code):
        """Отписывается от группы при разрыве соединения."""
        await self.channel_layer.group_discard(
            self.room_group_name,
            self.channel_name
        )

    async def order_event(self, event):
        """
        Метод вызывается через channel_layer.group_send с type='order_event'.
        Пересылает данные клиенту.
        """
        await self.send(text_data=json.dumps({
            'type': 'order_event',
            'event': event.get('event'),
            'order_id': event.get('order_id'),
            'order_number': event.get('order_number', ''),
            'actor_session_key': event.get('actor_session_key', ''),
            'actor_username': event.get('actor_username', ''),
        }))