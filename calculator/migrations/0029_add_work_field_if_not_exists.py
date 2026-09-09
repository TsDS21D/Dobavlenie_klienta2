# calculator/migrations/0029_add_work_field_if_not_exists.py
"""
Миграция для гарантированного добавления поля work в модель AdditionalWork.
Проверяет существование колонки work_id в таблице calculator_additionalwork.
Если колонка отсутствует, добавляет её, внешний ключ и индекс.
"""

from django.db import migrations, models
import django.db.models.deletion


def add_work_column_if_not_exists(apps, schema_editor):
    """
    Проверяет наличие колонки work_id и добавляет её, если она отсутствует.
    Использует сырой SQL для точного контроля.
    """
    # Получаем соединение с базой данных
    connection = schema_editor.connection
    with connection.cursor() as cursor:
        # Проверяем, существует ли колонка work_id в таблице calculator_additionalwork
        cursor.execute("""
            SELECT 1 
            FROM information_schema.columns 
            WHERE table_name = 'calculator_additionalwork' 
              AND column_name = 'work_id'
        """)
        column_exists = cursor.fetchone()

        if not column_exists:
            # Колонка отсутствует – добавляем её (может быть NULL)
            cursor.execute("""
                ALTER TABLE calculator_additionalwork 
                ADD COLUMN work_id integer NULL
            """)

            # Добавляем внешний ключ к таблице spravochnik_dopolnitelnyh_rabot_work
            # Имя ограничения берём из оригинальной миграции 0026 (можно изменить при необходимости)
            cursor.execute("""
                ALTER TABLE calculator_additionalwork 
                ADD CONSTRAINT calculator_addit_work_id_5f3b5d2c_fk_spravochni
                FOREIGN KEY (work_id) 
                REFERENCES spravochnik_dopolnitelnyh_rabot_work(id) 
                ON DELETE SET NULL 
                DEFERRABLE INITIALLY DEFERRED
            """)

            # Создаём индекс для ускорения запросов по work_id
            cursor.execute("""
                CREATE INDEX calculator_additionalwork_work_id_5f3b5d2c 
                ON calculator_additionalwork (work_id)
            """)

            # Если нужно, можно добавить комментарий о том, что поле было добавлено
            # (необязательно)
        else:
            # Колонка уже существует – ничего не делаем
            pass


class Migration(migrations.Migration):
    # Зависимость от последней миграции приложения calculator
    dependencies = [
        ('calculator', '0028_alter_additionalwork_price_and_more'),  # Укажите точное имя последней миграции
    ]

    operations = [
        # Выполняем нашу функцию при применении миграции
        migrations.RunPython(
            add_work_column_if_not_exists,
            reverse_code=migrations.RunPython.noop  # откат не требуется
        ),
    ]