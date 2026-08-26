# 📚 Полная инструкция развертывания на VPS Majordomo.ru

## 🎯 Информация о вашей конфигурации

- **Хостинг**: Majordomo.ru VPS
- **Домен**: beauty-print.ru
- **Корневая директория**: `/var/www/www-root/data/www/beauty-print.ru/`
- **SSL сертификат**: Уже установлен ✅
- **Python**: Нужно установить
- **Redis**: Нужно проверить/установить

---

## 📋 ЭТАП 1: Подключение и проверка окружения

### 1.1 Подключитесь к VPS через SSH

```bash
# Команда для подключения (замените на ваши данные)
ssh root@ваш_ip_адрес
# или
ssh root@beauty-print.ru

# Введите пароль от root аккаунта
```

### 1.2 Проверьте операционную систему

```bash
# Узнайте версию ОС
cat /etc/os-release

# Проверьте наличие Python
python3 --version

# Если Python не установлен, установите его:
apt update && apt upgrade -y
apt install python3 python3-pip python3-venv -y

# Проверка
python3 --version
pip3 --version
```

### 1.3 Установите необходимые системные пакеты

```bash
# Основные инструменты разработки
apt install build-essential -y
apt install curl wget git -y

# Для работы с Redis
apt install redis-server -y

# Nginx (веб-сервер)
apt install nginx -y

# Supervisor или systemd (уже есть в Linux)
apt install supervisor -y

# Проверка Redis
redis-cli ping
# Должно вывести: PONG
```

---

## 🚀 ЭТАП 2: Подготовка файлов проекта

### 2.1 Загрузка проекта на VPS

**Вариант A: Через Git (рекомендуется)**

```bash
# Перейдите в директорию домена
cd /var/www/www-root/data/www/beauty-print.ru/

# Если папка не пуста, сделайте резервную копию
cp -r . ./backup_$(date +%Y%m%d_%H%M%S)

# Очистите директорию (если нужно)
rm -rf *

# Клонируйте проект с GitHub
git clone https://github.com/ваш-username/django-websocket-counter.git .

# Если нет GitHub, создайте файлы вручную (см. ниже)
```

**Вариант B: Через SCP с вашего локального компьютера**

```bash
# На вашем локальном компьютере (в папке с проектом)
scp -r * root@beauty-print.ru:/var/www/www-root/data/www/beauty-print.ru/

# Или через rsync (быстрее):
rsync -avz --delete ./ root@beauty-print.ru:/var/www/www-root/data/www/beauty-print.ru/
```

**Вариант C: Вручную создать основные файлы**

```bash
# На VPS в директории /var/www/www-root/data/www/beauty-print.ru/

# Создайте файл requirements.txt
cat > requirements.txt << 'EOF'
Django==4.2.7
channels==4.0.0
daphne==4.0.0
channels-redis==4.1.0
redis==5.0.1
gunicorn==21.2.0
psycopg2-binary==2.9.9
whitenoise==6.6.0
EOF

# Остальные файлы создаются автоматически или копируются
```

### 2.2 Проверьте структуру проекта

```bash
# Перейдите в корневую директорию домена
cd /var/www/www-root/data/www/beauty-print.ru

# Посмотрите структуру
ls -la

# Должны быть файлы:
# - manage.py
# - requirements.txt
# - clickcounter/ (папка с проектом Django)
# - counter/ (папка с приложением)
# - db.sqlite3 (база данных, создается при миграции)
```

---

## 🔧 ЭТАП 3: Установка зависимостей Python

### 3.1 Создайте виртуальное окружение

```bash
# Перейдите в корневую директорию домена
cd /var/www/www-root/data/www/beauty-print.ru

# Создайте виртуальное окружение
python3 -m venv venv

# Активируйте его
source venv/bin/activate

# Проверка: в начале строки должно быть (venv)
# Пример: (venv) root@server:/var/www/www-root/data/www/beauty-print.ru#
```

### 3.2 Установите зависимости из requirements.txt

```bash
# Убедитесь что виртуальное окружение активно (venv)
pip install --upgrade pip setuptools wheel

# Установите все зависимости
pip install -r requirements.txt

# Проверка установки
pip list | grep -i django
pip list | grep -i channels
pip list | grep -i daphne
```

---

## ⚙️ ЭТАП 4: Настройка Django для Production

### 4.1 Обновите файл settings.py

