from django.db import migrations

class Migration(migrations.Migration):

    dependencies = [
        ('calculator', '0030_printcomponent_color_mode'),
    ]

    operations = [
        migrations.RunSQL(
            sql='ALTER TABLE calculator_printcomponent DROP COLUMN IF EXISTS color;',
            reverse_sql='ALTER TABLE calculator_printcomponent ADD COLUMN color varchar(10);',
        ),
    ]