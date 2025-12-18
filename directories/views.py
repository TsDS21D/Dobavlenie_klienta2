"""
views.py - обработчики HTTP-запросов для приложения "directories".
"""

from django.shortcuts import render
from django.views.decorators.cache import never_cache
from django.contrib.auth.decorators import login_required

@login_required(login_url='/counter/login/')
@never_cache
def index(request):
    """
    Обработчик главной страницы приложения "Справочники".
    Теперь страница содержит только кнопку для перехода в "Шаблоны изделий".
    """
    
    context = {
        'user': request.user,
        'active_app': 'directories',
        'page_title': 'Справочники - Типография Буква А',
    }
    
    return render(request, 'directories/index.html', context)