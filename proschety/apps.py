# proschety/apps.py
#
# Конфиг приложения "Просчёты".
# В ready() подключаем сигналы — они начнут работать сразу после
# инициализации Django.

from django.apps import AppConfig


class ProschetyConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'proschety'
    verbose_name = 'Просчёты (новая страница)'

    def ready(self):
        # Импорт сигналов. Нужен только для side-эффекта регистрации.
        from . import signals  # noqa: F401