# check_architecture.py
import sys
import struct

print("Архитектура системы:")
print(f"  Python: {sys.version}")
print(f"  Платформа: {sys.platform}")
print(f"  Исполняемый файл: {sys.executable}")
print(f"  Размер указателя: {struct.calcsize('P') * 8} бит")
print(f"  sys.maxsize: {sys.maxsize}")
print(f"  64-битный: {sys.maxsize > 2**32}")

# Проверка архитектуры psycopg2
import os
for path in sys.path:
    psycopg2_path = os.path.join(path, 'psycopg2')
    if os.path.exists(psycopg2_path):
        print(f"\nНайден psycopg2 в: {psycopg2_path}")
        # Проверяем файлы .pyd (бинарные модули Windows)
        for root, dirs, files in os.walk(psycopg2_path):
            for file in files:
                if file.endswith('.pyd'):
                    print(f"  Бинарный модуль: {file}")