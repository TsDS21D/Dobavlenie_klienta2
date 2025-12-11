"""
views.py
View-функции Django - обработчики HTTP запросов.
Определяют, что возвращать в ответ на запросы к разным URL.
"""

from django.shortcuts import render  # Функция для рендеринга HTML шаблонов
from django.views.decorators.cache import never_cache  # Декоратор для отключения кэширования
from .models import Order  # Импорт модели Order для работы с базой данных


@never_cache  # Декоратор, который отключает кэширование для этой страницы
def index(request):
    """
    View-функция для главной страницы приложения.
    Обрабатывает GET запросы к корневому URL ('/').
    
    Параметры:
    - request: объект HTTP запроса от клиента
    
    Возвращает:
    - HTTP ответ с отрендеренным HTML шаблоном
    """
    
    # Получаем ВСЕ заказы из базы данных
    # Order.objects.all() возвращает QuerySet - набор всех объектов Order
    orders = Order.objects.all()
    
    # Рендерим HTML шаблон с контекстом данных
    # Параметры:
    # 1. request - объект запроса
    # 2. 'counter/index.html' - путь к шаблону относительно папки templates приложения
    # 3. {'orders': orders} - словарь контекста (данные для передачи в шаблон)
    response = render(request, 'counter/index.html', {'orders': orders})
    
    # Добавляем HTTP заголовки для предотвращения кэширования страницы
    # Это важно, чтобы браузер всегда получал свежие данные
    
    # Cache-Control - основной заголовок управления кэшированием
    # no-cache: кэш должен проверять актуальность данных с сервером
    # no-store: запрещает сохранять данные в кэш
    # must-revalidate: требует повторной валидации устаревших ресурсов
    # max-age=0: время жизни кэша 0 секунд
    response['Cache-Control'] = 'no-cache, no-store, must-revalidate, max-age=0'
    
    # Pragma - устаревший заголовок для совместимости с HTTP/1.0
    response['Pragma'] = 'no-cache'
    
    # Expires - дата истечения срока действия кэша (0 = сразу истекает)
    response['Expires'] = '0'
    
    # Возвращаем подготовленный HTTP ответ
    return response