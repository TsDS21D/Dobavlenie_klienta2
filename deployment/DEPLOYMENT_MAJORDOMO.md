# Инструкция по развертыванию Django WebSocket приложения на Majordomo.ru

## Информация о вашей конфигурации

- **Хостинг**: Majordomo.ru (Виртуальный хостинг)
- **Домен**: beauty-print.ru
- **Redis**: Unix-socket `/home/u35459/redis.socket`
- **SSH доступ**: Есть
- **Python/pip**: Доступны

---

## Шаг 1: Подключение к серверу через SSH

Откройте терминал на своем компьютере и подключитесь:

```bash
ssh u35459@beauty-print.ru
# Или через IP адрес:
# ssh u35459@ваш_ip_адрес
```

Введите пароль когда запросит.

---

## Шаг 2: Проверка окружения

После подключения проверьте доступность необходимых инструментов:

```bash
# Проверка Python
python3 --version

# Проверка pip
pip3 --version

# Проверка Redis
ls -la /home/u35459/redis.socket

# Узнайте домашнюю директорию
pwd
# Обычно это /home/u35459/
```

---

## Шаг 3: Создание структуры проекта

```bash
# Перейдите в домашнюю директорию
cd ~

# Создайте папку для проекта
mkdir -p django_app
cd django_app
```

---

## Шаг 4: Создание виртуального окружения

```bash
# Создайте виртуальное окружение
python3 -m venv venv

# Активируйте его
source venv/bin/activate

# После активации вы увидите (venv) в начале строки
```

---

## Шаг 5: Загрузка проекта на сервер

### Вариант A: Через Git (рекомендуется)

```bash
# Если у вас код на GitHub
git clone https://github.com/ваш-username/django-websocket-counter.git .

# Или создайте файлы вручную (см. Вариант B)
```

### Вариант B: Создание файлов вручную

```bash
# Создайте requirements.txt
cat > requirements.txt << 'EOF'
Django==4.2.7
channels==4.0.0
daphne==4.0.0
channels-redis==4.1.0
redis==5.0.1
EOF
```

Затем создайте все файлы проекта (см. раздел "Файлы проекта" ниже).

---

## Шаг 6: Установка зависимостей

```bash
# Убедитесь что виртуальное окружение активно (venv)
pip install --upgrade pip
pip install -r requirements.txt
```

---

## Шаг 7: Настройка Django для production

### 7.1 Обновите `clickcounter/settings.py`

Найдите и измените следующие параметры:

```python
# SECURITY WARNING: keep the secret key used in production secret!
import os
SECRET_KEY = os.environ.get('DJANGO_SECRET_KEY', 'django-insecure-4kej=1toi&@-lykpnan(d7%yctg0posv6312a60k2a0v%lr&5v')

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = False

ALLOWED_HOSTS = ['beauty-print.ru', 'www.beauty-print.ru', '*.majordomo.ru']

# Channel Layers с Redis
CHANNEL_LAYERS = {
    'default': {
        'BACKEND': 'channels_redis.core.RedisChannelLayer',
        'CONFIG': {
            "hosts": [('unix:///home/u35459/redis.socket', 0)],
        },
    },
}

# Static files
STATIC_URL = '/static/'
STATIC_ROOT = os.path.join(BASE_DIR, 'staticfiles')

# Cache control для предотвращения кэширования
MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

# Добавьте в конец файла
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
```

### 7.2 Создайте файл `.env` для секретов (опционально)

```bash
cat > .env << 'EOF'
DJANGO_SECRET_KEY=ваш-новый-секретный-ключ-сгенерируйте-его
DEBUG=False
EOF
```

Сгенерировать секретный ключ:
```bash
python3 -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"
```

---

## Шаг 8: Применение миграций

```bash
# Убедитесь что вы в папке проекта и venv активно
python manage.py migrate

# Соберите статические файлы
python manage.py collectstatic --noinput
```

---

## Шаг 9: Проверка работы Redis

```bash
# Проверьте что Redis работает
redis-cli -s /home/u35459/redis.socket ping
# Должно вернуть: PONG

# Если команда не работает, значит Redis уже настроен через сокет
# и channels-redis сможет к нему подключиться
```

