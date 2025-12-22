"""
apps.py для приложения sheet_formats
Конфигурация приложения sheet_formats для системы управления форматами листов
"""

from django.apps import AppConfig


class SheetFormatsConfig(AppConfig):
    """
    Конфигурация приложения sheet_formats
    
    Attributes:
        default_auto_field (str): Тип поля по умолчанию для автоматических первичных ключей
        name (str): Имя приложения (используется Django для идентификации)
        verbose_name (str): Человеко-читаемое имя для отображения в админ-панели
    """
    
    # Указываем тип поля для автоматически создаваемых первичных ключей
    default_auto_field = 'django.db.models.BigAutoField'
    
    # Имя приложения (должно соответствовать имени папки приложения)
    name = 'sheet_formats'
    
    # Человеко-читаемое имя приложения (отображается в админ-панели)
    verbose_name = 'Форматы печатных листов'