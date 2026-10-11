# proschety/middleware.py
#
# Простое thread-local хранилище текущего запроса.
# Нужно, чтобы в сигналах post_save (которые вызываются без request)
# знать, кто именно выполнил действие. Кладём сюда user и session_key
# до view, читаем — в signals.py. Чистим после ответа.

import threading

_thread_locals = threading.local()


def get_current_user():
    """Возвращает текущего пользователя или None."""
    return getattr(_thread_locals, 'user', None)


def get_current_session_key():
    """Возвращает session_key текущего запроса или None."""
    return getattr(_thread_locals, 'session_key', None)


class CurrentUserMiddleware:
    """
    Минимальный middleware: кладёт в thread-local user и session_key
    перед view и очищает после ответа. Ничего больше не делает.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        # Сохраняем данные запроса в thread-local.
        _thread_locals.user = getattr(request, 'user', None)
        _thread_locals.session_key = (
            getattr(request.session, 'session_key', None)
            if hasattr(request, 'session') else None
        )
        try:
            response = self.get_response(request)
        finally:
            # Всегда чистим — чтобы не «протекало» между запросами.
            _thread_locals.user = None
            _thread_locals.session_key = None
        return response