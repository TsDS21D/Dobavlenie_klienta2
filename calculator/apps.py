"""
calculator/apps.py
Конфигурация приложения Calculator для Django.
Определяет метаданные приложения и его поведение.
"""

from django.apps import AppConfig  # Базовый класс для конфигурации приложений


class CalculatorConfig(AppConfig):
    """
    Класс конфигурации для приложения Calculator.
    
    Attributes:
        default_auto_field (str): Тип поля для автоматически создаваемых первичных ключей
        name (str): Имя приложения (должно совпадать с именем папки)
    """
    default_auto_field = 'django.db.models.BigAutoField'  # Современный тип для автоинкрементных полей
    name = 'calculator'  # Имя приложения (используется Django для идентификации)