#!/usr/bin/env python3
"""
check_postgres.py - проверка подключения к PostgreSQL
"""

import psycopg2
import sys

def test_postgres_connection():
    """Проверяет подключение к PostgreSQL"""
    
    # Параметры подключения (измените под свои)
    params = {
        'host': 'localhost',
        'port': '5432',
        'user': 'postgres',
        'password': 'ваш_пароль_postgres',  # Пароль, который вы установили
    }
    
    print("🔍 Проверка подключения к PostgreSQL...")
    
    try:
        # Пробуем подключиться как postgres
        conn = psycopg2.connect(**params)
        cursor = conn.cursor()
        
        # Проверяем версию
        cursor.execute("SELECT version();")
        version = cursor.fetchone()[0]
        print(f"✅ PostgreSQL подключен успешно!")
        print(f"   Версия: {version}")
        
        # Проверяем существующие базы данных
        cursor.execute("SELECT datname FROM pg_database WHERE datistemplate = false;")
        databases = [db[0] for db in cursor.fetchall()]
        print(f"   Существующие базы: {', '.join(databases)}")
        
        # Закрываем подключение
        cursor.close()
        conn.close()
        return True
        
    except psycopg2.OperationalError as e:
        print(f"❌ Ошибка подключения: {e}")
        print("\n🔧 Возможные решения:")
        print("   1. Проверьте, что PostgreSQL установлен")
        print("   2. Проверьте, что служба PostgreSQL запущена")
        print("   3. Проверьте пароль (вы вводили при установке)")
        return False
    except Exception as e:
        print(f"❌ Неизвестная ошибка: {e}")
        return False

if __name__ == "__main__":
    success = test_postgres_connection()
    sys.exit(0 if success else 1)