```bash
# Откройте файл settings.py для редактирования
nano clickcounter/settings.py

# Или используйте cat для просмотра и редактирования
```

**Найдите и измените следующие параметры:**

```python
# ========== SECURITY SETTINGS ==========

# 1. SECRET_KEY - используйте переменную окружения или новый ключ
# Сгенерируйте новый ключ:
# python3 -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"
SECRET_KEY = 'ваш-новый-секретный-ключ'  # ИЛИ берите из переменной окружения
# SECRET_KEY = os.environ.get('DJANGO_SECRET_KEY', 'fallback-key')

# 2. DEBUG = False (ОБЯЗАТЕЛЬНО для production!)
DEBUG = False

# 3. ALLOWED_HOSTS - добавьте ваш домен и IP
ALLOWED_HOSTS = [
    'beauty-print.ru',
    'www.beauty-print.ru',
    'ваш_ip_адрес',
    'localhost',
    '127.0.0.1'
]

# ========== INSTALLED APPS ==========
# Убедитесь что в начале списка стоит 'daphne'
INSTALLED_APPS = [
    'daphne',  # ВАЖНО: должно быть первым!
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'channels',
    'counter',
]

# ========== ASGI CONFIGURATION ==========
# Должна быть строка:
ASGI_APPLICATION = 'clickcounter.asgi.application'

# ========== REDIS CHANNEL LAYERS ==========
# ОЧЕНЬ ВАЖНО для синхронизации WebSocket между процессами!
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

# ========== STATIC FILES ==========
STATIC_URL = '/static/'
STATIC_ROOT = '/var/www/www-root/data/www/beauty-print.ru/staticfiles/'

# WhiteNoise для прямого обслуживания статики
STATICFILES_STORAGE = 'whitenoise.storage.CompressedManifestStaticFilesStorage'

# ========== MEDIA FILES (если понадобятся) ==========
MEDIA_URL = '/media/'
MEDIA_ROOT = '/var/www/www-root/data/www/beauty-print.ru/media/'

# ========== DATABASE ==========
# Используется SQLite (если не меняли) или PostgreSQL
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': '/var/www/www-root/data/www/beauty-print.ru/db.sqlite3',
    }
}

# Если хотите использовать PostgreSQL (рекомендуется для production):
# DATABASES = {
#     'default': {
#         'ENGINE': 'django.db.backends.postgresql',
#         'NAME': 'beauty_print_db',
#         'USER': 'beauty_print_user',
#         'PASSWORD': 'ваш_сложный_пароль',
#         'HOST': 'localhost',
#         'PORT': '5432',
#     }
# }

# ========== SSL/HTTPS SETTINGS ==========
# Если используется SSL (https) за Nginx
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
SECURE_SSL_REDIRECT = True
CSRF_COOKIE_SECURE = True
SESSION_COOKIE_SECURE = True

# ========== LOGGING ==========
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'handlers': {
        'file': {
            'level': 'INFO',
            'class': 'logging.FileHandler',
            'filename': '/var/www/www-root/data/www/beauty-print.ru/logs/django.log',
        },
    },
    'root': {
        'handlers': ['file'],
        'level': 'INFO',
    },
}
```

### 4.2 Создайте папку для логов

```bash
# Создайте папку logs если ее нет
mkdir -p /var/www/www-root/data/www/beauty-print.ru/logs

# Дайте права на запись
chmod 755 /var/www/www-root/data/www/beauty-print.ru/logs
```

---

## 🗄️ ЭТАП 5: Инициализация базы данных

### 5.1 Примените миграции

```bash
# Убедитесь что находитесь в правильной директории
cd /var/www/www-root/data/www/beauty-print.ru

# Активируйте виртуальное окружение если не активировано
source venv/bin/activate

# Примените миграции (создаст базу данных)
python manage.py migrate

# Вывод должен быть похож на:
# Operations to perform:
#   Apply all migrations: admin, auth, contenttypes, counter, sessions
# Running migrations:
#   Applying admin.0001_initial... OK
#   ...
```

### 5.2 Соберите статические файлы

```bash
# Соберите все статические файлы (CSS, JS, изображения) в одну папку
python manage.py collectstatic --noinput

# Это создаст папку staticfiles/ с готовыми файлами для Nginx
```

### 5.3 (Опционально) Создайте суперпользователя для админки

```bash
# Только если хотите использовать админ-панель Django
python manage.py createsuperuser

# Следуйте подсказкам: введите username, email, пароль
```

