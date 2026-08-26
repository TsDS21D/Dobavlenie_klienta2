# calculator/migrations/0023_add_price_field_manual.py
from django.db import migrations, models

class Migration(migrations.Migration):

    dependencies = [
        ('calculator', '0022_alter_additionalwork_title'),
    ]

    operations = [
        migrations.AddField(
            model_name='additionalwork',
            name='price',
            field=models.DecimalField(
                verbose_name='Цена',
                max_digits=10,
                decimal_places=2,
                default=0.0,
                help_text='Стоимость работы в рублях'
            ),
            preserve_default=False,
        ),
    ]