---

## Шаг 10: Запуск Daphne сервера

### 10.1 Тестовый запуск

```bash
# Запустите Daphne для теста (в foreground)
daphne -b 0.0.0.0 -p 8000 clickcounter.asgi:application

# Если запустилось без ошибок, нажмите Ctrl+C для остановки
```

### 10.2 Запуск в фоновом режиме

#### Создайте скрипт запуска

```bash
cat > start_daphne.sh << 'EOF'
#!/bin/bash
cd /home/u35459/django_app
source venv/bin/activate
daphne -b 0.0.0.0 -p 8000 clickcounter.asgi:application
EOF

# Сделайте скрипт исполняемым
chmod +x start_daphne.sh
```

#### Запустите в фоне с помощью screen или nohup

**Вариант A: Screen (рекомендуется)**

```bash
# Установите screen если нет
# (Может потребоваться обратиться в поддержку)
screen -S django_app

# Запустите Daphne
cd ~/django_app
source venv/bin/activate
daphne -b 0.0.0.0 -p 8000 clickcounter.asgi:application

# Нажмите Ctrl+A затем D для отсоединения от screen
# Вернуться: screen -r django_app
```

**Вариант B: Nohup**

```bash
cd ~/django_app
source venv/bin/activate
nohup daphne -b 0.0.0.0 -p 8000 clickcounter.asgi:application > daphne.log 2>&1 &

# Проверить что запущено
ps aux | grep daphne

# Посмотреть логи
tail -f daphne.log
```

---

## Шаг 11: Настройка Nginx (через панель управления Majordomo)

На Majordomo.ru обычно используется панель управления. Вам нужно:

### 11.1 Настроить проксирование для WebSocket

Обратитесь в **техподдержку Majordomo.ru** (support@majordomo.ru) с таким запросом:

```
Тема: Настройка проксирования для Django WebSocket приложения

Здравствуйте!

Прошу настроить Nginx для проксирования WebSocket соединений на моем домене beauty-print.ru:

1. HTTP трафик на порт 8000 (где запущен Daphne ASGI сервер)
2. WebSocket соединения (/ws/) также на порт 8000
3. Статические файлы из /home/u35459/django_app/staticfiles/

Необходима следующая конфигурация Nginx:

location / {
    proxy_pass http://127.0.0.1:8000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

location /ws/ {
    proxy_pass http://127.0.0.1:8000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
}

location /static/ {
    alias /home/u35459/django_app/staticfiles/;
}

Спасибо!
```

### 11.2 Альтернатива: Использовать другой порт

Если у вас есть доступ к портам, можете запустить на:
- 8000, 8080, 8888 или другом доступном порту
- Уточните в поддержке какие порты доступны

---

## Шаг 12: Настройка SSL (HTTPS)

Для WebSocket **обязательно** нужен HTTPS. В панели Majordomo:

1. Перейдите в раздел SSL сертификатов
2. Включите Let's Encrypt для beauty-print.ru
3. Или установите свой SSL сертификат

После установки SSL обновите в `counter/templates/counter/index.html`:

```javascript
// Измените определение протокола WebSocket
const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const wsUrl = `${protocol}//${window.location.host}/ws/counter/`;
```

---

## Шаг 13: Тестирование

### 13.1 Проверка работы приложения

```bash
# Откройте в браузере
https://beauty-print.ru

# Проверьте:
# 1. Страница загружается
# 2. Статус подключения показывает "Подключено"
# 3. Счетчик увеличивается при нажатии
# 4. Откройте 2 вкладки - счетчик синхронизируется
```

### 13.2 Просмотр логов

```bash
# Если использовали nohup
tail -f ~/django_app/daphne.log

# Если использовали screen
screen -r django_app
# Логи видны в реальном времени
```

---

## Шаг 14: Автоматический запуск при перезагрузке

### Создайте cron задачу для автозапуска

```bash
# Откройте crontab
crontab -e

