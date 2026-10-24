# orders/routing.py
"""
WebSocket URL маршруты для приложения orders.
"""

from django.urls import re_path
from . import consumers

websocket_urlpatterns = [
    # Подключаемся по адресу ws/orders/
    re_path(r'^ws/orders/?$', consumers.OrdersConsumer.as_asgi()),
]