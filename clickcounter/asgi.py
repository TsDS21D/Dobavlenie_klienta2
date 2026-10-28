"""
clickcounter/asgi.py
Конфигурация ASGI для проекта clickcounter.
Она настраивает обработку HTTP и WebSocket соединений.
"""

import os
import django

# 1. ВЫПОЛНЯЕМ ПЕРВОЙ СТРОКОЙ: настраиваем Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'clickcounter.settings')

# 2. Инициализируем Django
django.setup()

# 3. Импортируем после инициализации Django
from django.core.asgi import get_asgi_application
from django.contrib.staticfiles.handlers import ASGIStaticFilesHandler
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.auth import AuthMiddlewareStack
from channels.sessions import SessionMiddlewareStack
import counter.routing
import proschety.routing 
import orders.routing  # НОВОЕ: WebSocket-маршруты для приложения "Заказы"

# Получаем стандартное Django ASGI приложение
django_asgi_app = get_asgi_application()

# Основное ASGI приложение
application = ProtocolTypeRouter({
    # HTTP запросы обрабатываются стандартным Django приложением
    # Обернутым в ASGIStaticFilesHandler для обслуживания статических файлов
    "http": ASGIStaticFilesHandler(django_asgi_app),
    
    # WebSocket соединения
    "websocket": SessionMiddlewareStack(
        AuthMiddlewareStack(
            URLRouter(
                counter.routing.websocket_urlpatterns +
                proschety.routing.websocket_urlpatterns +
                orders.routing.websocket_urlpatterns  # НОВОЕ: добавляем маршруты заказов
            )
        )
    ),
})