---

## 🔌 ЭТАП 6: Настройка Redis (для WebSocket синхронизации)

### 6.1 Проверьте и запустите Redis

```bash
# Проверьте статус Redis
systemctl status redis-server

# Если не запущен, запустите его
systemctl start redis-server

# Включите автозапуск
systemctl enable redis-server

# Проверьте что работает
redis-cli ping
# Должно вывести: PONG
```

### 6.2 Настройте Redis для production (опционально)

```bash
# Откройте конфиг Redis
nano /etc/redis/redis.conf

# Найдите и измените:
# maxmemory 256mb  <- максимум памяти
# maxmemory-policy allkeys-lru  <- удаляет старые данные если переполнится

# После изменений перезагрузите Redis:
systemctl restart redis-server
```

---

## ⚡ ЭТАП 7: Запуск Daphne ASGI сервера

### 7.1 Тестовый запуск

```bash
# Перейдите в директорию проекта
cd /var/www/www-root/data/www/beauty-print.ru

# Активируйте виртуальное окружение
source venv/bin/activate

# Запустите Daphne в foreground для тестирования
daphne -b 127.0.0.1 -p 8000 clickcounter.asgi:application

# Вы должны увидеть:
# 2025-XX-XX XX:XX:XX INFO     Starting server at tcp:port=8000:interface=127.0.0.1
# 2025-XX-XX XX:XX:XX INFO     Listening on TCP address 127.0.0.1:8000

# Если работает - отлично! Нажмите Ctrl+C для остановки
```

### 7.2 Запуск в фоновом режиме через systemd (рекомендуется)

**Создайте файл конфигурации systemd:**

```bash
# Создайте файл сервиса
sudo tee /etc/systemd/system/daphne-beauty.service > /dev/null << 'EOF'
# ===== Systemd сервис для Daphne ASGI сервера =====
# Файл: /etc/systemd/system/daphne-beauty.service

[Unit]
Description=Daphne ASGI Server for beauty-print.ru
After=network.target
After=redis-server.service

[Service]
# Запуск от пользователя root (или создайте отдельного пользователя)
User=root
Group=www-data
WorkingDirectory=/var/www/www-root/data/www/beauty-print.ru

# Активируем виртуальное окружение и запускаем Daphne
ExecStart=/var/www/www-root/data/www/beauty-print.ru/venv/bin/daphne \
    -b 127.0.0.1 \
    -p 8000 \
    clickcounter.asgi:application

# Перезапуск при падении
Restart=always
RestartSec=10

# Таймауты
TimeoutStopSec=5
KillMode=mixed

# Логирование
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

# Активируйте сервис
systemctl daemon-reload
systemctl enable daphne-beauty.service
systemctl start daphne-beauty.service

# Проверьте статус
systemctl status daphne-beauty.service

# Должна быть строка: Active: active (running)
```

**Или запуск через Supervisor (альтернатива):**

```bash
# Создайте файл конфигурации Supervisor
sudo tee /etc/supervisor/conf.d/daphne-beauty.conf > /dev/null << 'EOF'
# ===== Supervisor конфиг для Daphne =====
# Файл: /etc/supervisor/conf.d/daphne-beauty.conf

[program:daphne-beauty]
# Директория проекта
directory=/var/www/www-root/data/www/beauty-print.ru

# Команда запуска
command=/var/www/www-root/data/www/beauty-print.ru/venv/bin/daphne \
    -b 127.0.0.1 -p 8000 clickcounter.asgi:application

# Пользователь от которого запускать
user=root

# Автоматический запуск и перезапуск
autostart=true
autorestart=true

# Логирование
stdout_logfile=/var/www/www-root/data/www/beauty-print.ru/logs/daphne.log
stderr_logfile=/var/www/www-root/data/www/beauty-print.ru/logs/daphne_error.log

# Кол-во процессов
numprocs=1
EOF

# Перезагрузите Supervisor
supervisorctl reread
supervisorctl update
supervisorctl start daphne-beauty

# Проверьте статус
supervisorctl status daphne-beauty
# Должно вывести: daphne-beauty                RUNNING   pid XXXX, uptime 0:00:XX
```

---

## 🌐 ЭТАП 8: Настройка Nginx как reverse proxy

### 8.1 Создайте конфигурацию Nginx

