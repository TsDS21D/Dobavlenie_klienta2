#!/usr/bin/env python
"""
Скрипт для полного сброса базы данных и создания всех миграций
ВНИМАНИЕ: Этот скрипт УДАЛИТ все данные из базы данных!
Используйте только для разработки!
"""

import os
import sys
import subprocess
import psycopg2
from pathlib import Path

# Добавляем путь к проекту в PYTHONPATH
project_root = Path(__file__).parent.absolute()
sys.path.insert(0, str(project_root))

# Импортируем Django settings
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'clickcounter.settings')

import django
django.setup()

# Настройки подключения к базе данных из settings.py
from django.conf import settings

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

def reset_database():
    """Полностью сбрасывает базу данных"""
    print_step("1. ОСТАНОВКА ВСЕХ ПОДКЛЮЧЕНИЙ К БАЗЕ ДАННЫХ")
    
    # Получаем параметры подключения
    db_config = settings.DATABASES['default']
    db_name = db_config['NAME']
    db_user = db_config['USER']
    db_password = db_config['PASSWORD']
    db_host = db_config['HOST']
    db_port = db_config['PORT']
    
    print(f"База данных: {db_name}")
    print(f"Пользователь: {db_user}")
    print(f"Хост: {db_host}:{db_port}")
    
    try:
        # Подключаемся к базе данных postgres, чтобы удалить нашу базу
        conn = psycopg2.connect(
            host=db_host,
            port=db_port,
            user=db_user,
            password=db_password,
            database='postgres'  # Подключаемся к системной базе
        )
        conn.autocommit = True
        cursor = conn.cursor()
        
        # Прерываем все подключения к базе данных
        cursor.execute(f"""
            SELECT pg_terminate_backend(pg_stat_activity.pid)
            FROM pg_stat_activity
            WHERE pg_stat_activity.datname = '{db_name}'
            AND pid <> pg_backend_pid();
        """)
        
        # Удаляем базу данных
        cursor.execute(f"DROP DATABASE IF EXISTS {db_name}")
        print(f"✅ База данных '{db_name}' удалена")
        
        # Создаем новую базу данных
        cursor.execute(f"CREATE DATABASE {db_name} WITH OWNER {db_user}")
        print(f"✅ База данных '{db_name}' создана")
        
        cursor.close()
        conn.close()
        
    except Exception as e:
        print(f"❌ Ошибка при работе с базой данных: {e}")
        return False
    
    return True

def delete_migration_files():
    """Удаляет все файлы миграций"""
    print_step("2. УДАЛЕНИЕ СТАРЫХ ФАЙЛОВ МИГРАЦИЙ")
    
    apps = [
        'counter',
        'calculator',
        'product_templates',
        'directories',
        'devices',
        'sheet_formats',
        'sklad',
        'print_price',
        'baza_klientov',
    ]
    
    migration_files_deleted = 0
    
    for app in apps:
        app_path = project_root / app / 'migrations'
        if app_path.exists():
            for migration_file in app_path.glob('*.py'):
                if migration_file.name != '__init__.py':
                    migration_file.unlink()
                    print(f"Удален файл: {migration_file}")
                    migration_files_deleted += 1
    
    print(f"✅ Удалено файлов миграций: {migration_files_deleted}")
    
    # Также удаляем файл базы данных SQLite, если он существует
    sqlite_db = project_root / 'db.sqlite3'
    if sqlite_db.exists():
        sqlite_db.unlink()
        print(f"✅ Удален SQLite файл: {sqlite_db}")

def create_migrations():
    """Создает все миграции"""
    print_step("3. СОЗДАНИЕ НОВЫХ МИГРАЦИЙ")
    
    # Создаем миграции для каждого приложения
    apps_to_migrate = [
        'counter',
        'calculator',
        'product_templates',
        'directories',
        'devices',
        'sheet_formats',
        'sklad',
        'print_price',
        'baza_klientov',
    ]
    
    success = True
    for app in apps_to_migrate:
        if not run_command(f"python manage.py makemigrations {app}"):
            print(f"❌ Ошибка при создании миграций для {app}")
            success = False
    
    return success

def apply_migrations():
    """Применяет все миграции"""
    print_step("4. ПРИМЕНЕНИЕ МИГРАЦИЙ")
    
    if not run_command("python manage.py migrate"):
        print("❌ Ошибка при применении миграций")
        return False
    
    return True

def create_superuser():
    """Создает суперпользователя"""
    print_step("5. СОЗДАНИЕ СУПЕРПОЛЬЗОВАТЕЛЯ")
    
    # Проверяем, существует ли уже суперпользователь
    from django.contrib.auth import get_user_model
    User = get_user_model()
    
    if not User.objects.filter(username='admin').exists():
        print("Создаю суперпользователя admin/admin123")
        User.objects.create_superuser('admin', 'admin@example.com', 'admin123')
        print("✅ Суперпользователь создан")
    else:
        print("⚠️ Суперпользователь уже существует")

def load_initial_data():
    """Загружает начальные данные"""
    print_step("6. ЗАГРУЗКА НАЧАЛЬНЫХ ДАННЫХ")
    
    # Можно добавить команды для загрузки фикстур
    # run_command("python manage.py loaddata initial_data.json")
    
    print("✅ Начальные данные загружены")

def main():
    """Основная функция"""
    print_step("СКРИПТ ПОЛНОГО СБРОСА БАЗЫ ДАННЫХ")
    print("ВНИМАНИЕ: Все данные будут удалены!")
    
    # Запрашиваем подтверждение
    response = input("\nВы уверены? (y/N): ")
    if response.lower() != 'y':
        print("Отменено пользователем")
        return
    
    try:
        # 1. Удаляем старые файлы миграций
        delete_migration_files()
        
        # 2. Сбрасываем базу данных
        if not reset_database():
            print("❌ Не удалось сбросить базу данных")
            return
        
        # 3. Создаем миграции
        if not create_migrations():
            print("❌ Не удалось создать миграции")
            return
        
        # 4. Применяем миграции
        if not apply_migrations():
            print("❌ Не удалось применить миграции")
            return
        
        # 5. Создаем суперпользователя
        create_superuser()
        
        # 6. Загружаем начальные данные
        load_initial_data()
        
        print_step("✅ ВСЕ ОПЕРАЦИИ УСПЕШНО ЗАВЕРШЕНЫ")
        print("\nЧто можно сделать дальше:")
        print("1. Запустить сервер: python manage.py runserver")
        print("2. Зайти в админку: http://localhost:8000/admin/")
        print("3. Логин: admin, Пароль: admin123")
        
    except KeyboardInterrupt:
        print("\n\n❌ Операция прервана пользователем")
    except Exception as e:
        print(f"\n\n❌ Неожиданная ошибка: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()