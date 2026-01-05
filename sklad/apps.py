"""
apps.py для приложения sklad
Конфигурация приложения с древовидной структурой
"""

from django.apps import AppConfig


class SkladConfig(AppConfig):
    """
    Конфигурация приложения sklad
    """
    
    # Тип поля для автоматических первичных ключей
    default_auto_field = 'django.db.models.BigAutoField'
    
    # Имя приложения
    name = 'sklad'
    
    # Человеко-читаемое имя
    verbose_name = 'Склад материалов (древовидная структура)'
    
    def ready(self):
        """
        Вызывается при загрузке приложения
        Можно добавить сигналы или выполнить инициализацию
        """
        # import sklad.signals  # Раскомментируйте если добавите сигналы
        pass