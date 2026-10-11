# proschety/consumers.py
#
# WebSocket-consumer приложения proschety.
# Подключает клиента к группе proschety_list и отправляет ему события,
# которые туда прилетают (создание / удаление просчёта).

import json
from channels.generic.websocket import AsyncWebsocketConsumer


class ProschetyConsumer(AsyncWebsocketConsumer):

    async def connect(self):
        # Добавляем соединение в группу.
        await self.channel_layer.group_add('proschety_list', self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        # Отключаем соединение от группы.
        await self.channel_layer.group_discard('proschety_list', self.channel_name)

    async def proschet_event(self, event):
        """
        Обработчик события из группы.
        Отправляет клиенту JSON с данными о событии.
        """
        await self.send(text_data=json.dumps({
            'type': 'proschet_event',
            'event': event['event'],
            'proschet_id': event['proschet_id'],
            'proschet_number': event['proschet_number'],
            'proschet_title': event['proschet_title'],
            'actor_username': event['actor_username'],
            'actor_session_key': event['actor_session_key'],
        }))