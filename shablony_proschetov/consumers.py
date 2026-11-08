# shablony_proschetov/consumers.py
"""
WebSocket-консьюмер приложения "Справочник шаблонов просчётов".

Устроен по образцу orders/consumers.py:
- все открытые вкладки /shablony/ подключаются к одной группе "shablony";
- при изменениях (создание, обновление поля, смена категории, удаление)
  бэкенд (см. utils.send_template_event) шлёт в группу сообщение;
- консьюмер пересылает его всем участникам группы.

Клиент (index.js) сравнивает actor_session_key со своим и игнорирует
собственные события — то же поведение, что и на /proschety/ и /orders/.
"""

import json
from channels.generic.websocket import AsyncWebsocketConsumer


class ShablonyConsumer(AsyncWebsocketConsumer):
    """
    Асинхронный обработчик WebSocket-соединений для страницы /shablony/.
    """

    async def connect(self):
        """Устанавливает соединение и подписывает на группу."""
        user = self.scope.get('user')

        # Проверка авторизации (как в orders/proschety).
        if not user or not user.is_authenticated:
            await self.close()
            return

        # Имя группы должно совпадать с utils.GROUP_NAME = 'shablony'.
        self.group_name = 'shablony'

        # Подписываемся на группу.
        await self.channel_layer.group_add(
            self.group_name,
            self.channel_name
        )

        await self.accept()

    async def disconnect(self, close_code):
        """Отписывается от группы при разрыве соединения."""
        # Проверяем, что группа была назначена
        # (т.е. connect() не упал на этапе авторизации).
        if hasattr(self, 'group_name'):
            await self.channel_layer.group_discard(
                self.group_name,
                self.channel_name
            )

    async def template_message(self, event):
        """
        Метод вызывается через channel_layer.group_send
        с type='template_message'.

        В event['payload'] — плоский dict, подготовленный
        в utils.send_template_event():
        {
            "type":             "template_event",
            "event":            "created" | "updated" | "deleted",
            "template_id":      int,
            "template_name":    str,
            "category_id":      int | None,
            "changed_field":    "name" | "comment" | "circulation" | "category" | "created" | "deleted",
            "actor_username":   str,
            "actor_session_key": str
        }

        Клиенту отправляем его как есть — фронтенд сам разберётся,
        что делать с конкретным полем.
        """
        payload = event.get('payload', {})
        await self.send(text_data=json.dumps(payload, ensure_ascii=False))