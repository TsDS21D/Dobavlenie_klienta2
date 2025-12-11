"""
clickcounter/asgi.py
Конфигурация ASGI для проекта clickcounter.
Она настраивает обработку HTTP и WebSocket соединений.
"""

import os
import django

# 1. ВЫПОЛНЯЕМ ПЕРВОЙ СТРОКОЙ: настраиваем Django
# Устанавливаем переменную окружения для настроек Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'clickcounter.settings')

# 2. Инициализируем Django (это загружает все приложения и настройки)
django.setup()

# 3. ТОЛЬКО ПОСЛЕ инициализации Django импортируем остальные модули
from django.core.asgi import get_asgi_application
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.auth import AuthMiddlewareStack
from channels.sessions import SessionMiddlewareStack
from counter.routing import websocket_urlpatterns

# Получаем стандартное Django ASGI приложение для обработки HTTP
django_asgi_app = get_asgi_application()

# Основное ASGI приложение, которое распределяет соединения по протоколам
application = ProtocolTypeRouter({
    # HTTP запросы обрабатываются стандартным Django приложением
    "http": django_asgi_app,
    
    # WebSocket соединения проходят через стек middleware:
    # 1. SessionMiddlewareStack: добавляет поддержку сессий Django
    # 2. AuthMiddlewareStack: добавляет аутентификацию пользователя
    # 3. URLRouter: маршрутизирует соединения по URL
    "websocket": SessionMiddlewareStack(
        AuthMiddlewareStack(
            URLRouter(
                websocket_urlpatterns
            )
        )
    ),
})