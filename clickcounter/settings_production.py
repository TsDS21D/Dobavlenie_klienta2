"""
Django settings for clickcounter project.

НАЗНАЧЕНИЕ ФАЙЛА:
Этот файл содержит настройки Django-проекта для ПРОДАКШЕН-СЕРВЕРА.
Особенности production-настроек:
- Отключена отладка (DEBUG = False)
- Включены механизмы безопасности (HTTPS, CSRF защита)
- Используется Redis для работы с WebSocket (Channels)
- Оптимизирована производительность и безопасность

ВНИМАНИЕ: Этот файл НЕ для локальной разработки!
Для разработки используйте settings.py
"""

# ================ ИМПОРТ МОДУЛЕЙ ================
from pathlib import Path  # Современный способ работы с путями в Python
import os  # Для работы с операционной системой и переменными окружения

# ================ ПУТИ К ФАЙЛАМ ================
# BASE_DIR - корневая директория проекта (папка с manage.py)
# Path(__file__) получает путь к текущему файлу (settings_production.py)
# .resolve() преобразует путь в абсолютный (убирает символы типа ..)
# .parent.parent поднимаемся на два уровня вверх:
# 1. settings_production.py → папка clickcounter (родительская)
# 2. папка clickcounter → корень проекта (еще один уровень вверх)
BASE_DIR = Path(__file__).resolve().parent.parent

# ================ БЕЗОПАСНОСТЬ ================

# СЕКРЕТНЫЙ КЛЮЧ - САМАЯ ВАЖНАЯ НАСТРОЙКА!
# ------------------------------------------------------------------------------
# SECRET_KEY - это криптографический ключ, который Django использует для:
# 1. Подписи сессий и куки (чтобы их нельзя было подделать)
# 2. Генерации CSRF-токенов (защита от межсайтовых запросов)
# 3. Хэширования паролей (преобразования паролей в необратимый формат)
# 4. Подписи других важных данных
#
# КАК РАБОТАЕТ ЭТА СТРОКА:
# os.environ.get('DJANGO_SECRET_KEY', 'fallback-key') означает:
# - Сначала попытаться получить значение из переменной окружения 'DJANGO_SECRET_KEY'
# - Если переменной нет, использовать 'fallback-key' (опасно для production!)
#
# ВАЖНО: В реальном production НИКОГДА не оставляйте fallback-значение!
# На сервере всегда должен быть установлен DJANGO_SECRET_KEY
#
# КАК УСТАНОВИТЬ НА СЕРВЕРЕ:
# export DJANGO_SECRET_KEY='ваш_длинный_случайный_ключ'
# Или в Docker: -e DJANGO_SECRET_KEY='ваш_ключ'
# ------------------------------------------------------------------------------
SECRET_KEY = os.environ.get('DJANGO_SECRET_KEY', 'django-insecure-4kej=1toi&@-lykpnan(d7%yctg0posv6312a60k2a0v%lr&5v')

# РЕЖИМ ОТЛАДКИ
# ------------------------------------------------------------------------------
# DEBUG = True включает полезные для разработки функции:
# - Детальные страницы ошибок с трассировкой стека
# - Автоматическую перезагрузку сервера при изменении кода
# - Отладочную информацию в шаблонах
#
# DEBUG = False отключает всё вышеперечисленное и включает:
# - Стандартные страницы ошибок (404.html, 500.html)
# - Производственные настройки безопасности
# - Оптимизированную обработку статических файлов
#
# ВАЖНО: В production ВСЕГДА должно быть False!
# Иначе злоумышленники могут увидеть внутреннюю структуру вашего приложения
# ------------------------------------------------------------------------------
DEBUG = False

