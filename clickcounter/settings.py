"""
Django settings for clickcounter project.
"""

from pathlib import Path
import os

# ===== ЗАГРУЗКА ПЕРЕМЕННЫХ ОКРУЖЕНИЯ ИЗ .env ФАЙЛА =====
# Сначала пытаемся загрузить dotenv, если установлен
try:
    from dotenv import load_dotenv
    load_dotenv()  # Загружает переменные из .env файла
    print("✅ dotenv загружен успешно")
except ImportError:
    print("⚠️ python-dotenv не установлен. Используются системные переменные окружения.")
    # В этом случае Django будет использовать системные переменные окружения

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent


# Quick-start development settings - unsuitable for production
# See https://docs.djangoproject.com/en/4.2/howto/deployment/checklist/

# SECURITY WARNING: keep the secret key used in production secret!
# Используем переменную окружения или резервный ключ для разработки
SECRET_KEY = os.environ.get('SECRET_KEY', 'django-insecure-4kej=1toi&@-lykpnan(d7%yctg0posv6312a60k2a0v%lr&5v')

# ===== ЛОКАЛЬНАЯ РАЗРАБОТКА - ИЗМЕНИТЕ НА False ДЛЯ PRODUCTION! =====
DEBUG = os.environ.get('DEBUG', 'True') == 'True'  # По умолчанию True для разработки

# Для локальной разработки разрешаем всем
ALLOWED_HOSTS = os.environ.get('ALLOWED_HOSTS', '*').split(',')


# Application definition
INSTALLED_APPS = [
    'daphne',
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'mptt',
    'channels',
    'counter',
    'calculator',
    'product_templates',
    'directories',
    'devices',
    'sheet_formats',
    'sklad',
    'print_price',
    'baza_klientov',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
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

# ===== CHANNEL LAYERS - ДЛЯ ЛОКАЛЬНОЙ РАЗРАБОТКИ =====
CHANNEL_LAYERS = {
    'default': {
        'BACKEND': 'channels.layers.InMemoryChannelLayer'
    }
}

# ===== БАЗА ДАННЫХ - PostgreSQL =====
DATABASES = {
    'default': {
        # Используем PostgreSQL
        'ENGINE': 'django.db.backends.postgresql',
        
        # Имя базы данных, которую создали
        'NAME': 'clickcounter_dev',
        
        # Пользователь, которого создали
        'USER': 'clickcounter_user',
        
        # Пароль, который установили
        'PASSWORD': 'dev_password_123',
        
        # Хост (localhost - если база на том же компьютере)
        'HOST': 'localhost',
        
        # Порт PostgreSQL (по умолчанию 5432)
        'PORT': '5432',
        
        # Дополнительные настройки подключения
        'OPTIONS': {
            'client_encoding': 'UTF8',  # Кодировка UTF8 для поддержки русского языка
            'connect_timeout': 30,      # Таймаут подключения 30 секунд
        },
        
        # Время жизни подключения в секундах
        'CONN_MAX_AGE': 60,  # 60 секунд для разработки
    }
}

# Если возникают проблемы с подключением, можно временно попробовать подключиться как postgres:
# DATABASES = {
#     'default': {
#         'ENGINE': 'django.db.backends.postgresql',
#         'NAME': 'clickcounter_dev',
#         'USER': 'postgres',
#         'PASSWORD': 'ВАШ_ПАРОЛЬ_POSTGRES',  # Пароль, который вы установили при установке PostgreSQL
#         'HOST': 'localhost',
#         'PORT': '5432',
#     }
# }

# Если PostgreSQL не установлен, можно временно использовать SQLite:
# DATABASES = {
#     'default': {
#         'ENGINE': 'django.db.backends.sqlite3',
#         'NAME': BASE_DIR / 'db.sqlite3',
#     }
# }

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
LANGUAGE_CODE = 'ru-ru'
TIME_ZONE = 'Europe/Moscow'
USE_I18N = True
USE_TZ = True

# Static files
STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
STATICFILES_STORAGE = 'django.contrib.staticfiles.storage.StaticFilesStorage'

# Media files
MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

# Default primary key field type
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# ===== НАСТРОЙКИ АУТЕНТИФИКАЦИИ =====
LOGIN_URL = '/counter/login/'
LOGIN_REDIRECT_URL = '/'
LOGOUT_REDIRECT_URL = '/counter/login/'
SESSION_COOKIE_AGE = 30 * 24 * 60 * 60
SESSION_EXPIRE_AT_BROWSER_CLOSE = False
SESSION_SAVE_EVERY_REQUEST = True

# ===== ЛОГИРОВАНИЕ =====
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

print(f"⚙️ Настройки загружены: DEBUG={DEBUG}, DB_NAME={DATABASES['default']['NAME']}")