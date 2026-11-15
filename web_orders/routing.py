"""
WebSocket-маршруты приложения web_orders.

По образцу orders/routing.py. Список websocket_urlpatterns подключается
в clickcounter/asgi.py — там все приложения собираются в один URLRouter.

Адрес: ws://<host>/ws/web-orders/
(в HTTP у приложения префикс /web-orders/, здесь — ws/web-orders/)
"""

from django.urls import re_path

from . import consumers

websocket_urlpatterns = [
    # ^ws/web-orders/?$ — необязательный слэш на конце, чтобы работали
    # оба варианта адреса (со слэшем и без).
    re_path(r'^ws/web-orders/?$', consumers.WebOrdersConsumer.as_asgi()),
]