# clean_migrations.py
import os
import sys
import django
from django.db import connection

# Настройка Django
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'clickcounter.settings')
django.setup()

# Удаляем таблицу devices_printer
print("Удаление таблицы devices_printer...")
try:
    with connection.cursor() as cursor:
        cursor.execute("DROP TABLE IF EXISTS devices_printer;")
        cursor.execute("DELETE FROM django_migrations WHERE app = 'devices';")
    print("Таблица удалена, миграции очищены")
except Exception as e:
    print(f"Ошибка: {e}")

# Удаляем файлы миграций в devices/migrations
migrations_dir = os.path.join(os.path.dirname(__file__), 'devices', 'migrations')
if os.path.exists(migrations_dir):
    for filename in os.listdir(migrations_dir):
        if filename.endswith('.py') and filename != '__init__.py':
            file_path = os.path.join(migrations_dir, filename)
            os.remove(file_path)
            print(f"Удален файл: {filename}")