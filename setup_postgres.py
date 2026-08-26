#!/usr/bin/env python3
"""
setup_postgres.py - скрипт настройки PostgreSQL
Простая версия без dotenv для начала
"""

import subprocess
import sys
import getpass

def run_psql_command(sql_command):
    """Выполняет SQL команду через psql."""
    try:
        # Формируем команду для подключения к PostgreSQL под пользователем postgres
        cmd = ['psql', '-U', 'postgres', '-c', sql_command]
        
        print(f"🔄 Выполняем: {sql_command}")
        
        # Запускаем команду
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=10
        )
        
        if result.returncode == 0:
            print(f"✅ Успешно")
            if result.stdout:
                print(f"   Вывод: {result.stdout.strip()}")
            return True
        else:
            print(f"❌ Ошибка: {result.stderr.strip()}")
            return False
            
    except subprocess.TimeoutExpired:
        print("❌ Таймаут при выполнении команды")
        return False
    except Exception as e:
        print(f"❌ Исключение: {e}")
        return False

def main():
    print("=" * 60)
    print("НАСТРОЙКА POSTGRESQL ДЛЯ ПРОЕКТА")
    print("=" * 60)
    
    # Параметры базы данных (можно изменить)
    db_name = input("Имя базы данных [clickcounter_dev]: ") or "clickcounter_dev"
    db_user = input("Имя пользователя [clickcounter_user]: ") or "clickcounter_user"
    db_password = getpass.getpass("Пароль пользователя: ")
    
    if not db_password:
        db_password = "dev_password_123"
        print(f"⚠️ Используется пароль по умолчанию: {db_password}")
    
    print(f"\n📋 Будут созданы:")
    print(f"   База данных: {db_name}")
    print(f"   Пользователь: {db_user}")
    print(f"   Пароль: {'*' * len(db_password)}")
    
    confirm = input("\nПродолжить? (y/n): ").lower()
    if confirm != 'y':
        print("❌ Отменено пользователем")
        return
    
    print("\n🔧 Начинаем настройку...")
    
    # 1. Создаем пользователя
    print("\n1. Создаем пользователя...")
    create_user_sql = f"CREATE USER {db_user} WITH PASSWORD '{db_password}' CREATEDB;"
    
    if not run_psql_command(create_user_sql):
        print("⚠️ Пользователь уже существует или ошибка. Продолжаем...")
    
    # 2. Создаем базу данных
    print("\n2. Создаем базу данных...")
    create_db_sql = f"""
    CREATE DATABASE {db_name}
    WITH 
    OWNER = {db_user}
    ENCODING = 'UTF8'
    LC_COLLATE = 'ru_RU.UTF-8'
    LC_CTYPE = 'ru_RU.UTF-8'
    TEMPLATE = template0;
    """
    
    if not run_psql_command(create_db_sql):
        print("⚠️ База данных уже существует или ошибка. Продолжаем...")
    
    # 3. Выдаем права
    print("\n3. Настраиваем права...")
    grant_sql = f"GRANT ALL PRIVILEGES ON DATABASE {db_name} TO {db_user};"
    run_psql_command(grant_sql)
    
    print("\n" + "=" * 60)
    print("✅ НАСТРОЙКА ЗАВЕРШЕНА!")
    print("=" * 60)
    
    print(f"\n📊 Параметры подключения для Django (settings.py):")
    print(f"""
DATABASES = {{
    'default': {{
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': '{db_name}',
        'USER': '{db_user}',
        'PASSWORD': '{db_password}',
        'HOST': 'localhost',
        'PORT': '5432',
        'OPTIONS': {{
            'client_encoding': 'UTF8',
        }},
    }}
}}
""")
    
    print("\n📝 Создайте файл .env в корне проекта со следующим содержимым:")
    print(f"""
DB_NAME={db_name}
DB_USER={db_user}
DB_PASSWORD={db_password}
DB_HOST=localhost
DB_PORT=5432
SECRET_KEY=ваш_секретный_ключ_здесь
DEBUG=True
ALLOWED_HOSTS=localhost,127.0.0.1
""")

if __name__ == "__main__":
    # Проверяем, установлен ли psql
    try:
        subprocess.run(['psql', '--version'], capture_output=True, check=True)
        main()
    except (subprocess.CalledProcessError, FileNotFoundError):
        print("❌ PostgreSQL (psql) не найден!")
        print("\n📦 Установите PostgreSQL и pgAdmin 4:")
        print("   1. Скачайте с https://www.postgresql.org/download/")
        print("   2. Установите PostgreSQL (запомните пароль для пользователя postgres)")
        print("   3. Установите pgAdmin 4")
        print("   4. Добавьте PostgreSQL в PATH при установке")
        print("\n💡 После установки перезапустите компьютер и запустите скрипт снова")
        sys.exit(1)