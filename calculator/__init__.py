"""
calculator/__init__.py
Файл инициализации пакета calculator.

Этот файл обеспечивает корректный импорт моделей и других компонентов.
В частности, он гарантирует, что модели будут доступны при импорте calculator.models.
"""

# Версия приложения
__version__ = '1.0.0'
__author__ = 'Типография Beauty-Print'
__description__ = 'Приложение для расчета стоимости заказов типографии'

# Импортируем основные компоненты для удобного доступа
from .apps import CalculatorConfig

# Экспортируем конфигурацию приложения
default_app_config = 'calculator.apps.CalculatorConfig'

print(f"Приложение Calculator {__version__} инициализировано")