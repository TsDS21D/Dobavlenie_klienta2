"""
calculator/views.py
View-функции Django для приложения "Калькулятор заказов".
Это новое приложение для расчёта стоимости заказов типографии.
"""

from django.shortcuts import render
from django.views.decorators.cache import never_cache
from django.contrib.auth.decorators import login_required


@login_required(login_url='/login/')
@never_cache
def index(request):
    """
    Главная страница калькулятора заказов.
    Отображает простую страницу с навигацией и заголовком.
    
    Args:
        request: HTTP-запрос от клиента
    
    Returns:
        HTTP-ответ с отрендеренным шаблоном
    """
    # Передаём в контекст данные пользователя для отображения в шаблоне
    return render(request, 'calculator/index.html', {
        'user': request.user,  # Объект текущего пользователя
    })