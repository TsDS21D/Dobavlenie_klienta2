#!/usr/bin/env python
"""
Скрипт для автоматического исправления имён столбцов в таблице vichisliniya_listov_data.
Запуск: python fix_columns.py
"""

import os
import sys
import django

# Настройка Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'clickcounter.settings')
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Инициализация Django
django.setup()

from django.db import connection

def get_current_columns():
    """Получает текущие столбцы таблицы"""
    with connection.cursor() as cursor:
        cursor.execute("""
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns 
            WHERE table_name = 'vichisliniya_listov_data'
            ORDER BY ordinal_position;
        """)
        columns = cursor.fetchall()
    
    return {col[0]: {'type': col[1], 'nullable': col[2]} for col in columns}

def get_expected_columns():
    """Возвращает ожидаемые столбцы из модели"""
    from vichisliniya_listov.models import VichisliniyaListovModel
    
    expected_columns = {}
    for field in VichisliniyaListovModel._meta.fields:
        expected_columns[field.name] = {
            'type': field.db_type(connection),
            'verbose_name': field.verbose_name
        }
    
    return expected_columns

def fix_column_names():
    """Исправляет имена столбцов в таблице"""
    print("🔧 ИСПРАВЛЕНИЕ ИМЁН СТОЛБЦОВ В ТАБЛИЦЕ")
    print("="*60)
    
    # Получаем текущие и ожидаемые столбцы
    current_columns = get_current_columns()
    expected_columns = get_expected_columns()
    
    print(f"📊 Текущих столбцов: {len(current_columns)}")
    print(f"📊 Ожидаемых столбцов: {len(expected_columns)}")
    
    # Создаём карту переименования (предполагаем, что текущие без префикса)
    rename_map = {}
    
    for expected_name in expected_columns.keys():
        # Пытаемся найти соответствующий столбец без префикса
        # Убираем префикс 'vichisliniya_listov_'
        simple_name = expected_name.replace('vichisliniya_listov_', '')
        
        if simple_name in current_columns:
            rename_map[simple_name] = expected_name
    
    if not rename_map:
        print("ℹ️  Столбцы для переименования не найдены")
        return
    
    print(f"\n📋 Найдено столбцов для переименования: {len(rename_map)}")
    
    # Выводим план переименования
    for old_name, new_name in rename_map.items():
        print(f"   📝 {old_name} → {new_name}")
    
    # Подтверждение
    response = input("\n⚠️  Выполнить переименование столбцов? (y/N): ")
    if response.lower() != 'y':
        print("❌ Операция отменена")
        return
    
    # Выполняем переименование
    with connection.cursor() as cursor:
        for old_name, new_name in rename_map.items():
            try:
                # Для PostgreSQL
                sql = f'ALTER TABLE vichisliniya_listov_data RENAME COLUMN "{old_name}" TO "{new_name}";'
                cursor.execute(sql)
                print(f"✅ Переименован: {old_name} → {new_name}")
            except Exception as e:
                print(f"❌ Ошибка при переименовании {old_name}: {e}")
    
    print("\n✅ Переименование завершено!")
    
    # Проверяем результат
    print("\n🔍 Проверка результата...")
    new_columns = get_current_columns()
    print(f"📊 Столбцов после переименования: {len(new_columns)}")
    
    # Проверяем соответствие ожидаемым
    missing_columns = []
    for expected_name in expected_columns.keys():
        if expected_name not in new_columns:
            missing_columns.append(expected_name)
    
    if missing_columns:
        print(f"⚠️  Отсутствующие столбцы: {missing_columns}")
    else:
        print("🎉 Все столбцы соответствуют модели!")

