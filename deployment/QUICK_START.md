# Быстрый старт развертывания на Majordomo.ru

## Минимальные шаги для запуска

### 1. Подключитесь к SSH
```bash
ssh u35459@beauty-print.ru
```

### 2. Скачайте проект
```bash
cd ~
mkdir django_app
cd django_app

# Если код на GitHub:
git clone https://github.com/ваш-repo/проект.git .

# Или загрузите через SCP с локального компьютера:
# scp -r /путь/к/проекту/* u35459@beauty-print.ru:~/django_app/
```

### 3. Установите зависимости
```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 4. Настройте settings.py
Замените эти строки в `clickcounter/settings.py`:

```python
DEBUG = False
ALLOWED_HOSTS = ['beauty-print.ru', 'www.beauty-print.ru']

CHANNEL_LAYERS = {
    'default': {
        'BACKEND': 'channels_redis.core.RedisChannelLayer',
        'CONFIG': {
            "hosts": [('unix:///home/u35459/redis.socket', 0)],
        },
    },
}
```

### 5. Примените миграции
```bash
python manage.py migrate
python manage.py collectstatic --noinput
```

### 6. Запустите сервер
```bash
# В фоне
nohup daphne -b 0.0.0.0 -p 8000 clickcounter.asgi:application > daphne.log 2>&1 &

# Проверьте запуск
ps aux | grep daphne
tail -f daphne.log
```

### 7. Настройте Nginx
Отправьте запрос в поддержку Majordomo.ru с конфигурацией из файла `nginx_config.conf`

### 8. Настройте SSL
В панели управления Majordomo включите Let's Encrypt для beauty-print.ru

### 9. Готово!
Откройте https://beauty-print.ru и проверьте работу

---

## Команды управления

**Остановить:**
```bash
pkill -f daphne
```

**Перезапустить:**
```bash
pkill -f daphne
cd ~/django_app
source venv/bin/activate
nohup daphne -b 0.0.0.0 -p 8000 clickcounter.asgi:application > daphne.log 2>&1 &
```

**Посмотреть логи:**
```bash
tail -f ~/django_app/daphne.log
```

**Проверить состояние:**
```bash
cd ~/django_app
bash check_deployment.sh
```

---

## В случае проблем

1. Проверьте логи: `tail -f daphne.log`
2. Убедитесь что Daphne запущен: `ps aux | grep daphne`
3. Проверьте Redis: `ls -la /home/u35459/redis.socket`
4. Напишите в поддержку: support@majordomo.ru

---

Подробная инструкция в файле `DEPLOYMENT_MAJORDOMO.md`