# РАЗРЕШЕННЫЕ ХОСТЫ
# ------------------------------------------------------------------------------
# ALLOWED_HOSTS - список доменов/адресов, с которых Django принимает запросы
# Django проверяет заголовок Host каждого входящего запроса
# Если домен не в этом списке - запрос отклоняется с ошибкой 400
#
# Примеры:
# 'beauty-print.ru' - принимать запросы только к этому домену
# 'www.beauty-print.ru' - принимать запросы к поддомену www
# 'localhost' - разрешить локальные запросы (для администрирования сервера)
# '127.0.0.1' - разрешить запросы с localhost по IP
# '::1' - то же самое для IPv6
#
# ВНИМАНИЕ: Не используйте '*' в production! Это открывает сайт для атак
# ------------------------------------------------------------------------------
ALLOWED_HOSTS = [
    'beauty-print.ru',          # Основной домен
    'www.beauty-print.ru',      # Домен с www (многие пользователи вводят с www)
    'localhost',                # Для локального доступа на сервере
    '127.0.0.1',                # IPv4 localhost
    '::1',                      # IPv6 localhost
]

# ================ УСТАНОВЛЕННЫЕ ПРИЛОЖЕНИЯ ================
# INSTALLED_APPS - список всех Django-приложений, установленных в проекте
# Django загружает приложения в указанном порядке (важно для зависимостей!)
INSTALLED_APPS = [
    # daphne ДОЛЖЕН быть первым - это ASGI-сервер для обработки WebSocket
    'daphne',
    
    # СТАНДАРТНЫЕ DJANGO ПРИЛОЖЕНИЯ (идут в определенном порядке):
    'django.contrib.admin',        # Административная панель (/admin/)
    'django.contrib.auth',         # Система аутентификации (пользователи, группы)
    'django.contrib.contenttypes', # Система типов контента (нужна для прав доступа)
    'django.contrib.sessions',     # Механизм сессий (хранение данных между запросами)
    'django.contrib.messages',     # Система одноразовых сообщений (уведомления)
    'django.contrib.staticfiles',  # Обработка статических файлов (CSS, JS, картинки)
    
    # СТОРОННИЕ ПРИЛОЖЕНИЯ:
    'channels',                    # Поддержка WebSocket и асинхронных запросов
    'whitenoise.runserver_nostatic',  # WhiteNoise - эффективная раздача статики
    
    # НАШИ СОБСТВЕННЫЕ ПРИЛОЖЕНИЯ:
    'counter',                     # Управление заказами (основное приложение)
    'calculator',                  # Калькулятор стоимости заказов
    'product_templates',           # Шаблоны изделий (каталог продукции)
    'directories',                 # Справочники (оборудование, материалы, клиенты)
    'devices',                     # Управление устройствами/оборудованием
]

