"""
clickcounter/settings_prod.py
ПРОДАКШЕН НАСТРОЙКИ для сервера beauty-print.ru
Основано на локальной версии settings.py + настройки безопасности из старого settings_production.py
ВАЖНО: Этот файл ДОЛЖЕН использовать PostgreSQL как на локальной машине
"""

from pathlib import Path
import os

# ===================== ОСНОВНЫЕ ПУТИ =====================
# BASE_DIR - корневая директория проекта (где manage.py)
# parent.parent - потому что этот файл в clickcounter/settings_prod.py
BASE_DIR = Path(__file__).resolve().parent.parent

# ===================== БЕЗОПАСНОСТЬ: ПЕРЕМЕННЫЕ ОКРУЖЕНИЯ =====================
# НИКОГДА не храните секретные ключи в коде! Используйте переменные окружения.
# На сервере создайте файл .env в корне проекта с такими переменными:
# SECRET_KEY=ваш_очень_длинный_случайный_ключ
# DEBUG=False
# ALLOWED_HOSTS=beauty-print.ru,www.beauty-print.ru
# DB_NAME=clickcounter_prod
# DB_USER=clickcounter_user
# DB_PASSWORD=надежный_пароль
# DB_HOST=localhost
# DB_PORT=5432

try:
    from dotenv import load_dotenv
    # Загружаем переменные из .env файла в корне проекта
    load_dotenv(os.path.join(BASE_DIR, '.env'))
    print("✅ .env файл загружен успешно")
except ImportError:
    print("❌ ОШИБКА: python-dotenv не установлен!")
    print("Установите: pip install python-dotenv")
    exit(1)

# ===================== СЕКРЕТНЫЙ КЛЮЧ =====================
# Берем из переменной окружения, иначе падаем с ошибкой
SECRET_KEY = os.environ.get('SECRET_KEY')
if not SECRET_KEY:
    raise ValueError("❌ ОШИБКА: SECRET_KEY не установлен в .env файле!")

# ===================== РЕЖИМ ОТЛАДКИ =====================
# В production ВСЕГДА должен быть False!
# True - показывает детальные ошибки пользователям (опасно!)
# False - скрывает ошибки, показывает только страницу 500
DEBUG = os.environ.get('DEBUG', 'False') == 'True'

# ===================== РАЗРЕШЕННЫЕ ХОСТЫ =====================
# Список доменов, которые может обрабатывать этот Django проект
# Добавьте сюда ваш домен и поддомены
ALLOWED_HOSTS = [
    'beauty-print.ru',          # Основной домен
    'www.beauty-print.ru',      # С www
    'localhost',                # Для локального тестирования на сервере
    '127.0.0.1',                # Локальный IP
    '::1',                      # IPv6 localhost
]

# ===================== УСТАНОВЛЕННЫЕ ПРИЛОЖЕНИЯ =====================
# Порядок важен! Приложения, от которых зависят другие, должны быть выше.
INSTALLED_APPS = [
    'daphne',                    # ASGI-сервер для WebSocket (должен быть первым!)
    'django.contrib.admin',      # Админ-панель Django
    'django.contrib.auth',       # Система аутентификации (логины, пароли)
    'django.contrib.contenttypes', # Хранение типов моделей
    'django.contrib.sessions',   # Хранение сессий пользователей
    'django.contrib.messages',   # Система flash-сообщений
    'django.contrib.staticfiles', # Обработка статических файлов (CSS, JS, картинки)
    
    # Сторонние приложения
    'channels',                  # Поддержка WebSocket (асинхронные запросы)
    
    # Наши приложения для типографии
    'counter',                   # Основное: управление заказами
    'calculator',                # Калькулятор стоимости заказов
    'product_templates',         # Шаблоны изделий (визитки, буклеты и т.д.)
    'directories',               # Справочники (оборудование, материалы)
    'devices',                   # Устройства (принтеры, резаки)
    'sheet_formats',             # Форматы бумаги (А4, А3 и т.д.)
]

