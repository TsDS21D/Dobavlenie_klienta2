"""
Django settings for clickcounter project.
"""

from pathlib import Path
import os

# ===== ЗАГРУЗКА ПЕРЕМЕННЫХ ОКРУЖЕНИЯ ИЗ .env ФАЙЛА =====
# Пытаемся загрузить dotenv, если он установлен.
try:
    from dotenv import load_dotenv
    load_dotenv()  # Загружает переменные из .env файла
    print("✅ dotenv загружен успешно")
except ImportError:
    print("⚠️ python-dotenv не установлен. Используются системные переменные окружения.")

# Корневая папка проекта.
BASE_DIR = Path(__file__).resolve().parent.parent

# ===== БЕЗОПАСНОСТЬ =====
# Секретный ключ. На проде должен быть задан через переменную окружения.
SECRET_KEY = os.environ.get(
    'SECRET_KEY',
    'django-insecure-4kej=1toi&@-lykpnan(d7%yctg0posv6312a60k2a0v%lr&5v'
)

# Режим отладки. На сервере .env содержит DEBUG=False — значит, будет False.
# Локально, если .env нет, по умолчанию True (удобно для разработки).
DEBUG = os.environ.get('DEBUG', 'True') == 'True'

# Разрешённые хосты. На сервере .env содержит конкретный список.
ALLOWED_HOSTS = os.environ.get('ALLOWED_HOSTS', '*').split(',')

# Доверенные источники для CSRF (нужно для POST-запросов через HTTPS).
# Используется, когда проект работает за прокси-сервером (nginx) с HTTPS.
CSRF_TRUSTED_ORIGINS = [
    'https://beauty-print.ru',
    'https://www.beauty-print.ru',
]


# ===== ПРИЛОЖЕНИЯ =====
INSTALLED_APPS = [
    'daphne',
    'nested_admin',                # вложенные inlines в админке (для шаблонов просчётов)
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'mptt',                        # дерево категорий в справочнике шаблонов
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
    'vichisliniya_listov',
    'spravochnik_dopolnitelnyh_rabot',
    'shablony_proschetov',         # справочник шаблонов просчётов
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

# ===== CHANNEL LAYERS =====
CHANNEL_LAYERS = {
    'default': {
        'BACKEND': 'channels.layers.InMemoryChannelLayer'
    }
}

# ===== БАЗА ДАННЫХ (PostgreSQL) =====
# Все параметры берутся из переменных окружения.
# На сервере .env содержит DB_NAME=clickcounter_prod.
# Локально в .env — DB_NAME=clickcounter_dev.
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': os.environ.get('DB_NAME', 'clickcounter_dev'),
        'USER': os.environ.get('DB_USER', 'clickcounter_user'),
        'PASSWORD': os.environ.get('DB_PASSWORD', 'dev_password_123'),
        'HOST': os.environ.get('DB_HOST', 'localhost'),
        'PORT': os.environ.get('DB_PORT', '5432'),
        'OPTIONS': {
            'client_encoding': 'UTF8',
            'connect_timeout': 30,
        },
        'CONN_MAX_AGE': 60,
    }
}

# ===== ВАЛИДАЦИЯ ПАРОЛЕЙ =====
AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

# ===== ЛОКАЛИЗАЦИЯ =====
LANGUAGE_CODE = 'ru-ru'
TIME_ZONE = 'Europe/Moscow'
USE_I18N = True
USE_TZ = True

# ===== СТАТИЧЕСКИЕ И МЕДИАФАЙЛЫ =====
STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
STATICFILES_STORAGE = 'django.contrib.staticfiles.storage.StaticFilesStorage'

MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# ===== АУТЕНТИФИКАЦИЯ =====
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