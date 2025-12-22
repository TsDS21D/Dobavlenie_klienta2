"""
Django settings for clickcounter project.
"""

from pathlib import Path
import os

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent


# Quick-start development settings - unsuitable for production
# See https://docs.djangoproject.com/en/4.2/howto/deployment/checklist/

# ===== ВАЖНО! =====
# Никогда не оставляйте такой SECRET_KEY в production!
# Сгенерируйте новый через: python -c "import secrets; print(secrets.token_urlsafe(50))"
SECRET_KEY = 'django-insecure-4kej=1toi&@-lykpnan(d7%yctg0posv6312a60k2a0v%lr&5v'

# ===== ИЗМЕНЕНИЕ 1 =====
# Для production сайта DEBUG должен быть FALSE
DEBUG = False  # Было True

ALLOWED_HOSTS = [
    'beauty-print.ru',
    'www.beauty-print.ru',
    # 'ваш_ip_адрес',  # Уберите или замените на реальный IP
    'localhost',
    '127.0.0.1'
]


# Application definition

INSTALLED_APPS = [
    'daphne',                    # ASGI-сервер для WebSocket
    'django.contrib.admin',      # Административная панель Django
    'django.contrib.auth',       # Система аутентификации и авторизации
    'django.contrib.contenttypes', # Система типов контента
    'django.contrib.sessions',   # Механизм сессий
    'django.contrib.messages',   # Система сообщений
    'django.contrib.staticfiles', # Обработка статических файлов (CSS, JS, изображения)
    'channels',                  # Поддержка WebSocket и асинхронных запросов
    'counter',                   # Приложение "Список заказов" (управление заказами)
    'calculator',                # Приложение "Калькулятор заказов"
    'product_templates',         # Приложение "Шаблоны изделий" (создали ранее)
    'directories',               # НОВОЕ ПРИЛОЖЕНИЕ: "Справочники" (базы данных оборудования, материалов и т.д.)
    'devices',
]
# Важно: порядок приложений имеет значение!
# Приложения, от которых зависят другие, должны быть выше в списке.
# Наше новое приложение directories может зависеть от counter (аутентификация),
# поэтому размещаем его после counter.


MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    # ===== ИЗМЕНЕНИЕ 2 =====
    # РАСКОММЕНТИРОВАТЬ ЭТУ СТРОКУ!
    'django.middleware.csrf.CsrfViewMiddleware',  # ← ВОТ ЭТУ СТРОЧКУ
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'clickcounter.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'clickcounter.wsgi.application'
ASGI_APPLICATION = 'clickcounter.asgi.application'

CHANNEL_LAYERS = {
    'default': {
        'BACKEND': 'channels_redis.core.RedisChannelLayer',
        'CONFIG': {
            "hosts": [('127.0.0.1', 6379)],  # Локальный Redis
            # Или через unix socket если используется:
            # "hosts": [('unix:///var/run/redis/redis.sock', 0)],
        },
    },
}

# Database
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': BASE_DIR / 'db.sqlite3',
    }
}


# Password validation
AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]


# Internationalization
LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True


# Static files
STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'

# ===== ИЗМЕНЕНИЕ 3 =====
# Добавьте вот эту строку для корректной работы static-файлов:
STATICFILES_DIRS = [
    BASE_DIR / "static",
]

# Media files
MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

# Default primary key field type
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# ===== ИЗМЕНЕНИЕ 4 - САМОЕ ВАЖНОЕ! =====
# Добавьте эти настройки CSRF и безопасности:
CSRF_TRUSTED_ORIGINS = [
    'https://beauty-print.ru',
    'https://www.beauty-print.ru',
    'http://beauty-print.ru',       # если у вас есть HTTP
    'http://www.beauty-print.ru',    # если у вас есть HTTP
]

# Для работы за прокси (если используете Nginx, Apache, Cloudflare)
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')

# Перенаправлять все HTTP запросы на HTTPS (только для production)
# Если пока тестируете, оставьте False
SECURE_SSL_REDIRECT = True  # Было закомментировано

# Безопасные куки (только для HTTPS)
CSRF_COOKIE_SECURE = True    # Было закомментировано
SESSION_COOKIE_SECURE = True # Было закомментировано

# ===== ИЗМЕНЕНИЕ 5 =====
# Добавьте для работы с HTTPS (очень важно!)
SECURE_HSTS_SECONDS = 31536000  # 1 год
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
SECURE_BROWSER_XSS_FILTER = True
SECURE_CONTENT_TYPE_NOSNIFF = True

# Logging
LOGS_DIR = os.path.join(BASE_DIR, 'logs')
if not os.path.exists(LOGS_DIR):
    os.makedirs(LOGS_DIR)

LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'handlers': {
        'console': {
            'level': 'DEBUG',
            'class': 'logging.StreamHandler',
        },
    },
    'root': {
        'handlers': ['console'],
        'level': 'INFO',
    },
}

# Authentication settings
LOGIN_URL = '/login/'
LOGIN_REDIRECT_URL = '/'
LOGOUT_REDIRECT_URL = '/login/'
SESSION_COOKIE_AGE = 30 * 24 * 60 * 60
SESSION_EXPIRE_AT_BROWSER_CLOSE = False
SESSION_SAVE_EVERY_REQUEST = True

# ===== ИЗМЕНЕНИЕ 6 =====
# Для production добавьте WhiteNoise для статических файлов:
# 1. Установите: pip install whitenoise
# 2. Добавьте в MIDDLEWARE после SecurityMiddleware:
#    'whitenoise.middleware.WhiteNoiseMiddleware',
# 3. И замените STATICFILES_STORAGE на:
#    STATICFILES_STORAGE = 'whitenoise.storage.CompressedManifestStaticFilesStorage'