# ================ ПРОМЕЖУТОЧНОЕ ПО (MIDDLEWARE) ================
# Middleware - это цепочка обработчиков, через которые проходит каждый запрос
# Запрос проходит сверху вниз, ответ - снизу вверх
MIDDLEWARE = [
    # 1. SecurityMiddleware: добавляет заголовки безопасности (защита от XSS и др.)
    'django.middleware.security.SecurityMiddleware',
    
    # 2. WhiteNoiseMiddleware: обслуживает статические файлы в production
    # Должен идти сразу после SecurityMiddleware и ДО всех остальных middleware
    'whitenoise.middleware.WhiteNoiseMiddleware',
    
    # 3. SessionMiddleware: управляет сессиями пользователей
    # Хранит данные между запросами (корзина, настройки и т.д.)
    'django.contrib.sessions.middleware.SessionMiddleware',
    
    # 4. CommonMiddleware: выполняет общие задачи
    # (проверка префикса слеша, установка заголовков)
    'django.middleware.common.CommonMiddleware',
    
    # 5. CsrfViewMiddleware: защита от CSRF-атак
    # Проверяет CSRF-токен в POST-запросах (формах)
    'django.middleware.csrf.CsrfViewMiddleware',
    
    # 6. AuthenticationMiddleware: добавляет объект user к каждому запросу
    # Позволяет использовать request.user в views
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    
    # 7. MessageMiddleware: работает с flash-сообщениями
    # Позволяет показывать одноразовые уведомления пользователям
    'django.contrib.messages.middleware.MessageMiddleware',
    
    # 8. XFrameOptionsMiddleware: защита от clickjacking
    # Запрещает встраивание сайта в iframe (кроме своих доменов)
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

# ================ КОНФИГУРАЦИЯ URL ================
# ROOT_URLCONF указывает Python-модуль, который содержит корневые URL-шаблоны
# Django ищет здесь маршруты, когда получает HTTP-запрос
ROOT_URLCONF = 'clickcounter.urls'

# ================ НАСТРОЙКИ ШАБЛОНОВ ================
# TEMPLATES настраивает систему шаблонов Django
TEMPLATES = [
    {
        # Используем стандартный Django-шаблонизатор
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        
        # Дополнительные директории с шаблонами (можно добавить BASE_DIR / 'templates')
        'DIRS': [],
        
        # Искать шаблоны в папке 'templates' внутри каждого приложения
        'APP_DIRS': True,
        
        # Дополнительные настройки шаблонизатора
        'OPTIONS': {
            # Контекстные процессоры добавляют переменные во ВСЕ шаблоны автоматически
            'context_processors': [
                'django.template.context_processors.debug',      # Добавляет переменную debug
                'django.template.context_processors.request',    # Добавляет объект request
                'django.contrib.auth.context_processors.auth',   # Добавляет user и perms
                'django.contrib.messages.context_processors.messages',  # Добавляет messages
            ],
        },
    },
]

# ================ WSGI/ASGI НАСТРОЙКИ ================
# WSGI_APPLICATION - точка входа для синхронных HTTP-запросов
# WSGI (Web Server Gateway Interface) - стандарт Python для веб-приложений
WSGI_APPLICATION = 'clickcounter.wsgi.application'

# ASGI_APPLICATION - точка входа для асинхронных запросов и WebSocket
# ASGI (Asynchronous Server Gateway Interface) - новый асинхронный стандарт
# Нужен для работы Channels и WebSocket
ASGI_APPLICATION = 'clickcounter.asgi.application'

# ================ НАСТРОЙКИ CHANNELS И REDIS ================
# Channels позволяет Django работать с WebSocket, long-polling и другими протоколами
# В production используем Redis как бэкенд для хранения состояния подключений

CHANNEL_LAYERS = {
    'default': {
        # Используем Redis в качестве бэкенда для Channel Layers
        'BACKEND': 'channels_redis.core.RedisChannelLayer',
        
        # Конфигурация подключения к Redis
        'CONFIG': {
            # Список хостов Redis. Формат: [(адрес, порт), ...]
            # В production лучше выносить URL в переменные окружения
            "hosts": [
                # Получаем URL из переменной окружения REDIS_URL
                # Если переменной нет, используем localhost:6379
                (os.environ.get('REDIS_URL', 'redis://127.0.0.1:6379'),)
            ],
            
            # Префикс для всех ключей Redis (чтобы избежать конфликтов)
            # Если на одном Redis несколько проектов, у каждого свой префикс
            "prefix": "clickcounter",
            
            # Таймаут операций с Redis (в секундах)
            # Если Redis не отвечает дольше - операция прерывается
            "timeout": 5,
            
            # Максимальное количество соединений в пуле
            # Каждое соединение может обслуживать несколько каналов
            "max_connections": 100,
            
            # Кодировка для сообщений
            "encoding": "utf-8",
        },
    },
}

# ================ БАЗА ДАННЫХ ================
# DATABASES настраивает подключение к базе данных
# В production обычно используют PostgreSQL или MySQL, но мы оставляем SQLite

DATABASES = {
    'default': {
        # SQLite - легкая файловая база данных (хороша для разработки)
        # В production лучше использовать PostgreSQL
        'ENGINE': 'django.db.backends.sqlite3',
        
        # Путь к файлу базы данных
        # BASE_DIR / 'db.sqlite3' = корень_проекта/db.sqlite3
        'NAME': BASE_DIR / 'db.sqlite3',
    }
}

# ================ ВАЛИДАЦИЯ ПАРОЛЕЙ ================
# AUTH_PASSWORD_VALIDATORS проверяют сложность паролей при регистрации
# Это важная настройка безопасности

AUTH_PASSWORD_VALIDATORS = [
    {
        # Проверяет, что пароль не похож на имя пользователя, email и т.д.
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        # Проверяет минимальную длину пароля
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
        'OPTIONS': {
            'min_length': 8,  # Пароль должен быть не короче 8 символов
        }
    },
    {
        # Проверяет пароль против списка часто используемых паролей
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        # Проверяет, что пароль не состоит только из цифр
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]

# ================ МЕЖДУНАРОДНЫЕ НАСТРОЙКИ ================
LANGUAGE_CODE = 'ru-ru'        # Язык по умолчанию (русский)
TIME_ZONE = 'Europe/Moscow'    # Часовой пояс (Москва)
USE_I18N = True                # Включить интернационализацию (поддержка разных языков)
USE_L10N = True                # Включить локализацию (форматы дат, чисел)
USE_TZ = True                  # Использовать часовые пояса

# ================ СТАТИЧЕСКИЕ ФАЙЛЫ ================
# Static files (CSS, JavaScript, Images)

# STATIC_URL - URL-префикс для статических файлов
# В браузере файлы будут доступны по адресу: https://beauty-print.ru/static/...
STATIC_URL = '/static/'

# STATIC_ROOT - директория, куда collectstatic соберет ВСЕ статические файлы
# Сервер (Nginx/Apache) должен раздавать файлы из этой папки
STATIC_ROOT = BASE_DIR / 'staticfiles'

# STATICFILES_DIRS - дополнительные директории со статическими файлами
# Django ищет статику здесь при разработке и при сборе в STATIC_ROOT
STATICFILES_DIRS = [
    BASE_DIR / "static",  # Папка static в корне проекта
]

# STATICFILES_STORAGE - движок для обработки статических файлов
# WhiteNoise сжимает файлы и добавляет хэши к именам для кэширования
STATICFILES_STORAGE = 'whitenoise.storage.CompressedManifestStaticFilesStorage'

# ================ МЕДИА ФАЙЛЫ ================
# Media files (загружаемые пользователями: изображения, документы)

# MEDIA_URL - URL-префикс для медиа файлов
MEDIA_URL = '/media/'

# MEDIA_ROOT - директория для хранения загруженных файлов
MEDIA_ROOT = BASE_DIR / 'media'

# ================ ТИП ПЕРВИЧНОГО КЛЮЧА ПО УМОЛЧАНИЮ ================
# DEFAULT_AUTO_FIELD - тип поля для автоинкрементных первичных ключей
# BigAutoField использует 64-битные числа (большой диапазон)
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# ================ НАСТРОЙКИ CSRF И БЕЗОПАСНОСТИ ================
# CSRF_TRUSTED_ORIGINS - доверенные источники для CSRF-токенов
# Django проверяет заголовок Origin у POST-запросов
CSRF_TRUSTED_ORIGINS = [
    'https://beauty-print.ru',      # Основной домен с HTTPS
    'https://www.beauty-print.ru',  # Домен с www и HTTPS
]

# SECURE_PROXY_SSL_HEADER - настройка для работы за reverse proxy (Nginx/Apache)
# Говорит Django, что первоначальный запрос был по HTTPS
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')

# SECURE_SSL_REDIRECT - перенаправлять все HTTP запросы на HTTPS
# Важно для безопасности и SEO
SECURE_SSL_REDIRECT = True

# CSRF_COOKIE_SECURE - передавать CSRF-куки только по HTTPS
# Защищает от перехвата кук при передаче по незащищенному соединению
CSRF_COOKIE_SECURE = True

# SESSION_COOKIE_SECURE - передавать сессионные куки только по HTTPS
SESSION_COOKIE_SECURE = True

# HTTP Strict Transport Security (HSTS)
# Браузер запоминает, что сайт всегда должен использовать HTTPS
SECURE_HSTS_SECONDS = 31536000  # 1 год в секундах
SECURE_HSTS_INCLUDE_SUBDOMAINS = True  # Включать все поддомены
SECURE_HSTS_PRELOAD = True  # Включить в предзагрузку браузеров

# Дополнительные настройки безопасности
SECURE_BROWSER_XSS_FILTER = True  # Включить XSS-фильтр браузера
SECURE_CONTENT_TYPE_NOSNIFF = True  # Запретить MIME-sniffing
X_FRAME_OPTIONS = 'DENY'  # Запретить встраивание в iframe

# ================ ЛОГИРОВАНИЕ ================
# Логирование помогает отслеживать ошибки и активность на сервере

# Создаем директорию для логов, если её нет
LOGS_DIR = os.path.join(BASE_DIR, 'logs')
if not os.path.exists(LOGS_DIR):
    os.makedirs(LOGS_DIR)

LOGGING = {
    'version': 1,  # Версия конфигурации
    'disable_existing_loggers': False,  # Не отключать стандартные логгеры Django
    
    # Форматеры - определяют формат вывода логов
    'formatters': {
        'verbose': {  # Подробный формат
            'format': '{levelname} {asctime} {module} {process:d} {thread:d} {message}',
            'style': '{',
        },
        'simple': {  # Простой формат
            'format': '{levelname} {message}',
            'style': '{',
        },
    },
    
    # Обработчики - определяют куда писать логи
    'handlers': {
        'file': {  # Запись в файл
            'level': 'ERROR',  # Только ошибки и выше (ERROR, CRITICAL)
            'class': 'logging.handlers.RotatingFileHandler',
            'filename': os.path.join(LOGS_DIR, 'django_errors.log'),
            'maxBytes': 1024 * 1024 * 5,  # 5 МБ максимальный размер файла
            'backupCount': 5,  # Хранить 5 backup-файлов
            'formatter': 'verbose',
        },
        'console': {  # Вывод в консоль
            'level': 'INFO',  # Информационные сообщения и выше
            'class': 'logging.StreamHandler',
            'formatter': 'simple',
        },
    },
    
    # Логгеры - определяют какие сообщения куда отправлять
    'loggers': {
        'django': {  # Логгер Django
            'handlers': ['file', 'console'],
            'level': 'INFO',
            'propagate': True,  # Передавать сообщения родительским логгерам
        },
    },
    
    # Корневой логгер
    'root': {
        'handlers': ['console'],
        'level': 'WARNING',  # Предупреждения и выше
    },
}

# ================ НАСТРОЙКИ АУТЕНТИФИКАЦИИ ================
# LOGIN_URL - куда перенаправлять неавторизованных пользователей
LOGIN_URL = '/counter/login/'

# LOGIN_REDIRECT_URL - куда перенаправлять после успешного входа
LOGIN_REDIRECT_URL = '/counter/'

# LOGOUT_REDIRECT_URL - куда перенаправлять после выхода
LOGOUT_REDIRECT_URL = '/counter/login/'

# Настройки сессий
SESSION_COOKIE_AGE = 30 * 24 * 60 * 60  # Время жизни сессии: 30 дней (в секундах)
SESSION_EXPIRE_AT_BROWSER_CLOSE = False  # Не завершать сессию при закрытии браузера
SESSION_SAVE_EVERY_REQUEST = True  # Обновлять время жизни сессии при каждом запросе

# ================ НАСТРОЙКИ КЭШИРОВАНИЯ С REDIS ================
# Кэширование ускоряет работу сайта, сохраняя часто используемые данные в памяти

CACHES = {
    'default': {
        # Используем Redis для кэширования
        'BACKEND': 'django_redis.cache.RedisCache',
        
        # URL Redis для кэша (используем базу №1, отдельно от Channels)
        'LOCATION': os.environ.get('REDIS_CACHE_URL', 'redis://127.0.0.1:6379/1'),
        
        # Дополнительные параметры
        'OPTIONS': {
            'CLIENT_CLASS': 'django_redis.client.DefaultClient',  # Стандартный клиент Redis
            'SOCKET_CONNECT_TIMEOUT': 5,  # Таймаут подключения (секунды)
            'SOCKET_TIMEOUT': 5,  # Таймаут операций (секунды)
            'COMPRESSOR': 'django_redis.compressors.zlib.ZlibCompressor',  # Сжатие данных
            'IGNORE_EXCEPTIONS': True,  # Игнорировать ошибки Redis (сайт продолжит работать)
        },
        
        # Префикс для всех ключей кэша (чтобы отличать от других данных в Redis)
        'KEY_PREFIX': 'clickcounter_cache',
    }
}

# Время жизни кэша по умолчанию (в секундах)
CACHE_TIMEOUT = 60 * 15  # 15 минут

# ================ НАСТРОЙКИ ОТПРАВКИ EMAIL ================
# Конфигурация отправки email (для сброса паролей, уведомлений и т.д.)

EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'  # Использовать SMTP-сервер
EMAIL_HOST = os.environ.get('EMAIL_HOST', 'smtp.gmail.com')  # Адрес SMTP-сервера
EMAIL_PORT = int(os.environ.get('EMAIL_PORT', 587))  # Порт SMTP (587 для TLS)
EMAIL_USE_TLS = True  # Использовать TLS шифрование
EMAIL_USE_SSL = False  # Не использовать SSL (используем TLS)
EMAIL_HOST_USER = os.environ.get('EMAIL_HOST_USER', '')  # Логин от почты
EMAIL_HOST_PASSWORD = os.environ.get('EMAIL_HOST_PASSWORD', '')  # Пароль или app-пароль
DEFAULT_FROM_EMAIL = os.environ.get('DEFAULT_FROM_EMAIL', 'noreply@beauty-print.ru')  # Email отправителя
SERVER_EMAIL = os.environ.get('SERVER_EMAIL', 'errors@beauty-print.ru')  # Email для отправки ошибок

# ================ ОПТИМИЗАЦИЯ ДЛЯ PRODUCTION ================
# SESSION_ENGINE - где хранить сессии (в кэше + базе данных для надежности)
SESSION_ENGINE = 'django.contrib.sessions.backends.cached_db'

# SESSION_CACHE_ALIAS - какой кэш использовать для сессий
SESSION_CACHE_ALIAS = 'default'

# Безопасность кук
CSRF_COOKIE_HTTPONLY = True  # Запретить доступ к CSRF-кукам из JavaScript
SESSION_COOKIE_HTTPONLY = True  # Запретить доступ к сессионным кукам из JavaScript

# ================ ИНСТРУКЦИЯ ПО РАЗВЕРТЫВАНИЮ ================
"""
КАК РАЗВЕРНУТЬ ПРОЕКТ С REDIS:

1. УСТАНОВИТЕ REDIS НА СЕРВЕРЕ:
   sudo apt update
   sudo apt install redis-server
   sudo systemctl enable redis
   sudo systemctl start redis

2. ПРОВЕРЬТЕ РАБОТУ REDIS:
   redis-cli ping  # Должен ответить "PONG"

3. УСТАНОВИТЕ ЗАВИСИМОСТИ ДЛЯ REDIS:
   pip install channels-redis redis django-redis

4. НАСТРОЙТЕ ПЕРЕМЕННЫЕ ОКРУЖЕНИЯ (опционально):
   export REDIS_URL='redis://localhost:6379'
   export REDIS_CACHE_URL='redis://localhost:6379/1'

5. ЗАПУСТИТЕ СЕРВЕР:
   daphne -b 0.0.0.0 -p 5000 clickcounter.asgi:application

6. ДЛЯ ПРОДАКШЕНА НАСТРОЙТЕ NGINX:
   - Проксируйте запросы на порт 5000
   - Раздавайте статику из папки staticfiles
   - Настройте SSL (Let's Encrypt)

ЧТО ДЕЛАЕТ REDIS В ПРОЕКТЕ:
1. Channels: Обрабатывает WebSocket соединения (чат, уведомления в реальном времени)
2. Кэширование: Ускоряет работу сайта, сохраняя часто используемые данные
3. Сессии: Хранит сессии пользователей для быстрого доступа
"""