"""
apps.py - Конфигурация приложения calculator
Этот файл создается автоматически Django при создании приложения.
Он определяет конфигурацию приложения calculator.
"""

from django.apps import AppConfig


class CalculatorConfig(AppConfig):
    """
    Класс конфигурации приложения Calculator.
    
    Этот класс определяет настройки приложения:
    - name: имя приложения, которое Django использует для идентификации
    - default_auto_field: тип поля для автоматического создания первичных ключей
    """
    
    # Имя приложения - должно совпадать с именем папки приложения
    default_auto_field = 'django.db.models.BigAutoField'
    
    # Имя приложения, которое Django использует для поиска шаблонов,
    # статических файлов и других ресурсов
    name = 'calculator'
    
    def ready(self):
        """
        Регистрация сигналов при запуске приложения.
        """
        import calculator.signals