from django.db import migrations, models


def migrate_has_edo_to_status(apps, schema_editor):
    """
    Переносит данные из старого булева поля has_edo в новое edo_status.
    True -> 'connected', False -> 'none'.
    """
    LegalEntity = apps.get_model('baza_klientov', 'LegalEntity')
    for le in LegalEntity.objects.all():
        if le.has_edo:
            le.edo_status = 'connected'
        else:
            le.edo_status = 'none'
        le.save()


class Migration(migrations.Migration):

    dependencies = [
        # Теперь здесь правильное имя предыдущей миграции
        ('baza_klientov', '0005_legalentity_is_primary'),
    ]

    operations = [
        # 1. Добавляем новое поле edo_status
        migrations.AddField(
            model_name='legalentity',
            name='edo_status',
            field=models.CharField(
                choices=[
                    ('none', 'Без ЭДО'),
                    ('requested', 'Отправлен запрос'),
                    ('connected', 'Работает через ЭДО')
                ],
                default='none',
                max_length=20,
                verbose_name='Статус ЭДО'
            ),
        ),
        # 2. Переносим данные из старого поля
        migrations.RunPython(
            migrate_has_edo_to_status,
            reverse_code=migrations.RunPython.noop
        ),
        # 3. Удаляем старое поле has_edo
        migrations.RemoveField(
            model_name='legalentity',
            name='has_edo',
        ),
    ]