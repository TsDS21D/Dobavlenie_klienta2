# 🔧 Команды управления сервисами Systemd

Быстрый справочник команд для управления приложением на VPS.

## Основные команды для Daphne

```bash
# ЗАПУСК Daphne сервера
sudo systemctl start daphne-beauty.service

# ОСТАНОВКА Daphne
sudo systemctl stop daphne-beauty.service

# ПЕРЕЗАПУСК (очень полезно после изменений в коде)
sudo systemctl restart daphne-beauty.service

# ПЕРЕЗАГРУЗКА конфигурации (мягче, чем restart)
sudo systemctl reload daphne-beauty.service

# СТАТУС (показывает запущен ли сервис)
sudo systemctl status daphne-beauty.service

# ВКЛЮЧИТЬ АВТОЗАПУСК при перезагрузке VPS
sudo systemctl enable daphne-beauty.service

# ОТКЛЮЧИТЬ АВТОЗАПУСК
sudo systemctl disable daphne-beauty.service

# ПРОВЕРИТЬ АВТОЗАПУСК (enabled/disabled)
sudo systemctl is-enabled daphne-beauty.service
```

## Просмотр логов Daphne

```bash
# ПОСЛЕДНИЕ 50 строк логов
sudo journalctl -u daphne-beauty.service -n 50

# ПОСЛЕДНИЕ 100 строк
sudo journalctl -u daphne-beauty.service -n 100

# В РЕАЛЬНОМ ВРЕМЕНИ (новые логи по мере появления)
sudo journalctl -u daphne-beauty.service -f

# Логи за последние N минут
sudo journalctl -u daphne-beauty.service --since "30 min ago"

# Логи за последний час
sudo journalctl -u daphne-beauty.service --since "1 hour ago"

# Логи за определенный день
sudo journalctl -u daphne-beauty.service --since "2025-01-15"

# Экспортировать логи в файл
sudo journalctl -u daphne-beauty.service > /tmp/daphne_logs.txt
```

## Команды для Nginx

```bash
# ПРОВЕРИТЬ СИНТАКСИС конфигурации (перед перезагрузкой!)
sudo nginx -t

# ПЕРЕЗАГРУЗИТЬ Nginx (мягче, чем restart)
sudo systemctl reload nginx

# ПЕРЕЗАПУСТИТЬ Nginx (сильнее)
sudo systemctl restart nginx

# ОСТАНОВИТЬ Nginx
sudo systemctl stop nginx

# ЗАПУСТИТЬ Nginx
sudo systemctl start nginx

# СТАТУС Nginx
sudo systemctl status nginx

# ВКЛЮЧИТЬ АВТОЗАПУСК
sudo systemctl enable nginx

# ПРОВЕРИТЬ что включен для автозапуска
sudo systemctl is-enabled nginx
```

## Команды для Redis

```bash
# ЗАПУСТИТЬ Redis
sudo systemctl start redis-server

# ОСТАНОВИТЬ Redis
sudo systemctl stop redis-server

# ПЕРЕЗАГРУЗИТЬ Redis
sudo systemctl restart redis-server

# СТАТУС Redis
sudo systemctl status redis-server

# ВКЛЮЧИТЬ АВТОЗАПУСК
sudo systemctl enable redis-server

# ПРОВЕРКА что Redis работает
redis-cli ping
# Должно вывести: PONG

# Получить информацию о Redis
redis-cli INFO

# Получить использование памяти
redis-cli INFO memory

# Остановить Redis через CLI
redis-cli shutdown
```

## Полезные комбинации команд

```bash
# ПРОВЕРИТЬ что ВСЕ СЕРВИСЫ ЗАПУЩЕНЫ
echo "=== Nginx ===" && sudo systemctl status nginx | grep Active
echo "=== Daphne ===" && sudo systemctl status daphne-beauty.service | grep Active
echo "=== Redis ===" && sudo systemctl status redis-server | grep Active

# ПЕРЕЗАГРУЗИТЬ ВСЕ СЕРВИСЫ
sudo systemctl restart daphne-beauty.service
sudo systemctl restart nginx
sudo systemctl restart redis-server

# ВКЛЮЧИТЬ АВТОЗАПУСК ДЛЯ ВСЕХ
sudo systemctl enable daphne-beauty.service nginx redis-server

# ПРОВЕРИТЬ КАКИЕ ПРОЦЕССЫ СЛУШАЮТ КАКИЕ ПОРТЫ
sudo netstat -tuln | grep -E "8000|80|443|6379"
# или
sudo ss -tuln | grep -E "8000|80|443|6379"

# НАЙТИ PID процесса и убить его
ps aux | grep daphne  # найти PID
kill -9 <PID>         # убить процесс

# ПРОВЕРИТЬ сколько памяти использует каждый сервис
ps aux | grep -E "nginx|daphne|redis" | grep -v grep
```

