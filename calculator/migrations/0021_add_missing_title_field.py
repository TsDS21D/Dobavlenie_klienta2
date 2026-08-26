from django.db import migrations, models

class Migration(migrations.Migration):

    dependencies = [
        ('calculator', '0020_alter_additionalwork_print_component'),
    ]

    operations = [
        migrations.AddField(
            model_name='additionalwork',
            name='title',
            field=models.CharField(verbose_name='Название работы', max_length=200, default=''),
            preserve_default=False,  # ✅ правильно
        ),
    ]