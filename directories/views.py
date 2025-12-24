"""
views.py для приложения "directories".
Главная страница приложения "Справочники".
"""

from django.shortcuts import render
from django.views.decorators.cache import never_cache
from django.contrib.auth.decorators import login_required

@login_required(login_url='/counter/login/')
@never_cache
def index(request):
    """
    Обработчик главной страницы приложения "Справочники".
    Возвращает страницу с навигационными карточками для справочников.
    """
    
    context = {
        'user': request.user,
        'active_app': 'directories',
        'page_title': 'Справочники - Типография Буква А',
    }
    
    # Используем наш новый шаблон с наследованием
    return render(request, 'directories/index.html', context)