## Отладка проблем

```bash
# ПРОВЕРИТЬ что порт 8000 прослушивается Daphne
netstat -tuln | grep 8000
ss -tuln | grep 8000

# ПРОВЕРИТЬ что порт 80 и 443 прослушиваются Nginx
netstat -tuln | grep -E "80|443"
ss -tuln | grep -E "80|443"

# ПРОВЕРИТЬ что порт 6379 прослушивается Redis
netstat -tuln | grep 6379
ss -tuln | grep 6379

# ПОСМОТРЕТЬ СКОЛЬКО ПАМЯТИ ИСПОЛЬЗУЕТ КАЖДЫЙ ПРОЦЕСС
ps aux --sort=-%mem | grep -E "nginx|daphne|redis"

# ПРОВЕРИТЬ CPU использование
top -b -n 1 | grep -E "nginx|daphne|redis"

# ПЕРЕЗАГРУЗИТЬ ОС (на VPS)
sudo reboot

# ВЫКЛЮЧИТЬ ОС
sudo shutdown -h now

# ВЫКЛЮЧИТЬ через N минут
sudo shutdown -h +10  # выключить через 10 минут

# ОТМЕНА выключения
sudo shutdown -c
```

## Примеры использования

### Сценарий 1: Обновление кода и перезапуск приложения

```bash
# 1. Остановите Daphne
sudo systemctl stop daphne-beauty.service

# 2. Обновите код проекта
cd /var/www/www-root/data/www/beauty-print.ru
git pull origin main

# 3. Примените миграции если есть
source venv/bin/activate
python manage.py migrate
python manage.py collectstatic --noinput

# 4. Перезапустите Daphne
sudo systemctl start daphne-beauty.service

# 5. Проверьте статус
sudo systemctl status daphne-beauty.service

# 6. Перезагрузите Nginx
sudo systemctl reload nginx
```

### Сценарий 2: Проверка что всё работает после перезагрузки VPS

```bash
# 1. Подождите 30 секунд после перезагрузки VPS
sleep 30

# 2. Подключитесь к VPS
ssh root@beauty-print.ru

# 3. Проверьте статус всех сервисов
sudo systemctl status nginx
sudo systemctl status redis-server
sudo systemctl status daphne-beauty.service

# 4. Все должны быть: Active: active (running)

# 5. Проверьте что сервисы слушают на нужных портах
netstat -tuln | grep -E "8000|80|443|6379"

# 6. Откройте в браузере и проверьте
# https://beauty-print.ru
```

### Сценарий 3: Просмотр ошибок и логов

```bash
# 1. Посмотрите последние ошибки Daphne
sudo journalctl -u daphne-beauty.service -n 50

# 2. Посмотрите ошибки Nginx
sudo tail -50 /var/log/nginx/beauty-print-error.log

# 3. Посмотрите ошибки Django
tail -50 /var/www/www-root/data/www/beauty-print.ru/logs/django.log

# 4. Если ошибок в журналах - попробуйте перезапустить сервис
sudo systemctl restart daphne-beauty.service
sudo systemctl reload nginx
```

### Сценарий 4: Увеличение памяти Redis

```bash
# 1. Откройте конфиг Redis
sudo nano /etc/redis/redis.conf

# 2. Найдите строку maxmemory и измените:
# maxmemory 256mb  -> maxmemory 512mb

# 3. Сохраните (Ctrl+O, Enter, Ctrl+X)

# 4. Перезагрузите Redis
sudo systemctl restart redis-server

# 5. Проверьте что изменение применилось
redis-cli CONFIG GET maxmemory
```

## Часто используемые команды

| Задача | Команда |
|--------|---------|
| Перезагрузить приложение | `sudo systemctl restart daphne-beauty.service` |
| Посмотреть ошибки | `sudo journalctl -u daphne-beauty.service -f` |
| Обновить код | `cd /var/www/www-root/data/www/beauty-print.ru && git pull && python manage.py migrate` |
| Перезагрузить VPS | `sudo reboot` |
| Проверить порты | `netstat -tuln \| grep -E "8000\|80\|443"` |
| Проверить память | `free -h` |
| Проверить диск | `df -h` |
| Проверить CPU | `top -b -n 1 \| head -20` |

---

**Помните**: Всегда используйте `sudo nginx -t` перед `sudo systemctl reload nginx`!
