# calculator/migrations/0021_add_missing_title_field.py
"""
ИСХОДНАЯ ВЕРСИЯ (проблемная):

    migrations.AddField(
        model_name='additionalwork',
        name='title',
        field=models.CharField(verbose_name='Название работы', max_length=200, default=''),
        preserve_default=False,
    )

ПРОБЛЕМА:
    Поле title физически уже существует в таблице
    calculator_additionalwork — оно было добавлено более ранней
    миграцией (вероятно, в 0001_initial) и не было удалено.
    На production миграция 0021 зафиксирована в django_migrations
    (применена, возможно, через --fake) и повторно не выполняется,
    поэтому ошибки не видно. Но при создании ЧИСТОЙ тестовой БД
    миграция выполняется впервые и падает с:
        DuplicateColumn: column "title" of relation
        "calculator_additionalwork" already exists.

РЕШЕНИЕ:
    SeparateDatabaseAndState —
    разделяем операции для БД и для миграционного state:

      • database_operations — no-op (RunSQL 'SELECT 1;').
        Колонка title уже есть в БД; повторно добавлять не нужно.

      • state_operations — формальный AddField('title').
        Нужно, чтобы state после применения 0021 содержал title
        (совпадал с моделью). Если title уже в state — Django
        просто перезапишет его тем же полем, без ошибки.

    Итог:
      • production — поведение не меняется
        (0021 отмечена как применённая, не выполняется повторно);
      • тестовая БД и свежие установки — 0021 проходит без ошибок;
      • state и модель остаются согласованными.
"""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('calculator', '0020_alter_additionalwork_print_component'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            # В БД ничего не делаем — колонка title уже существует.
            # 'SELECT 1;' — безопасная идемпотентная no-op операция.
            database_operations=[
                migrations.RunSQL(
                    sql='SELECT 1;',
                    reverse_sql='SELECT 1;',
                ),
            ],
            # В state формально добавляем title.
            # Если он уже там — перезапишется тем же полем.
            # Если его там нет (что маловероятно, но возможно) —
            # добавится, и state совпадёт с моделью.
            state_operations=[
                migrations.AddField(
                    model_name='additionalwork',
                    name='title',
                    field=models.CharField(
                        verbose_name='Название работы',
                        max_length=200,
                        default='',
                    ),
                    preserve_default=False,
                ),
            ],
        ),
    ]