```bash
# Создайте файл конфигурации для вашего домена
sudo tee /etc/nginx/sites-available/beauty-print.ru > /dev/null << 'EOF'
# ===== Nginx конфигурация для beauty-print.ru =====
# Файл: /etc/nginx/sites-available/beauty-print.ru

# Редирект с http на https
server {
    listen 80;
    listen [::]:80;
    server_name beauty-print.ru www.beauty-print.ru;
    
    # Редирект всех запросов на https
    return 301 https://$server_name$request_uri;
}

# Основной сервер с HTTPS
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name beauty-print.ru www.beauty-print.ru;

    # ===== SSL сертификаты (уже установлены) =====
    # Путь к сертификатам (зависит от вашего провайдера)
    # Обычно находятся в /etc/ssl/ или /home/certificates/
    ssl_certificate /path/to/certificate.crt;
    ssl_certificate_key /path/to/private.key;
    
    # Если используется Let's Encrypt:
    # ssl_certificate /etc/letsencrypt/live/beauty-print.ru/fullchain.pem;
    # ssl_certificate_key /etc/letsencrypt/live/beauty-print.ru/privkey.pem;

    # ===== SSL параметры =====
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # ===== Логирование =====
    access_log /var/log/nginx/beauty-print-access.log;
    error_log /var/log/nginx/beauty-print-error.log;

    # ===== Основное приложение (проксирование на Daphne) =====
    location / {
        # Адрес Daphne сервера
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        
        # ===== ВАЖНО для WebSocket! =====
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        
        # ===== Стандартные заголовки =====
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # ===== Таймауты (важно для WebSocket!) =====
        proxy_connect_timeout 7d;
        proxy_send_timeout 7d;
        proxy_read_timeout 7d;
    }

    # ===== WebSocket маршрут (явно) =====
    location /ws/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        
        # WebSocket headers
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        
        # Длинные таймауты для WebSocket
        proxy_connect_timeout 7d;
        proxy_send_timeout 7d;
        proxy_read_timeout 7d;
    }

    # ===== Статические файлы (CSS, JS, изображения) =====
    location /static/ {
        alias /var/www/www-root/data/www/beauty-print.ru/staticfiles/;
        
        # Кэширование статики (нужно для оптимизации)
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # ===== Медиа файлы (если понадобятся) =====
    location /media/ {
        alias /var/www/www-root/data/www/beauty-print.ru/media/;
        expires 30d;
    }

    # ===== Запрет доступа к скрытым файлам =====
    location ~ /\. {
        deny all;
    }
}
EOF

# Активируйте конфигурацию (создайте символическую ссылку)
sudo ln -s /etc/nginx/sites-available/beauty-print.ru /etc/nginx/sites-enabled/

# Отключите конфиг по умолчанию если нужно
# sudo rm /etc/nginx/sites-enabled/default
```

### 8.2 Проверьте конфигурацию Nginx

```bash
# Проверьте синтаксис конфигурации
sudo nginx -t

# Вывод должен быть:
# nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
# nginx: configuration file /etc/nginx/nginx.conf test is successful
```

### 8.3 Перезагрузите Nginx

```bash
# Перезагрузите Nginx чтобы применились изменения
sudo systemctl reload nginx

# Проверьте статус
sudo systemctl status nginx

# Должно быть: Active: active (running)
```

---

## 🔒 ЭТАП 9: Проверка SSL и безопасности

### 9.1 Проверьте что SSL работает

```bash
# Проверьте где находятся сертификаты
ls -la /etc/ssl/ 
# или
find / -name "certificate*" 2>/dev/null | head -10

# Проверьте дату истечения сертификата
openssl x509 -in /path/to/certificate.crt -text -noout | grep -A2 "Validity"
```

### 9.2 Убедитесь что на файлы есть правильные права

```bash
# Проверьте права на корневую папку домена
ls -la /var/www/www-root/data/www/

# Выставьте правильные права
chmod 755 /var/www/www-root/data/www/beauty-print.ru
chmod 755 /var/www/www-root/data/www/beauty-print.ru/staticfiles
chmod 755 /var/www/www-root/data/www/beauty-print.ru/logs

# Дайте права на запись логам и базе данных
chmod 666 /var/www/www-root/data/www/beauty-print.ru/db.sqlite3
chmod 666 /var/www/www-root/data/www/beauty-print.ru/logs/django.log
```

---

## 🧪 ЭТАП 10: Тестирование приложения

### 10.1 Проверьте что всё запущено

