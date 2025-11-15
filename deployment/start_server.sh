#!/bin/bash
# Скрипт запуска Daphne сервера для Majordomo.ru

# Переход в директорию проекта
cd /home/u35459/django_app

# Активация виртуального окружения
source venv/bin/activate

# Применение миграций (если есть новые)
python manage.py migrate --noinput

# Сбор статических файлов
python manage.py collectstatic --noinput

# Запуск Daphne ASGI сервера
echo "Запуск Daphne на порту 8000..."
exec daphne -b 0.0.0.0 -p 8000 clickcounter.asgi:application