def create_missing_columns():
    """Создаёт отсутствующие столбцы"""
    print("\n🔧 СОЗДАНИЕ ОТСУТСТВУЮЩИХ СТОЛБЦОВ")
    print("="*60)
    
    current_columns = get_current_columns()
    expected_columns = get_expected_columns()
    
    missing_columns = []
    for expected_name, expected_info in expected_columns.items():
        if expected_name not in current_columns:
            missing_columns.append((expected_name, expected_info))
    
    if not missing_columns:
        print("ℹ️  Отсутствующие столбцы не найдены")
        return
    
    print(f"📋 Найдено отсутствующих столбцов: {len(missing_columns)}")
    
    for col_name, col_info in missing_columns:
        print(f"   ❌ {col_name} ({col_info['type']})")
    
    response = input("\n⚠️  Создать отсутствующие столбцы? (y/N): ")
    if response.lower() != 'y':
        print("❌ Операция отменена")
        return
    
    # Создаём SQL для каждого отсутствующего столбца
    with connection.cursor() as cursor:
        for col_name, col_info in missing_columns:
            try:
                # Определяем тип данных для SQL
                data_type = col_info['type']
                
                # Для DecimalField нужно указать точность
                if 'numeric' in data_type:
                    # Уже содержит точность, например: numeric(10, 2)
                    sql = f'ALTER TABLE vichisliniya_listov_data ADD COLUMN "{col_name}" {data_type};'
                elif 'integer' in data_type:
                    sql = f'ALTER TABLE vichisliniya_listov_data ADD COLUMN "{col_name}" INTEGER;'
                elif 'character varying' in data_type:
                    sql = f'ALTER TABLE vichisliniya_listov_data ADD COLUMN "{col_name}" VARCHAR({col_info.get("max_length", 255)});'
                elif 'timestamp' in data_type:
                    sql = f'ALTER TABLE vichisliniya_listov_data ADD COLUMN "{col_name}" TIMESTAMP WITH TIME ZONE;'
                else:
                    sql = f'ALTER TABLE vichisliniya_listov_data ADD COLUMN "{col_name}" {data_type};'
                
                cursor.execute(sql)
                print(f"✅ Создан столбец: {col_name} ({data_type})")
            except Exception as e:
                print(f"❌ Ошибка при создании столбца {col_name}: {e}")

def check_table_constraints():
    """Проверяет и создаёт ограничения таблицы"""
    print("\n🔧 ПРОВЕРКА ОГРАНИЧЕНИЙ ТАБЛИЦЫ")
    print("="*60)
    
    with connection.cursor() as cursor:
        # Проверяем уникальное ограничение
        cursor.execute("""
            SELECT constraint_name
            FROM information_schema.table_constraints
            WHERE table_name = 'vichisliniya_listov_data'
            AND constraint_type = 'UNIQUE';
        """)
        unique_constraints = cursor.fetchall()
        
        if unique_constraints:
            print(f"✅ Уникальные ограничения: {[c[0] for c in unique_constraints]}")
        else:
            print("⚠️  Уникальное ограничение не найдено")
            
            response = input("Создать уникальное ограничение для proschet_id? (y/N): ")
            if response.lower() == 'y':
                try:
                    cursor.execute("""
                        ALTER TABLE vichisliniya_listov_data
                        ADD CONSTRAINT unique_vichisliniya_listov_proschet 
                        UNIQUE (vichisliniya_listov_proschet_id);
                    """)
                    print("✅ Уникальное ограничение создано")
                except Exception as e:
                    print(f"❌ Ошибка: {e}")

def main():
    print("="*60)
    print("🔧 КОМПЛЕКСНОЕ ИСПРАВЛЕНИЕ СТРУКТУРЫ ТАБЛИЦЫ")
    print("="*60)
    
    # 1. Проверяем текущее состояние
    current_columns = get_current_columns()
    if not current_columns:
        print("❌ Таблица 'vichisliniya_listov_data' не существует или пуста")
        return
    
    print(f"📊 Текущая структура таблицы:")
    for col_name, col_info in current_columns.items():
        print(f"   • {col_name}: {col_info['type']}")
    
    # 2. Исправляем имена столбцов
    fix_column_names()
    
    # 3. Создаём отсутствующие столбцы
    create_missing_columns()
    
    # 4. Проверяем ограничения
    check_table_constraints()
    
    # 5. Финальная проверка
    print("\n" + "="*60)
    print("🎯 ФИНАЛЬНАЯ ПРОВЕРКА")
    print("="*60)
    
    final_columns = get_current_columns()
    expected_columns = get_expected_columns()
    
    all_good = True
    for expected_name in expected_columns.keys():
        if expected_name in final_columns:
            print(f"✅ {expected_name}")
        else:
            print(f"❌ {expected_name} - ОТСУТСТВУЕТ")
            all_good = False
    
    if all_good:
        print("\n🎉 ВСЕ ПРОБЛЕМЫ УСТРАНЕНЫ!")
        print("   Таблица полностью соответствует модели.")
    else:
        print("\n⚠️  Остались проблемы. Рекомендуется:")
        print("   1. Удалить таблицу и создать заново")
        print("   2. Или вручную исправить оставшиеся столбцы")

if __name__ == "__main__":
    main()