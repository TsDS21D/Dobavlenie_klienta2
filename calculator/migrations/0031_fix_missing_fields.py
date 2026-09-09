from django.db import migrations, models
from decimal import Decimal
import django.core.validators

class Migration(migrations.Migration):

    dependencies = [
        ('calculator', '0030_merge_20260310_0055'),  # Укажите последнюю применённую миграцию
    ]

    operations = [
        migrations.AddField(
            model_name='additionalwork',
            name='quantity',
            field=models.PositiveIntegerField(default=1, verbose_name='Количество', help_text='Количество единиц данной работы (по умолчанию 1)'),
        ),
        migrations.AddField(
            model_name='additionalwork',
            name='total_price',
            field=models.DecimalField(default=Decimal('0.00'), max_digits=10, decimal_places=2, verbose_name='Общая стоимость', validators=[django.core.validators.MinValueValidator(Decimal('0.00'))]),
        ),
        migrations.AddField(
            model_name='additionalwork',
            name='formula_type',
            field=models.PositiveSmallIntegerField(default=1, verbose_name='Формула расчёта'),
        ),
        migrations.AddField(
            model_name='additionalwork',
            name='lines_count',
            field=models.PositiveIntegerField(default=1, verbose_name='Количество линий реза'),
        ),
        migrations.AddField(
            model_name='additionalwork',
            name='items_per_sheet',
            field=models.PositiveIntegerField(default=1, verbose_name='Количество изделий на листе'),
        ),
    ]