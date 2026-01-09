#!/usr/bin/env python
"""
Скрипт для исправления миграций только для приложения devices
"""

import os
import sys
import subprocess
from pathlib import Path

# Добавляем путь к проекту в PYTHONPATH
project_root = Path(__file__).parent.absolute()
sys.path.insert(0, str(project_root))

# Импортируем Django settings
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'clickcounter.settings')

import django
django.setup()

def print_step(message):
    """Красиво отображает шаг выполнения"""
    print(f"\n{'='*60}")
    print(f" {message}")
    print(f"{'='*60}")

def run_command(command, check=True):
    """Запускает команду и выводит результат"""
    print(f"\nВыполняю команду: {command}")
    try:
        result = subprocess.run(command, shell=True, check=check, capture_output=True, text=True)
        if result.stdout:
            print(f"Результат: {result.stdout}")
        return True
    except subprocess.CalledProcessError as e:
        print(f"❌ Ошибка при выполнении команды: {e}")
        if e.stderr:
            print(f"Детали ошибки: {e.stderr}")
        return False

def main():
    """Основная функция"""
    print_step("ИСПРАВЛЕНИЕ МИГРАЦИЙ ДЛЯ ПРИЛОЖЕНИЯ DEVICES")
    
    try:
        # 1. Удаляем старые миграции devices
        print_step("1. Удаление старых миграций devices")
        devices_migrations = project_root / 'devices' / 'migrations'
        if devices_migrations.exists():
            migration_files = list(devices_migrations.glob('*.py'))
            for migration_file in migration_files:
                if migration_file.name != '__init__.py':
                    migration_file.unlink()
                    print(f"Удален файл: {migration_file}")
        
        # 2. Создаем новые миграции для devices
        print_step("2. Создание новых миграций для devices")
        if not run_command("python manage.py makemigrations devices"):
            print("❌ Не удалось создать миграции для devices")
            return
        
        # 3. Применяем миграции
        print_step("3. Применение миграций")
        if not run_command("python manage.py migrate"):
            print("❌ Не удалось применить миграции")
            return
        
        print_step("✅ МИГРАЦИИ УСПЕШНО ИСПРАВЛЕНЫ")
        
    except KeyboardInterrupt:
        print("\n\n❌ Операция прервана пользователем")
    except Exception as e:
        print(f"\n\n❌ Неожиданная ошибка: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()