# Добавьте строку (измените путь если нужно)
@reboot cd /home/u35459/django_app && source venv/bin/activate && nohup daphne -b 0.0.0.0 -p 8000 clickcounter.asgi:application > daphne.log 2>&1 &
```

---

## Возможные проблемы и решения

### Проблема 1: WebSocket не подключается

**Решение:**
```bash
# Проверьте что Daphne запущен
ps aux | grep daphne

# Проверьте логи
tail -f daphne.log

# Убедитесь что Nginx проксирует WebSocket
curl -I http://127.0.0.1:8000
```

### Проблема 2: Redis connection error

**Решение:**
```bash
# Проверьте права на сокет
ls -la /home/u35459/redis.socket

# Попробуйте альтернативный путь в settings.py
CHANNEL_LAYERS = {
    'default': {
        'BACKEND': 'channels.layers.InMemoryChannelLayer'
    }
}
# Это временное решение без Redis
```

### Проблема 3: Static files не загружаются

**Решение:**
```bash
# Пересоберите статику
python manage.py collectstatic --noinput --clear

# Проверьте права
chmod -R 755 ~/django_app/staticfiles
```

### Проблема 4: Permission denied

**Решение:**
```bash
# Дайте права на выполнение
chmod +x ~/django_app/manage.py
chmod +x ~/django_app/start_daphne.sh

# Проверьте владельца файлов
ls -la ~/django_app
```

---

## Управление приложением

### Остановка Daphne

```bash
# Найдите процесс
ps aux | grep daphne

# Остановите по PID
kill <PID>

# Или если использовали screen
screen -r django_app
# Нажмите Ctrl+C
```

### Перезапуск после изменений

```bash
# 1. Остановите текущий процесс
pkill -f daphne

# 2. Активируйте venv
cd ~/django_app
source venv/bin/activate

# 3. Примените изменения (если были)
python manage.py migrate
python manage.py collectstatic --noinput

# 4. Запустите снова
nohup daphne -b 0.0.0.0 -p 8000 clickcounter.asgi:application > daphne.log 2>&1 &
```

---

## Контакты поддержки Majordomo

- **Email**: support@majordomo.ru
- **Телефон**: +7 (495) 721-84-65
- **Онлайн-чат**: на сайте majordomo.ru
- **Среднее время ответа**: 2 часа

---

## Чеклист развертывания

- [ ] Подключен к SSH
- [ ] Создано виртуальное окружение
- [ ] Установлены зависимости
- [ ] Настроен settings.py (DEBUG=False, ALLOWED_HOSTS, Redis)
- [ ] Применены миграции
- [ ] Собраны статические файлы
- [ ] Daphne запущен и работает
- [ ] Nginx настроен (запрос в поддержку отправлен)
- [ ] SSL сертификат установлен
- [ ] Приложение доступно на beauty-print.ru
- [ ] WebSocket соединение работает
- [ ] Счетчик синхронизируется между вкладками
- [ ] Настроен автозапуск через cron

---

## Дополнительная оптимизация

### Использование Supervisor (если доступен)

```bash
# Проверьте наличие supervisor
which supervisorctl

# Если есть, создайте конфиг
# /etc/supervisor/conf.d/django_app.conf
[program:django_app]
command=/home/u35459/django_app/venv/bin/daphne -b 0.0.0.0 -p 8000 clickcounter.asgi:application
directory=/home/u35459/django_app
user=u35459
autostart=true
autorestart=true
redirect_stderr=true
stdout_logfile=/home/u35459/django_app/daphne.log
```

---

## Мониторинг

### Проверка работы приложения

```bash
# Создайте скрипт мониторинга
cat > check_app.sh << 'EOF'
#!/bin/bash
if ! pgrep -f "daphne" > /dev/null; then
    echo "Daphne не запущен! Перезапуск..."
    cd /home/u35459/django_app
    source venv/bin/activate
    nohup daphne -b 0.0.0.0 -p 8000 clickcounter.asgi:application > daphne.log 2>&1 &
fi
EOF

chmod +x check_app.sh

# Добавьте в cron для проверки каждые 5 минут
crontab -e
# Добавьте: */5 * * * * /home/u35459/django_app/check_app.sh
```

---

**Готово!** Приложение развернуто и работает на beauty-print.ru 🎉