# ===================== ПРОМЕЖУТОЧНОЕ ПО (MIDDLEWARE) =====================
# ПО запускается ПОСЛЕДОВАТЕЛЬНО для каждого запроса (сверху вниз)
# и в ОБРАТНОМ порядке для ответа (снизу вверх)
MIDDLEWARE = [
    # 1. Безопасность: добавляет заголовки безопасности, защита от XSS и т.д.
    'django.middleware.security.SecurityMiddleware',
    
    # ДЛЯ PRODUCTION: раскомментируйте для сжатия статических файлов
    # 'whitenoise.middleware.WhiteNoiseMiddleware',  # ← ДОБАВЬТЕ ЭТУ СТРОКУ ПОСЛЕ SecurityMiddleware
    
    # 2. Сессии: позволяет хранить данные между запросами (корзина, настройки)
    'django.contrib.sessions.middleware.SessionMiddleware',
    
    # 3. Общий: обработка URL, локализация
    'django.middleware.common.CommonMiddleware',
    
    # 4. CSRF защита: защита от межсайтовой подделки запросов
    # ВАЖНО: в production должен быть ВКЛЮЧЕН!
    'django.middleware.csrf.CsrfViewMiddleware',
    
    # 5. Аутентификация: проверка кто пользователь (вошел/не вошел)
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    
    # 6. Сообщения: всплывающие уведомления (например, "Заказ сохранен")
    'django.contrib.messages.middleware.MessageMiddleware',
    
    # 7. Защита от кликджекинга: запрещает встраивание сайта в iframe
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

# ===================== КОНФИГУРАЦИЯ URL =====================
# Где искать главный файл с маршрутами (URL-адресами)
ROOT_URLCONF = 'clickcounter.urls'

# ===================== ШАБЛОНЫ (TEMPLATES) =====================
# Настройки системы шаблонов (HTML файлы с Django-тегами)
TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',  # Используем Django шаблонизатор
        'DIRS': [],  # Дополнительные папки с шаблонами (пока пусто)
        'APP_DIRS': True,  # Искать шаблоны в папках templates внутри каждого приложения
        'OPTIONS': {
            'context_processors': [
                # Эти функции добавляют данные во ВСЕ шаблоны автоматически
                'django.template.context_processors.debug',      # Переменная debug
                'django.template.context_processors.request',    # Объект request
                'django.contrib.auth.context_processors.auth',   # Данные пользователя (user)
                'django.contrib.messages.context_processors.messages',  # Сообщения
            ],
        },
    },
]

# ===================== WSGI/ASGI ПРИЛОЖЕНИЯ =====================
# WSGI - для обычных HTTP запросов
WSGI_APPLICATION = 'clickcounter.wsgi.application'

# ASGI - для WebSocket и асинхронных запросов
ASGI_APPLICATION = 'clickcounter.asgi.application'

# ===================== КАНАЛЫ (CHANNELS) ДЛЯ WEBSOCKET =====================
# WebSocket нужен для реального времени (уведомления, чаты, обновления)
# В production используем Redis как брокер сообщений
CHANNEL_LAYERS = {
    'default': {
        'BACKEND': 'channels_redis.core.RedisChannelLayer',  # Используем Redis
        'CONFIG': {
            # Адрес Redis сервера (обычно на localhost порт 6379)
            "hosts": [('127.0.0.1', 6379)],
            # Альтернативно можно использовать unix socket (быстрее):
            # "hosts": [('unix:///var/run/redis/redis-server.sock', 0)],
        },
    },
}

# ===================== БАЗА ДАННЫХ - POSTGRESQL =====================
# ВАЖНО: На сервере ДОЛЖЕН быть установлен и запущен PostgreSQL!
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',  # Используем PostgreSQL драйвер
        'NAME': os.environ.get('DB_NAME', 'clickcounter_prod'),     # Имя базы данных
        'USER': os.environ.get('DB_USER', 'clickcounter_user'),     # Имя пользователя БД
        'PASSWORD': os.environ.get('DB_PASSWORD', ''),              # Пароль (ВЗЯТЬ ИЗ .env!)
        'HOST': os.environ.get('DB_HOST', 'localhost'),             # Сервер БД (обычно localhost)
        'PORT': os.environ.get('DB_PORT', '5432'),                  # Порт PostgreSQL (по умолчанию 5432)
        
        # Дополнительные настройки для стабильности
        'OPTIONS': {
            'client_encoding': 'UTF8',      # Кодировка UTF8 для русского языка
            'connect_timeout': 30,          # Ждать подключения 30 секунд
        },
        'CONN_MAX_AGE': 600,  # Держать соединение 10 минут (уменьшает нагрузку)
    }
}

# ===================== ПРОВЕРКА ПАРОЛЕЙ =====================
# Правила для создания надежных паролей пользователей
AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
        # Проверяет: пароль не должен быть похож на имя/email
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
        'OPTIONS': {
            'min_length': 8,  # Минимум 8 символов
        }
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
        # Запрещает common пароли (123456, password и т.д.)
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
        # Запрещает пароли только из цифр
    },
]

