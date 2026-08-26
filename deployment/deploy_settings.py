# Production settings для Majordomo.ru
# Добавьте эти настройки в clickcounter/settings.py или создайте отдельный файл

import os
from pathlib import Path

# Безопасность
SECRET_KEY = os.environ.get('DJANGO_SECRET_KEY', 'django-insecure-ЗАМЕНИТЕ-НА-НОВЫЙ-КЛЮЧ')
DEBUG = False
ALLOWED_HOSTS = ['beauty-print.ru', 'www.beauty-print.ru', '*.majordomo.ru', 'localhost']

# Redis Channel Layer для WebSocket
CHANNEL_LAYERS = {
    'default': {
        'BACKEND': 'channels_redis.core.RedisChannelLayer',
        'CONFIG': {
            "hosts": [('unix:///home/u35459/redis.socket', 0)],
        },
    },
}

# Альтернатива если Redis не работает (только для тестирования!)
# CHANNEL_LAYERS = {
#     'default': {
#         'BACKEND': 'channels.layers.InMemoryChannelLayer'
#     }
# }

# Статические файлы
BASE_DIR = Path(__file__).resolve().parent.parent
STATIC_URL = '/static/'
STATIC_ROOT = os.path.join(BASE_DIR, 'staticfiles')

# HTTPS/SSL
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
CSRF_COOKIE_SECURE = True
SESSION_COOKIE_SECURE = True

# Дополнительные настройки безопасности
SECURE_SSL_REDIRECT = True
SECURE_BROWSER_XSS_FILTER = True
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = 'DENY'