```bash
# 1. Проверьте что Daphne работает
systemctl status daphne-beauty.service
# или
supervisorctl status daphne-beauty

# 2. Проверьте что Nginx работает
systemctl status nginx

# 3. Проверьте что Redis работает
systemctl status redis-server

# 4. Проверьте что порт 8000 прослушивается
netstat -tuln | grep 8000
# или
ss -tuln | grep 8000
```

### 10.2 Откройте приложение в браузере

```bash
# Откройте в браузере:
https://beauty-print.ru

# Проверьте что:
# ✅ Страница загружается
# ✅ Видна кнопка "Нажми меня!" со счетчиком
# ✅ Статус WebSocket: "Подключено" (в браузере, консоль F12)
# ✅ При нажатии кнопки счетчик увеличивается
```

### 10.3 Откройте несколько вкладок для проверки синхронизации

```bash
# 1. Откройте https://beauty-print.ru в первой вкладке
# 2. Откройте https://beauty-print.ru в второй вкладке
# 3. Нажмите кнопку в первой вкладке
# 4. Счетчик должен обновиться ВО ВТОРОЙ вкладке сразу же!
# 5. Это означает что WebSocket работает корректно!
```

---

## 📊 ЭТАП 11: Мониторинг и логирование

### 11.1 Просмотр логов Daphne

```bash
# Если используете systemd:
sudo journalctl -u daphne-beauty.service -f
# (-f флаг означает "follow" - показывать новые логи в реальном времени)

# Если используете supervisor:
tail -f /var/www/www-root/data/www/beauty-print.ru/logs/daphne.log
```

### 11.2 Просмотр логов Nginx

```bash
# Логи ошибок
sudo tail -f /var/log/nginx/beauty-print-error.log

# Логи доступа
sudo tail -f /var/log/nginx/beauty-print-access.log
```

### 11.3 Просмотр логов Django

```bash
# Логи приложения Django
tail -f /var/www/www-root/data/www/beauty-print.ru/logs/django.log
```

### 11.4 Проверьте использование памяти и CPU

```bash
# Общая информация о процессах
top

# Более подробный просмотр Python процессов
ps aux | grep python
ps aux | grep daphne

# Использование памяти Redis
redis-cli INFO memory
```

---

## 🔄 ЭТАП 12: Автоматический запуск при перезагрузке

### 12.1 Убедитесь что сервисы запускаются автоматически

```bash
# Проверьте что все включены для автозапуска
systemctl is-enabled nginx
systemctl is-enabled redis-server
systemctl is-enabled daphne-beauty.service
# или
systemctl is-enabled supervisor

# Все должны вывести: enabled

# Если не включены, включите:
systemctl enable nginx
systemctl enable redis-server
systemctl enable daphne-beauty.service
```

### 12.2 Протестируйте перезагрузку (опционально)

```bash
# Перезагрузите VPS
sudo reboot

# Подождите 30 секунд пока сервер перезагружается
sleep 30

# Подключитесь снова и проверьте что всё работает
ssh root@beauty-print.ru
systemctl status nginx
systemctl status redis-server
systemctl status daphne-beauty.service

# Откройте в браузере https://beauty-print.ru и проверьте
```

---

## 🆘 Решение проблем

### Проблема 1: WebSocket не подключается

```bash
# Причина: Daphne не запущен или Nginx неправильно настроен
# Решение:

# 1. Проверьте что Daphne запущен
systemctl status daphne-beauty.service

# 2. Проверьте логи Daphne
sudo journalctl -u daphne-beauty.service -n 50

# 3. Проверьте логи Nginx
sudo tail -20 /var/log/nginx/beauty-print-error.log

# 4. Убедитесь что в Nginx есть строки для WebSocket:
grep -A5 "Upgrade" /etc/nginx/sites-available/beauty-print.ru

# 5. Перезагрузите Nginx
sudo systemctl reload nginx
```

### Проблема 2: "502 Bad Gateway"

```bash
# Причина: Daphne не слушает на 127.0.0.1:8000
# Решение:

# 1. Проверьте что Daphne слушает на нужном адресе
netstat -tuln | grep 8000
ss -tuln | grep 8000

# 2. Перезагрузите Daphne
sudo systemctl restart daphne-beauty.service

# 3. Проверьте конфиг Nginx (должно быть proxy_pass http://127.0.0.1:8000;)
cat /etc/nginx/sites-available/beauty-print.ru | grep proxy_pass

# 4. Проверьте логи ошибок Nginx
sudo tail -50 /var/log/nginx/beauty-print-error.log
```

