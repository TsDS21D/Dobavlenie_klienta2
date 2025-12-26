#!/usr/bin/env python
"""
check_postgres_working.py
Скрипт для проверки, что проект работает с PostgreSQL
"""

import os
import sys
import django

# Настройка Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'clickcounter.settings')
django.setup()

def main():
    from django.db import connection
    from django.conf import settings
    
    print("🔍 Проверка используемой базы данных")
    print("=" * 60)
    
    # 1. Проверка настроек
    db_config = settings.DATABASES['default']
    engine = db_config['ENGINE']
    
    print(f"1. Настройки в settings.py:")
    print(f"   ENGINE: {engine}")
    print(f"   NAME: {db_config.get('NAME')}")
    
    # 2. Проверка через connection
    print(f"\n2. Проверка через Django connection:")
    print(f"   Поставщик (vendor): {connection.vendor}")
    
    if connection.vendor == 'postgresql':
        print("   ✅ Определен как PostgreSQL")
        
        # Получаем информацию о PostgreSQL
        with connection.cursor() as cursor:
            # Версия PostgreSQL
            cursor.execute("SELECT version();")
            pg_version = cursor.fetchone()[0]
            print(f"   Версия: {pg_version.split(',')[0]}")
            
            # Текущая база данных
            cursor.execute("SELECT current_database();")
            current_db = cursor.fetchone()[0]
            print(f"   Текущая БД: {current_db}")
            
            # Количество таблиц
            cursor.execute("""
                SELECT COUNT(*) 
                FROM information_schema.tables 
                WHERE table_schema = 'public'
            """)
            table_count = cursor.fetchone()[0]
            print(f"   Таблиц в БД: {table_count}")
            
            # Список таблиц Django
            cursor.execute("""
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name LIKE 'django_%'
                ORDER BY table_name
            """)
            django_tables = cursor.fetchall()
            print(f"   Таблиц Django: {len(django_tables)}")
            
    elif connection.vendor == 'sqlite':
        print("   ❌ Определен как SQLite")
        print("   ВНИМАНИЕ: Проект использует SQLite вместо PostgreSQL!")
    else:
        print(f"   ❓ Неизвестный поставщик: {connection.vendor}")
    
    # 3. Практическая проверка - попробуем создать и прочитать данные
    print(f"\n3. Практическая проверка:")
    
    try:
        from django.contrib.auth.models import User
        from counter.models import Client, Order
        
        # Проверяем существующие данные
        users_count = User.objects.count()
        clients_count = Client.objects.count()
        orders_count = Order.objects.count()
        
        print(f"   Пользователей в БД: {users_count}")
        print(f"   Клиентов в БД: {clients_count}")
        print(f"   Заказов в БД: {orders_count}")
        
        # Попробуем создать тестовые данные
        test_client_name = "Тестовый клиент PostgreSQL"
        
        # Проверяем, есть ли уже такой клиент
        if not Client.objects.filter(name=test_client_name).exists():
            # Создаем тестового клиента
            client = Client.objects.create(
                name=test_client_name,
                phone="+7 (999) 999-99-99",
                email="test@postgresql.local",
                uses_edo=False,
                notes="Тестовый клиент для проверки PostgreSQL"
            )
            print(f"   ✅ Создан тестовый клиент: {client.name}")
            
            # Проверяем, что он сохранился
            saved_client = Client.objects.get(name=test_client_name)
            print(f"   ✅ Клиент сохранен в БД (ID: {saved_client.id})")
            
            # Удаляем тестового клиента
            saved_client.delete()
            print(f"   ✅ Тестовый клиент удален")
        else:
            print(f"   ℹ️ Тестовый клиент уже существует")
            
    except Exception as e:
        print(f"   ❌ Ошибка при работе с данными: {e}")
    
    # 4. Проверка файла SQLite
    print(f"\n4. Проверка файла SQLite:")
    
    import os
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    sqlite_path = os.path.join(base_dir, 'db.sqlite3')
    
    if os.path.exists(sqlite_path):
        size = os.path.getsize(sqlite_path)
        print(f"   Файл db.sqlite3 существует")
        print(f"   Размер: {size} байт ({size/1024:.1f} KB)")
        
        if size < 1024:  # Меньше 1KB
            print(f"   ⚠️ Файл SQLite очень маленький, вероятно пустой")
            print(f"   ✅ Это хорошо - данные хранятся в PostgreSQL")
        else:
            print(f"   ⚠️ Файл SQLite содержит данные!")
            print(f"   ❗ Возможно, проект использует SQLite вместо PostgreSQL")
    else:
        print(f"   ✅ Файл db.sqlite3 не существует")
        print(f"   ✅ Это хорошо - данные точно хранятся в PostgreSQL")
    
    print("\n" + "=" * 60)
    print("📋 ИТОГ:")
    
    if connection.vendor == 'postgresql' and not os.path.exists(sqlite_path):
        print("✅ ВСЁ ОТЛИЧНО! Проект работает с PostgreSQL")
    elif connection.vendor == 'postgresql' and os.path.exists(sqlite_path):
        print("✅ Проект работает с PostgreSQL, но файл SQLite остался")
        print("💡 Совет: Удалите db.sqlite3, если он не нужен")
    elif connection.vendor == 'sqlite':
        print("❌ ПРОБЛЕМА! Проект использует SQLite вместо PostgreSQL")
        print("💡 Решение: Проверьте настройки DATABASES в settings.py")
    else:
        print(f"❓ Непонятная ситуация: {connection.vendor}")

if __name__ == '__main__':
    main()