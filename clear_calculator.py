#!/usr/bin/env python
"""
clear_calculator.py
Простейший скрипт для быстрой очистки базы данных просчётов.

Использование:
python clear_calculator.py
"""

import os
import sys

# Настройка Django
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.append(BASE_DIR)
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'clickcounter.settings')

try:
    import django
    django.setup()
except ImportError:
    print("Ошибка: Не удалось импортировать Django")
    sys.exit(1)

from calculator.models import Calculation, Product, PrintComponent, AdditionalWork


def clear_calculator():
    """
    Удаляет все данные из приложения calculator.
    Без подтверждения, без бэкапов - БУДЬТЕ ОСТОРОЖНЫ!
    """
    print("=" * 60)
    print("ОЧИСТКА БАЗЫ ДАННЫХ CALCULATOR")
    print("=" * 60)
    
    # Статистика перед удалением
    print(f"Просчёты: {Calculation.objects.count()}")
    print(f"Изделия: {Product.objects.count()}")
    print(f"Печатные компоненты: {PrintComponent.objects.count()}")
    print(f"Дополнительные работы: {AdditionalWork.objects.count()}")
    print("-" * 60)
    
    # Запрос подтверждения
    confirm = input("УДАЛИТЬ ВСЕ ДАННЫЕ? (введите 'DELETE' для подтверждения): ")
    
    if confirm != 'DELETE':
        print("Операция отменена")
        return
    
    # Удаление в правильном порядке
    print("Начинаю удаление...")
    
    # Используем bulk delete для скорости
    AdditionalWork.objects.all().delete()
    print("✓ Дополнительные работы удалены")
    
    PrintComponent.objects.all().delete()
    print("✓ Печатные компоненты удалены")
    
    Product.objects.all().delete()
    print("✓ Изделия удалены")
    
    Calculation.objects.all().delete()
    print("✓ Просчёты удалены")
    
    print("=" * 60)
    print("ОЧИСТКА ЗАВЕРШЕНА УСПЕШНО!")
    print("=" * 60)
    
    # Показываем статистику после удаления
    print(f"Просчёты: {Calculation.objects.count()}")
    print(f"Изделия: {Product.objects.count()}")
    print(f"Печатные компоненты: {PrintComponent.objects.count()}")
    print(f"Дополнительные работы: {AdditionalWork.objects.count()}")


if __name__ == '__main__':
    clear_calculator()