### Проблема 3: Redis connection error

```bash
# Причина: Redis не запущен или не слушает
# Решение:

# 1. Проверьте статус Redis
systemctl status redis-server

# 2. Если не запущен, запустите его
systemctl start redis-server

# 3. Проверьте что Redis работает
redis-cli ping
# Должно вывести: PONG

# 4. Если не помогает, проверьте конфиг settings.py
grep -A5 "CHANNEL_LAYERS" /var/www/www-root/data/www/beauty-print.ru/clickcounter/settings.py
```

### Проблема 4: Статические файлы не загружаются (404 ошибка)

```bash
# Причина: Статика не собрана или неправильный путь в Nginx
# Решение:

# 1. Пересоберите статику
cd /var/www/www-root/data/www/beauty-print.ru
source venv/bin/activate
python manage.py collectstatic --noinput --clear

# 2. Проверьте что папка staticfiles существует и содержит файлы
ls -la /var/www/www-root/data/www/beauty-print.ru/staticfiles/

# 3. Проверьте пути в Nginx
grep -A2 "/static/" /etc/nginx/sites-available/beauty-print.ru

# 4. Перезагрузите Nginx
sudo systemctl reload nginx
```

### Проблема 5: Ошибка "Address already in use"

```bash
# Причина: Порт 8000 уже занят другим процессом
# Решение:

# 1. Найдите какой процесс занимает порт
sudo lsof -i :8000

# 2. Убейте процесс (замените PID на номер из вывода)
kill -9 PID

# 3. Или измените порт в systemd сервисе на другой (8001, 8002)
sudo nano /etc/systemd/system/daphne-beauty.service
# Измените -p 8000 на -p 8001
# Также обновите proxy_pass в Nginx

# 4. Перезагрузите systemd и Nginx
sudo systemctl daemon-reload
sudo systemctl restart daphne-beauty.service
sudo systemctl reload nginx
```

---

## 📋 Итоговый чеклист

- [ ] SSH подключение работает
- [ ] Python 3 и pip установлены
- [ ] Git, Redis, Nginx установлены
- [ ] Проект загружен в `/var/www/www-root/data/www/beauty-print.ru/`
- [ ] Виртуальное окружение создано и активировано
- [ ] Зависимости установлены из requirements.txt
- [ ] settings.py обновлен для production
- [ ] Папка logs создана
- [ ] Миграции применены (python manage.py migrate)
- [ ] Статика собрана (python manage.py collectstatic)
- [ ] Redis запущен и работает
- [ ] Daphne запущен и слушает на 127.0.0.1:8000
- [ ] Nginx сконфигурирован и перезагружен
- [ ] SSL сертификат установлен и работает
- [ ] https://beauty-print.ru открывается в браузере
- [ ] WebSocket подключен (статус "Подключено")
- [ ] Счетчик синхронизируется между вкладками
- [ ] Логирование работает
- [ ] Все сервисы включены для автозапуска

---

## 🎉 Готово!

Ваше приложение теперь развернуто и работает на VPS Majordomo.ru! 

**Домен**: https://beauty-print.ru  
**WebSocket**: Синхронизирует данные в реальном времени  
**SSL**: Защищено сертификатом  
**Автозапуск**: При перезагрузке сервера все сервисы запустятся автоматически  

---

## 📞 Быстрые команды для управления

```bash
# DAPHNE
sudo systemctl start daphne-beauty.service
sudo systemctl stop daphne-beauty.service
sudo systemctl restart daphne-beauty.service
sudo systemctl status daphne-beauty.service

# NGINX
sudo systemctl reload nginx
sudo systemctl restart nginx
sudo systemctl status nginx

# REDIS
sudo systemctl start redis-server
sudo systemctl stop redis-server
sudo systemctl restart redis-server
sudo systemctl status redis-server

# ЛОГИРОВАНИЕ
sudo journalctl -u daphne-beauty.service -f
sudo tail -f /var/log/nginx/beauty-print-error.log
tail -f /var/www/www-root/data/www/beauty-print.ru/logs/django.log

# ПЕРЕЗАГРУЗКА VPS
sudo reboot

# ВЫКЛЮЧЕНИЕ VPS
sudo shutdown -h now
```

---

**Успехов в развертывании!** 🚀
