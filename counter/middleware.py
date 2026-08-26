"""
counter/middleware.py
Промежуточное ПО (middleware) для аутентификации WebSocket соединений.
Использует стандартный механизм сессий Django.
"""

from channels.middleware import BaseMiddleware
from channels.db import database_sync_to_async
from django.contrib.auth.models import AnonymousUser
from django.contrib.auth import get_user_model

User = get_user_model()


class WebSocketAuthMiddleware(BaseMiddleware):
    """
    Middleware для аутентификации WebSocket соединений.
    Извлекает пользователя из сессии Django.
    """
    
    async def __call__(self, scope, receive, send):
        """
        Основной метод middleware. Вызывается для каждого WebSocket соединения.
        """
        
        # Получаем объект сессии из scope
        session = scope.get('session', None)
        
        if session:
            # Если сессия существует, асинхронно получаем пользователя из неё
            user = await self.get_user_from_session(session)
            scope['user'] = user
        else:
            # Если сессии нет, используем анонимного пользователя
            scope['user'] = AnonymousUser()
        
        # Передаём управление следующему middleware или consumer
        return await super().__call__(scope, receive, send)
    
    @database_sync_to_async
    def get_user_from_session(self, session):
        """
        Асинхронно получает пользователя из сессии Django.
        """
        try:
            # Получаем ID пользователя из сессии (стандартный ключ Django)
            user_id = session.get('_auth_user_id')
            
            if user_id:
                # Находим пользователя в базе данных по ID
                return User.objects.get(id=user_id)
        except (User.DoesNotExist, KeyError, ValueError):
            # Если пользователь не найден или произошла ошибка,
            # возвращаем анонимного пользователя
            pass
        
        return AnonymousUser()