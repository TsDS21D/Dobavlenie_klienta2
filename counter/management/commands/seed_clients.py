"""
counter/management/commands/seed_clients.py
Команда для создания тестовых клиентов.
"""

from django.core.management.base import BaseCommand
from counter.models import Client


class Command(BaseCommand):
    help = 'Создает тестовых клиентов для системы управления заказами'
    
    def handle(self, *args, **options):
        clients_data = [
            {
                'name': 'ООО "ТехноПринт"',
                'phone': '+7 (495) 123-45-67',
                'email': 'info@technoprint.ru',
                'uses_edo': True,
                'notes': 'Крупный корпоративный клиент, заказывает ежегодные отчеты'
            },
            {
                'name': 'ИП Иванов Иван Иванович',
                'phone': '+7 (926) 111-22-33',
                'email': 'ivanov@mail.ru',
                'uses_edo': False,
                'notes': 'Частный предприниматель, заказывает визитки и листовки'
            },
            {
                'name': 'Рекламное агентство "Креатив"',
                'phone': '+7 (499) 555-66-77',
                'email': 'creativ@agency.com',
                'uses_edo': True,
                'notes': 'Агентство, регулярно заказывает полиграфию для клиентов'
            },
            {
                'name': 'ГБУ "Школа №123"',
                'phone': '+7 (495) 777-88-99',
                'email': 'school123@edu.ru',
                'uses_edo': False,
                'notes': 'Государственное учреждение, заказывает бланки и учебные материалы'
            },
            {
                'name': 'Кафе "Уютное место"',
                'phone': '+7 (903) 444-55-66',
                'email': 'cafe@cozyplace.ru',
                'uses_edo': False,
                'notes': 'Заказывает меню и рекламные материалы'
            },
        ]
        
        created_count = 0
        
        for client_data in clients_data:
            if not Client.objects.filter(name=client_data['name']).exists():
                Client.objects.create(**client_data)
                self.stdout.write(
                    self.style.SUCCESS(f'✅ Создан клиент: {client_data["name"]}')
                )
                created_count += 1
            else:
                self.stdout.write(
                    self.style.WARNING(f'⚠️ Клиент {client_data["name"]} уже существует')
                )
        
        self.stdout.write(
            self.style.SUCCESS(f'\n🎉 Создано клиентов: {created_count}')
        )