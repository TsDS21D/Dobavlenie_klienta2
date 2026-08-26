# fix_migrations.py
"""
Скрипт для исправления миграций и очистки данных.
"""

import os
import sys
import django
from pathlib import Path

# Настройка Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'clickcounter.settings')
django.setup()

from django.db import connection
from django.core.management import execute_from_command_line

def delete_all_printcomponents():
    """Удаляет все компоненты печати из базы данных."""
    try:
        print("🔍 Подключение к базе данных...")
        
        with connection.cursor() as cursor:
            # Проверяем, существует ли таблица
            cursor.execute("""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_name = 'calculator_printcomponent'
                );
            """)
            table_exists = cursor.fetchone()[0]
            
            if table_exists:
                print("📋 Таблица calculator_printcomponent найдена.")
                
                # Получаем количество записей
                cursor.execute("SELECT COUNT(*) FROM calculator_printcomponent")
                count = cursor.fetchone()[0]
                print(f"📊 Найдено записей: {count}")
                
                if count > 0:
                    print("🗑️ Удаляем все компоненты печати...")
                    cursor.execute("DELETE FROM calculator_printcomponent")
                    print(f"✅ Удалено {count} записей.")
                else:
                    print("✅ Таблица уже пуста.")
            else:
                print("⚠️ Таблица calculator_printcomponent не существует.")
                
    except Exception as e:
        print(f"❌ Ошибка: {e}")

def fix_migration_files():
    """Исправляет файлы миграций."""
    migrations_dir = Path("calculator/migrations")
    
    if not migrations_dir.exists():
        print("❌ Папка calculator/migrations не найдена!")
        return
    
    print(f"🔍 Проверяем папку миграций: {migrations_dir}")
    
    # Список файлов для удаления (миграции после 0008)
    files_to_delete = []
    for file in migrations_dir.glob("*.py"):
        if file.name.startswith(("0009_", "0010_", "0011_", "0012_")):
            files_to_delete.append(file)
    
    if files_to_delete:
        print(f"🗑️ Удаляем проблемные миграции ({len(files_to_delete)} файлов)...")
        for file in files_to_delete:
            try:
                file.unlink()
                print(f"  ✅ Удален: {file.name}")
            except Exception as e:
                print(f"  ❌ Ошибка удаления {file.name}: {e}")
    else:
        print("✅ Нет проблемных файлов миграций для удаления.")
    
    # Создаем __init__.py если его нет
    init_file = migrations_dir / "__init__.py"
    if not init_file.exists():
        print(f"📄 Создаем {init_file}...")
        init_file.touch()

def check_printer_table():
    """Проверяет, есть ли принтеры в базе данных."""
    try:
        with connection.cursor() as cursor:
            cursor.execute("""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_name = 'devices_printer'
                );
            """)
            table_exists = cursor.fetchone()[0]
            
            if table_exists:
                cursor.execute("SELECT COUNT(*) FROM devices_printer")
                count = cursor.fetchone()[0]
                print(f"📊 Принтеров в базе: {count}")
                
                if count == 0:
                    print("⚠️ ВНИМАНИЕ: В базе нет ни одного принтера!")
                    print("  Создайте хотя бы один принтер через админку или скрипт.")
            else:
                print("❌ Таблица devices_printer не существует!")
                print("  Убедитесь, что приложение devices имеет примененные миграции.")
                
    except Exception as e:
        print(f"⚠️ Ошибка при проверке таблицы принтеров: {e}")

def main():
    print("=" * 50)
    print("СКРИПТ ДЛЯ ИСПРАВЛЕНИЯ МИГРАЦИЙ")
    print("=" * 50)
    
    # Шаг 1: Удаляем данные
    print("\n🚀 ШАГ 1: Очистка данных PrintComponent")
    print("-" * 30)
    delete_all_printcomponents()
    
    # Шаг 2: Проверяем принтеры
    print("\n🚀 ШАГ 2: Проверка таблицы принтеров")
    print("-" * 30)
    check_printer_table()
    
    # Шаг 3: Исправляем миграции
    print("\n🚀 ШАГ 3: Исправление файлов миграций")
    print("-" * 30)
    fix_migration_files()
    
    print("\n" + "=" * 50)
    print("СКРИПТ ЗАВЕРШЕН")
    print("=" * 50)
    
    print("\n📋 ДАЛЬНЕЙШИЕ ДЕЙСТВИЯ:")
    print("1. Создайте миграции: python manage.py makemigrations calculator")
    print("2. Примените миграции: python manage.py migrate calculator")
    print("3. Создайте тестовый принтер через админку /admin/devices/printer/")

if __name__ == "__main__":
    main()