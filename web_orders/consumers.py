"""
WebSocket-консьюмер приложения web_orders («Заявки с сайта»).

ЗАЧЕМ: менеджер держит страницу /web-orders/ открытой и ждёт заказы
с сайта. Без WebSocket ему пришлось бы нажимать F5, чтобы увидеть новую
заявку. С консьюмером вкладка узнаёт о ней сама.

УСТРОЙСТВО (по образцу orders/consumers.py):
    - все вкладки /web-orders/ подписываются на одну группу
      'web_orders_list';
    - когда бэкенд меняет заявку, он шлёт событие в группу;
    - консьюмер пересылает его каждому клиенту, клиент решает, что делать
      (обновить страницу, показать тост).

ПОЧЕМУ ОДНА ГРУППА НА ВСЕХ: заявок немного, а разделять их по статусам
или менеджерам смысла нет — правила «кто чью заявку видит» в проекте
пока не существует.
"""

import json

from channels.generic.websocket import AsyncWebsocketConsumer


class WebOrdersConsumer(AsyncWebsocketConsumer):
    """
    Асинхронный обработчик WebSocket для списка входящих заявок.
    """

    async def connect(self):
        """
        Устанавливает соединение и подписывает вкладку на группу.

        Анонимных не пускаем: страница заявок содержит данные клиентов.
        Проверка та же, что в OrdersConsumer.
        """
        user = self.scope.get('user')

        if not user or not user.is_authenticated:
            # close() без accept() — соединение отклоняется сразу.
            await self.close()
            return

        # Имя группы — константа: все вкладки слушают одно и то же.
        self.room_group_name = 'web_orders_list'

        await self.channel_layer.group_add(
            self.room_group_name,
            self.channel_name
        )

        await self.accept()

    async def disconnect(self, close_code):
        """
        Отписывается от группы при закрытии вкладки.

        hasattr — защита: если connect() завершился на проверке авторизации,
        room_group_name не был установлен, и обращаться к нему нельзя.
        """
        if hasattr(self, 'room_group_name'):
            await self.channel_layer.group_discard(
                self.room_group_name,
                self.channel_name
            )

    async def web_order_event(self, event):
        """
        Пересылает событие клиенту.

        Вызывается через channel_layer.group_send с type='web_order_event'.

        Поля события:
            event        — что произошло: created / updated / converted;
            web_order_id — ID заявки в ИС;
            number       — номер заказа с сайта (M-01060) для текста тоста;
            actor_tab_id — ID вкладки, инициировавшей действие. Клиент
                           сравнит его со своим и не будет показывать тост
                           о собственном действии (как в /orders/).
        """
        await self.send(text_data=json.dumps({
            'type': 'web_order_event',
            'event': event.get('event'),
            'web_order_id': event.get('web_order_id'),
            'number': event.get('number', ''),
            'actor_tab_id': event.get('actor_tab_id', ''),
        }))