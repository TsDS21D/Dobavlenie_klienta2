from django.db import migrations, models

class Migration(migrations.Migration):

    dependencies = [
        ('calculator', '0040_merge_20260827_0108'),
    ]

    operations = [
        migrations.AddField(
            model_name='printcomponent',
            name='print_type',
            field=models.CharField(choices=[('color', 'Цветная'), ('bw', 'Ч/б')], default='color', max_length=10, verbose_name='Тип печати'),
        ),
    ]
