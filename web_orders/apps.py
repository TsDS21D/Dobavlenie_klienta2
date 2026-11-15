"""
Конфигурация приложения "web_orders" (Входящие заявки с сайта).
"""
from django.apps import AppConfig


class WebOrdersConfig(AppConfig):
    """
    Класс конфигурации приложения "web_orders".
    """
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'web_orders'
    verbose_name = 'Входящие заявки'