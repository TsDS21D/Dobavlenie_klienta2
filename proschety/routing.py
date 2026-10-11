# proschety/routing.py
#
# WebSocket-маршруты приложения proschety.

from django.urls import re_path
from . import consumers

websocket_urlpatterns = [
    re_path(r'^ws/proschety/$', consumers.ProschetyConsumer.as_asgi()),
]