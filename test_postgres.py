# test_postgres.py
import psycopg2
from psycopg2 import OperationalError

def test_connection():
    """Тестирует подключение к PostgreSQL"""
    
    print("🔍 Тестируем подключение к PostgreSQL...")
    
    # Параметры подключения (те же, что в settings.py)
    params = {
        'host': 'localhost',
        'port': '5432',
        'database': 'clickcounter_dev',
        'user': 'clickcounter_user',
        'password': 'dev_password_123'
    }
    
    print(f"Параметры подключения:")
    print(f"  Хост: {params['host']}:{params['port']}")
    print(f"  База: {params['database']}")
    print(f"  Пользователь: {params['user']}")
    
    try:
        # Пробуем подключиться
        connection = psycopg2.connect(**params)
        
        # Создаем курсор для выполнения SQL команд
        cursor = connection.cursor()
        
        # Выполняем тестовый запрос
        cursor.execute("SELECT version();")
        db_version = cursor.fetchone()
        print(f"✅ Подключение успешно!")
        print(f"   Версия PostgreSQL: {db_version[0]}")
        
        # Закрываем подключение
        cursor.close()
        connection.close()
        return True
        
    except OperationalError as e:
        print(f"❌ Ошибка подключения: {e}")
        
        # Даем подсказки по исправлению
        print("\n🔧 Возможные решения:")
        print("1. Проверьте, запущена ли служба PostgreSQL")
        print("2. Проверьте пароль пользователя clickcounter_user")
        print("3. Попробуйте подключиться как пользователь postgres:")
        
        # Тест с пользователем postgres
        try:
            postgres_params = {
                'host': 'localhost',
                'port': '5432',
                'database': 'postgres',  # Системная база
                'user': 'postgres',
                'password': input("Введите пароль пользователя postgres: ")
            }
            
            connection = psycopg2.connect(**postgres_params)
            cursor = connection.cursor()
            
            # Проверяем существование нашей базы данных
            cursor.execute("SELECT datname FROM pg_database WHERE datistemplate = false;")
            databases = [db[0] for db in cursor.fetchall()]
            print(f"✅ Подключение как postgres успешно!")
            print(f"   Доступные базы данных: {databases}")
            
            if 'clickcounter_dev' not in databases:
                print("⚠️ База данных clickcounter_dev не найдена!")
                print("   Создайте её командой: CREATE DATABASE clickcounter_dev;")
            
            cursor.close()
            connection.close()
            
        except Exception as e2:
            print(f"❌ Не удалось подключиться даже как postgres: {e2}")
        
        return False

if __name__ == "__main__":
    test_connection()