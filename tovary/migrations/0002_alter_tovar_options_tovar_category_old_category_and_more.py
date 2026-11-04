# tovary/migrations/0002_alter_tovar_options_tovar_category_old_category_and_more.py
"""
Переход с CharField-категории на дерево mptt.

Шаги:
  1. Переименовать старое поле `category` (CharField) в `category_old`.
  2. Создать модель Category (mptt).
  3. Добавить новое поле `category` — TreeForeignKey на Category (nullable).
  4. Data-миграция: для каждого товара с непустым `category_old`
     создать/найти Category с таким именем и присвоить FK.
"""

import mptt

from django.db import migrations, models
import django.db.models.deletion
import mptt.fields


def migrate_categories_forward(apps, schema_editor):
    """
    Переносит старые строковые категории в дерево.
    """
    Tovar = apps.get_model('tovary', 'Tovar')
    Category = apps.get_model('tovary', 'Category')

    # ВАЖНО: регистрируем историческую модель в mptt.
    # Без этого Category.save() не заполнит lft/rght/tree_id/level,
    # и мы получим IntegrityError о NULL в lft.
    mptt.register(Category)

    # 1. Собираем уникальные имена категорий.
    distinct_names = (
        Tovar.objects
        .exclude(category_old='')
        .values_list('category_old', flat=True)
        .distinct()
    )

    name_to_category = {}
    for raw_name in distinct_names:
        name = (raw_name or '').strip()
        if not name:
            continue
        if name in name_to_category:
            continue
        # Теперь get_or_create использует MPTT-менеджер и корректно
        # вычисляет lft/rght.
        category, _created = Category.objects.get_or_create(
            name=name,
            defaults={'parent': None},
        )
        name_to_category[name] = category

    # 2. Привязываем товары к категориям.
    for tovar in Tovar.objects.exclude(category_old=''):
        name = (tovar.category_old or '').strip()
        if not name:
            continue
        category = name_to_category.get(name)
        if category is None:
            continue
        tovar.category = category
        tovar.save(update_fields=['category'])


def migrate_categories_backward(apps, schema_editor):
    """
    Обратная миграция: из FK-категории обратно в строку `category_old`.
    """
    Tovar = apps.get_model('tovary', 'Tovar')

    for tovar in Tovar.objects.select_related('category').all():
        if tovar.category_id:
            tovar.category_old = tovar.category.name
            tovar.save(update_fields=['category_old'])


class Migration(migrations.Migration):

    dependencies = [
        ('tovary', '0001_initial'),
    ]

    operations = [
        migrations.RenameField(
            model_name='tovar',
            old_name='category',
            new_name='category_old',
        ),
        migrations.AlterField(
            model_name='tovar',
            name='category_old',
            field=models.CharField(
                blank=True,
                default='',
                max_length=100,
                verbose_name='Категория (старая, строка)',
            ),
        ),
        migrations.CreateModel(
            name='Category',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=100, verbose_name='Название')),
                ('is_deleted', models.BooleanField(default=False, verbose_name='Удалена')),
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='Дата создания')),
                ('updated_at', models.DateTimeField(auto_now=True, verbose_name='Дата обновления')),
                ('lft', models.PositiveIntegerField(editable=False)),
                ('rght', models.PositiveIntegerField(editable=False)),
                ('tree_id', models.PositiveIntegerField(db_index=True, editable=False)),
                ('level', models.PositiveIntegerField(editable=False)),
                ('parent', mptt.fields.TreeForeignKey(
                    blank=True,
                    help_text='Если не указана — категория корневая',
                    null=True,
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='children',
                    to='tovary.category',
                    verbose_name='Родительская категория',
                )),
            ],
            options={
                'verbose_name': 'Категория товаров',
                'verbose_name_plural': 'Категории товаров',
            },
        ),
        migrations.AddField(
            model_name='tovar',
            name='category',
            field=mptt.fields.TreeForeignKey(
                blank=True,
                help_text='Категория из дерева',
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='tovary',
                to='tovary.category',
                verbose_name='Категория',
            ),
        ),
        migrations.AlterModelOptions(
            name='tovar',
            options={
                'ordering': ['name', 'id'],
                'verbose_name': 'Товар',
                'verbose_name_plural': 'Товары',
            },
        ),
        migrations.RunPython(
            migrate_categories_forward,
            migrate_categories_backward,
        ),
    ]