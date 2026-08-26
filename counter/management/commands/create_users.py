"""
counter/management/commands/create_users.py
Команда Django для создания тестовых пользователей.
Используйте: python manage.py create_users
"""

from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
from counter.models import UserProfile


class Command(BaseCommand):
    """
    Команда для создания тестовых пользователей.
    """
    
    help = 'Создает тестовых пользователей для системы управления заказами'
    
    def handle(self, *args, **options):
        """
        Основной метод команды.
        """
        
        # Список пользователей для создания
        users_data = [
            {
                'username': 'admin',
                'email': 'admin@bukva-a.ru',
                'password': 'admin123',
                'first_name': 'Александр',
                'last_name': 'Администратор',
                'department': 'Администрация',
                'phone': '+7 (999) 123-45-67',
            },
            {
                'username': 'manager',
                'email': 'manager@bukva-a.ru',
                'password': 'manager123',
                'first_name': 'Мария',
                'last_name': 'Менеджер',
                'department': 'Отдел продаж',
                'phone': '+7 (999) 234-56-78',
            },
            {
                'username': 'printer',
                'email': 'printer@bukva-a.ru',
                'password': 'printer123',
                'first_name': 'Иван',
                'last_name': 'Печатник',
                'department': 'Производство',
                'phone': '+7 (999) 345-67-89',
            },
            {
                'username': 'designer',
                'email': 'designer@bukva-a.ru',
                'password': 'designer123',
                'first_name': 'Ольга',
                'last_name': 'Дизайнер',
                'department': 'Дизайн',
                'phone': '+7 (999) 456-78-90',
            },
        ]
        
        created_count = 0
        
        for user_data in users_data:
            # Проверяем, существует ли пользователь
            if not User.objects.filter(username=user_data['username']).exists():
                # Создаем пользователя
                user = User.objects.create_user(
                    username=user_data['username'],
                    email=user_data['email'],
                    password=user_data['password'],
                    first_name=user_data['first_name'],
                    last_name=user_data['last_name'],
                    is_staff=True,  # Даем доступ к админ-панели
                )
                
                # Создаем профиль пользователя
                profile = UserProfile.objects.create(
                    user=user,
                    department=user_data['department'],
                    phone_number=user_data['phone'],
                )
                
                self.stdout.write(
                    self.style.SUCCESS(f'✅ Создан пользователь: {user.username} ({user.first_name} {user.last_name})')
                )
                created_count += 1
            else:
                self.stdout.write(
                    self.style.WARNING(f'⚠️ Пользователь {user_data["username"]} уже существует')
                )
        
        # Создаем суперпользователя (если еще не создан)
        if not User.objects.filter(username='superadmin').exists():
            superuser = User.objects.create_superuser(
                username='superadmin',
                email='superadmin@bukva-a.ru',
                password='superadmin123',
                first_name='Супер',
                last_name='Админ',
            )
            
            UserProfile.objects.create(
                user=superuser,
                department='Техническая поддержка',
                phone_number='+7 (999) 000-00-00',
            )
            
            self.stdout.write(
                self.style.SUCCESS('✅ Создан суперпользователь: superadmin (пароль: superadmin123)')
            )
            created_count += 1
        
        self.stdout.write(
            self.style.SUCCESS(f'\n🎉 Создано пользователей: {created_count}')
        )
        self.stdout.write(
            self.style.NOTICE('\n🔐 Данные для входа:')
        )
        self.stdout.write(
            self.style.NOTICE('  admin / admin123     - Администратор')
        )
        self.stdout.write(
            self.style.NOTICE('  manager / manager123 - Менеджер')
        )
        self.stdout.write(
            self.style.NOTICE('  superadmin / superadmin123 - Суперпользователь')
        )