# shablony_proschetov/routing.py
"""
WebSocket-маршруты приложения "Справочник шаблонов просчётов".

Подключается в clickcounter/asgi.py:
    shablony_proschetov.routing.websocket_urlpatterns

Имя файла и переменной (websocket_urlpatterns) совпадает
с counter/routing.py, proschety/routing.py и orders/routing.py —
чтобы итоговый URLRouter собирался единообразно.
"""

from django.urls import re_path
from . import consumers

# Паттерн: /ws/shablony/
websocket_urlpatterns = [
    re_path(r'^ws/shablony/$', consumers.ShablonyConsumer.as_asgi()),
]