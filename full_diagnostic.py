# full_diagnostic.py
import os
import sys
import subprocess
import pkgutil

print("🔍 ПОЛНАЯ ДИАГНОСТИКА СИСТЕМЫ")
print("=" * 80)

# 1. Информация о Python
print("\n1. ИНФОРМАЦИЯ О PYTHON:")
print(f"   Исполняемый файл: {sys.executable}")
print(f"   Версия: {sys.version}")
print(f"   Архитектура: {'64-bit' if sys.maxsize > 2**32 else '32-bit'}")
print(f"   Префикс: {sys.prefix}")
print(f"   Базовый префикс: {sys.base_prefix}")

# 2. Пути Python
print("\n2. ПУТИ PYTHON (sys.path):")
for i, path in enumerate(sys.path[:10]):  # Покажем первые 10
    print(f"   {i}: {path}")

# 3. Проверка установки pip
print("\n3. ПРОВЕРКА PIP:")
try:
    result = subprocess.run(
        [sys.executable, "-m", "pip", "--version"],
        capture_output=True,
        text=True
    )
    print(f"   {result.stdout.strip()}")
except Exception as e:
    print(f"   ❌ Ошибка: {e}")

# 4. Поиск psycopg2 в системе
print("\n4. ПОИСК PSYCOPG2 В СИСТЕМЕ:")

# Ищем в sys.path
found = False
for path in sys.path:
    if os.path.exists(path):
        # Ищем папки с psycopg
        for item in os.listdir(path):
            if 'psycopg' in item.lower():
                full_path = os.path.join(path, item)
                if os.path.exists(full_path):
                    print(f"   Найден: {full_path}")
                    if os.path.isdir(full_path):
                        print(f"     Тип: папка")
                        # Покажем несколько файлов внутри
                        try:
                            files = os.listdir(full_path)[:5]
                            for f in files:
                                print(f"       📄 {f}")
                        except:
                            pass
                    else:
                        print(f"     Тип: файл")
                    found = True

if not found:
    print("   ❌ psycopg2 не найден ни в одном пути sys.path")

# 5. Проверка через pkgutil
print("\n5. ПРОВЕРКА ЧЕРЕЗ PKGUTIL:")
for importer, modname, ispkg in pkgutil.iter_modules():
    if 'psycopg' in modname:
        print(f"   Найден модуль: {modname} (пакет: {ispkg})")

# 6. Попытка импорта разными способами
print("\n6. ПОПЫТКА ИМПОРТА:")

# Способ 1: Обычный импорт
try:
    import psycopg2
    print("   ✅ import psycopg2 - УСПЕХ")
    print(f"      Путь: {psycopg2.__file__}")
except ImportError as e:
    print(f"   ❌ import psycopg2 - ОШИБКА: {e}")

# Способ 2: Импорт через __import__
try:
    psycopg2 = __import__('psycopg2')
    print("   ✅ __import__('psycopg2') - УСПЕХ")
except ImportError as e:
    print(f"   ❌ __import__('psycopg2') - ОШИБКА: {e}")

# Способ 3: Импорт из pkgutil
print("\n7. ПОИСК МОДУЛЯ ЧЕРЕЗ PKGUTIL.ITER_MODULES:")
for finder, name, ispkg in pkgutil.iter_modules():
    if name == 'psycopg2':
        print(f"   Найден: {name}, можно импортировать")
        try:
            module = finder.find_module(name).load_module(name)
            print(f"      ✅ Модуль загружен: {module}")
        except Exception as e:
            print(f"      ❌ Ошибка загрузки: {e}")

# 8. Проверка версии pip и установленных пакетов
print("\n8. УСТАНОВЛЕННЫЕ ПАКЕТЫ (с psycopg):")
try:
    result = subprocess.run(
        [sys.executable, "-m", "pip", "list"],
        capture_output=True,
        text=True
    )
    for line in result.stdout.split('\n'):
        if 'psycopg' in line.lower():
            print(f"   {line}")
except Exception as e:
    print(f"   ❌ Ошибка: {e}")

print("\n" + "=" * 80)
print("💡 ВЫВОДЫ И РЕКОМЕНДАЦИИ:")