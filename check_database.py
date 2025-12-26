# check_database.py
import psycopg2
from django.conf import settings

print("🔍 Проверка базы данных...")

# 1. Проверяем подключение через psycopg2
try:
    conn = psycopg2.connect(
        host='localhost',
        port='5432',
        database='clickcounter_dev',
        user='clickcounter_user',
        password='dev_password_123'
    )
    print("✅ Подключение к PostgreSQL успешно")
    
    # Проверяем таблицы
    cur = conn.cursor()
    cur.execute("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'")
    tables = [table[0] for table in cur.fetchall()]
    
    print(f"📊 Найдено таблиц: {len(tables)}")
    for table in sorted(tables):
        print(f"  - {table}")
    
    # Проверяем обязательные таблицы Django
    required_tables = [
        'django_migrations',
        'django_session',
        'auth_user',
        'auth_group',
        'django_content_type',
        'django_admin_log'
    ]
    
    missing_tables = [table for table in required_tables if table not in tables]
    if missing_tables:
        print(f"⚠️ Отсутствуют таблицы: {', '.join(missing_tables)}")
        print("   Выполните: python manage.py migrate")
    else:
        print("✅ Все обязательные таблицы Django существуют")
    
    cur.close()
    conn.close()
    
except Exception as e:
    print(f"❌ Ошибка подключения: {e}")
    
# 2. Проверяем настройки Django
print("\n⚙️ Настройки Django DATABASES:")
from django.conf import settings
db_settings = settings.DATABASES['default']
print(f"  ENGINE: {db_settings.get('ENGINE')}")
print(f"  NAME: {db_settings.get('NAME')}")
print(f"  USER: {db_settings.get('USER')}")
print(f"  HOST: {db_settings.get('HOST')}")
print(f"  PORT: {db_settings.get('PORT')}")