# ===================== ЯЗЫК И ВРЕМЯ =====================
LANGUAGE_CODE = 'ru-ru'           # Русский язык интерфейса
TIME_ZONE = 'Europe/Moscow'       # Московское время
USE_I18N = True                   # Включить интернационализацию
USE_TZ = True                     # Использовать часовые пояса

# ===================== СТАТИЧЕСКИЕ ФАЙЛЫ (CSS, JS, ИЗОБРАЖЕНИЯ) =====================
STATIC_URL = '/static/'  # URL префикс для статических файлов
STATIC_ROOT = BASE_DIR / 'staticfiles'  # Папка куда collectstatic соберет файлы
STATICFILES_DIRS = [
    BASE_DIR / "static",  # Дополнительные папки со статикой
]

# Для production: сжатие и кэширование статических файлов
# Раскомментируйте после установки whitenoise:
# STATICFILES_STORAGE = 'whitenoise.storage.CompressedManifestStaticFilesStorage'

# ===================== МЕДИА ФАЙЛЫ (загруженные пользователями) =====================
MEDIA_URL = '/media/'  # URL префикс для медиа файлов
MEDIA_ROOT = BASE_DIR / 'media'  # Папка для загруженных файлов

# ===================== ТИП ПЕРВИЧНОГО КЛЮЧА ПО УМОЛЧАНИЮ =====================
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# ===================== НАСТРОЙКИ БЕЗОПАСНОСТИ ДЛЯ HTTPS =====================
# ВАЖНО: Эти настройки работают ТОЛЬКО с HTTPS!

# Доверенные источники для CSRF защиты
CSRF_TRUSTED_ORIGINS = [
    'https://beauty-print.ru',
    'https://www.beauty-print.ru',
    # Если есть HTTP версия, добавьте:
    # 'http://beauty-print.ru',
]

# Если сайт за прокси (Nginx/Apache), раскомментируйте:
# SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')

# Перенаправлять HTTP → HTTPS (только когда есть SSL сертификат!)
SECURE_SSL_REDIRECT = True  # Включить после настройки SSL

# Безопасные куки (передавать только по HTTPS)
CSRF_COOKIE_SECURE = True
SESSION_COOKIE_SECURE = True

# HSTS - принудительное использование HTTPS браузером
SECURE_HSTS_SECONDS = 31536000  # 1 год
SECURE_HSTS_INCLUDE_SUBDOMAINS = True  # И для поддоменов
SECURE_HSTS_PRELOAD = True  # Добавить в прелоад лист браузеров

# Дополнительная защита
SECURE_BROWSER_XSS_FILTER = True  # Фильтр XSS в браузере
SECURE_CONTENT_TYPE_NOSNIFF = True  # Запрет смены Content-Type
X_FRAME_OPTIONS = 'DENY'  # Запрет встраивания в iframe

# ===================== АУТЕНТИФИКАЦИЯ =====================
LOGIN_URL = '/counter/login/'           # Страница входа
LOGIN_REDIRECT_URL = '/'                # Куда идти после входа
LOGOUT_REDIRECT_URL = '/counter/login/' # Куда идти после выхода

# Настройки сессий
SESSION_COOKIE_AGE = 30 * 24 * 60 * 60  # 30 дней
SESSION_EXPIRE_AT_BROWSER_CLOSE = False # Не закрывать сессию при закрытии браузера
SESSION_SAVE_EVERY_REQUEST = True       # Обновлять время сессии при каждом запросе

# ===================== ЛОГИРОВАНИЕ =====================
# Создаем папку для логов если её нет
LOGS_DIR = os.path.join(BASE_DIR, 'logs')
if not os.path.exists(LOGS_DIR):
    os.makedirs(LOGS_DIR)

LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    
    # Форматтеры - как выглядят записи в логах
    'formatters': {
        'verbose': {
            'format': '{levelname} {asctime} {module} {message}',
            'style': '{',
        },
        'simple': {
            'format': '{levelname} {message}',
            'style': '{',
        },
    },
    
    # Обработчики - куда писать логи
    'handlers': {
        'console': {
            'level': 'INFO',
            'class': 'logging.StreamHandler',
            'formatter': 'simple'
        },
        'file': {
            'level': 'ERROR',
            'class': 'logging.FileHandler',
            'filename': os.path.join(LOGS_DIR, 'django_errors.log'),
            'formatter': 'verbose'
        },
    },
    
    # Логгеры - что логировать
    'loggers': {
        'django': {
            'handlers': ['console', 'file'],
            'level': 'INFO',
            'propagate': True,
        },
    },
}

print(f"⚙️ Production настройки загружены: DEBUG={DEBUG}, DB={DATABASES['default']['NAME']}")