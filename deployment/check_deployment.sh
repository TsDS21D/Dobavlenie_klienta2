#!/bin/bash
# Скрипт проверки развертывания Django приложения

echo "================================"
echo "Проверка развертывания Django"
echo "================================"
echo ""

# Цвета для вывода
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Проверка Python
echo -n "Python 3: "
if command -v python3 &> /dev/null; then
    echo -e "${GREEN}✓${NC} $(python3 --version)"
else
    echo -e "${RED}✗ Не установлен${NC}"
fi

# Проверка pip
echo -n "pip: "
if command -v pip3 &> /dev/null; then
    echo -e "${GREEN}✓${NC} $(pip3 --version | cut -d' ' -f1-2)"
else
    echo -e "${RED}✗ Не установлен${NC}"
fi

# Проверка виртуального окружения
echo -n "Виртуальное окружение: "
if [ -d "venv" ]; then
    echo -e "${GREEN}✓${NC} Найдено"
else
    echo -e "${RED}✗ Не найдено${NC}"
fi

# Проверка requirements.txt
echo -n "requirements.txt: "
if [ -f "requirements.txt" ]; then
    echo -e "${GREEN}✓${NC} Найден"
else
    echo -e "${RED}✗ Не найден${NC}"
fi

# Проверка Redis socket
echo -n "Redis socket: "
if [ -S "/home/u35459/redis.socket" ]; then
    echo -e "${GREEN}✓${NC} Доступен"
else
    echo -e "${YELLOW}⚠${NC} Не найден (проверьте путь)"
fi

# Проверка Django
echo -n "Django: "
if [ -f "manage.py" ]; then
    echo -e "${GREEN}✓${NC} Найден manage.py"
else
    echo -e "${RED}✗ manage.py не найден${NC}"
fi

# Проверка миграций
echo -n "Миграции: "
if [ -d "counter/migrations" ]; then
    echo -e "${GREEN}✓${NC} Найдены"
else
    echo -e "${YELLOW}⚠${NC} Не найдены"
fi

# Проверка процесса Daphne
echo -n "Daphne процесс: "
if pgrep -f "daphne" > /dev/null; then
    PID=$(pgrep -f "daphne")
    echo -e "${GREEN}✓${NC} Запущен (PID: $PID)"
else
    echo -e "${RED}✗ Не запущен${NC}"
fi

# Проверка порта 8000
echo -n "Порт 8000: "
if netstat -tuln 2>/dev/null | grep -q ":8000"; then
    echo -e "${GREEN}✓${NC} Прослушивается"
elif ss -tuln 2>/dev/null | grep -q ":8000"; then
    echo -e "${GREEN}✓${NC} Прослушивается"
else
    echo -e "${RED}✗ Не прослушивается${NC}"
fi

# Проверка staticfiles
echo -n "Статические файлы: "
if [ -d "staticfiles" ]; then
    COUNT=$(find staticfiles -type f | wc -l)
    echo -e "${GREEN}✓${NC} Собраны ($COUNT файлов)"
else
    echo -e "${YELLOW}⚠${NC} Не собраны"
fi

# Проверка базы данных
echo -n "База данных: "
if [ -f "db.sqlite3" ]; then
    SIZE=$(du -h db.sqlite3 | cut -f1)
    echo -e "${GREEN}✓${NC} Найдена ($SIZE)"
else
    echo -e "${YELLOW}⚠${NC} Не найдена"
fi

echo ""
echo "================================"
echo "Завершено"
echo "================================"
