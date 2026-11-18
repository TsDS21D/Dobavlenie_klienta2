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
    'proschety',                   # новая альтернативная страница «Просчёты»
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
    'orders', # заказы
    'tovary', # справочник товаров
    'web_calculators',
    'web_orders',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
    'proschety.middleware.CurrentUserMiddleware',
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

# ===== MOGUTA API (bukva-a.ru) =====
# Используется приложением web_calculators для создания товаров в каталоге
# интернет-магазина bukva-a.ru через Moguta API.
MOGUTA_URL = os.environ.get('MOGUTA_URL', 'https://bukva-a.ru')
MOGUTA_TOKEN = os.environ.get('MOGUTA_TOKEN', '')
MOGUTA_SECRET = os.environ.get('MOGUTA_SECRET', '')
MOGUTA_CATEGORY_ID = int(os.environ.get('MOGUTA_CATEGORY_ID', '0'))


# ===== BUKVA-A.RU: ОБРАТНАЯ ИНТЕГРАЦИЯ (актуальные цены) =====
# Плагин на bukva-a.ru вызывает наш API /calculator/api/get-webcalc-prices/,
# когда клиент открывает корзину. По кодам товаров (PR-XXXX) мы возвращаем
# актуальные цены просчётов.

# Секретный ключ, который проверяется в API. Передаётся в заголовке
# X-Beauty-Secret. Если не задан — API отвечает 500.
BUKVA_API_SECRET = os.environ.get('BUKVA_API_SECRET', '')

# ===== Секрет отправителя заявок с сайта (bukva-a.ru) =====
# Отдельный ключ от BUKVA_API_SECRET — сознательно:
#   • BUKVA_API_SECRET используется для ЧТЕНИЯ (цены, статусы);
#   • BUKVA_SENDER_TOKEN — для ЗАПИСИ (создание заявки).
# Если один утечёт, второй продолжит защищать свою операцию.
#
# Передаётся сайтом в заголовке X-Sender-Token при POST
# /web-orders/api/receive/ (см. mg-core/script/web_orders_sender.php).
#
# МЯГКИЙ РЕЖИМ: если переменная не задана (пустая строка), проверка
# в api_receive_order ПРОПУСКАЕТСЯ. Это позволяет выложить код раньше,
# чем ключ появится в .env, и не потерять заявки в момент переключения.
BUKVA_SENDER_TOKEN = os.environ.get('BUKVA_SENDER_TOKEN', '')

# Список разрешённых IP-адресов (через запятую). Если пусто —
# проверка IP отключается, остаётся только проверка ключа.
# Список разбираем в массив, чтобы удобно проверять "in".
BUKVA_ALLOWED_IPS = [
    ip.strip() for ip in os.environ.get('BUKVA_ALLOWED_IPS', '').split(',')
    if ip.strip()
]


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

# ============================================================================
# ЗАГРУЗКА БОЛЬШИХ ФАЙЛОВ (макеты до 512 МБ)
# ============================================================================
# FILE_UPLOAD_MAX_MEMORY_SIZE — до какого размера Django держит файл
# в памяти. Всё, что больше, он пишет во временный файл на диске.
# 25 МБ — разумный порог: маленькие макеты не трогают диск,
# большие не съедают оперативную память процесса daphne.
FILE_UPLOAD_MAX_MEMORY_SIZE = 25 * 1024 * 1024

# DATA_UPLOAD_MAX_MEMORY_SIZE — ограничение на НЕ файловую часть запроса
# (текстовые поля формы). Файлы считаются отдельно, поэтому здесь
# можно оставить 25 МБ: комментарии и ссылки столько не занимают.
DATA_UPLOAD_MAX_MEMORY_SIZE = 25 * 1024 * 1024

# Максимальный размер одного файла макета. Проверяется в view до сохранения.
# 512 МБ — под редкие тяжёлые макеты (ты сказал, что такие бывают).
WEB_ORDER_MAX_FILE_SIZE = 512 * 1024 * 1024

# Разрешённые расширения. Всё остальное отклоняем, чтобы через загрузку
# нельзя было положить на сервер исполняемый файл.
WEB_ORDER_ALLOWED_FILE_EXTENSIONS = [
    '.pdf', '.ai', '.eps', '.cdr', '.indd', '.psd',
    '.zip', '.rar', '.7z',
    '.jpg', '.jpeg', '.png', '.tif', '.tiff', '.svg',
]

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