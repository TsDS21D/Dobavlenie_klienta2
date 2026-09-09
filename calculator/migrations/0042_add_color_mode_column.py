from django.db import migrations, models

class Migration(migrations.Migration):

    dependencies = [
        ('calculator', '0041_add_print_type_column'),
    ]

    operations = [
        migrations.AddField(
            model_name='printcomponent',
            name='color_mode',
            field=models.CharField(choices=[('color', 'Цветная'), ('bw', 'Ч/б')], default='color', max_length=10, verbose_name='Режим цветности'),
        ),
    ]
