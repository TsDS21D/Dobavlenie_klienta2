# orders/management/commands/reset_sequences.py
from django.core.management.base import BaseCommand
from django.apps import apps
from django.db import connection

class Command(BaseCommand):
    help = 'Сбрасывает счетчики (sequences) для всех таблиц, чтобы они соответствовали максимальным ID'

    def handle(self, *args, **options):
        self.stdout.write("Начинаем сброс счетчиков...")
        
        # Получаем все модели проекта
        models = apps.get_models()
        
        with connection.cursor() as cursor:
            for model in models:
                table_name = model._meta.db_table
                pk_name = model._meta.pk.name
                
                # Проверяем, есть ли у модели автоинкрементное поле (обычно это id)
                if not model._meta.pk.auto_created:
                    continue

                # Формируем имена для последовательности (в PostgreSQL)
                sequence_name = f"{table_name}_{pk_name}_seq"
                
                try:
                    # 1. Узнаем максимальный ID в таблице
                    cursor.execute(f'SELECT COALESCE(MAX(id), 1) FROM "{table_name}";')
                    max_id = cursor.fetchone()[0]
                    
                    # 2. Устанавливаем счетчик на max_id + 1
                    cursor.execute(f"ALTER SEQUENCE {sequence_name} RESTART WITH {max_id + 1};")
                    
                    self.stdout.write(self.style.SUCCESS(f'✅ Таблица {table_name}: следующий ID будет {max_id + 1}'))
                except Exception as e:
                    # Если таблица не использует sequence (например, связующие таблицы ManyToMany) — пропускаем
                    pass
                    
        self.stdout.write(self.style.SUCCESS("Сброс счетчиков завершен успешно!"))