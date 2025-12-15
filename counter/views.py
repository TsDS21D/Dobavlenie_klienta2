"""
views.py
View-функции Django - обработчики HTTP запросов.
"""

from django.shortcuts import render, redirect
from django.views.decorators.cache import never_cache
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.decorators import login_required
from django.contrib import messages
from .models import Order
from .forms import LoginForm


def login_view(request):
    """Представление для входа пользователя в систему."""
    
    if request.user.is_authenticated:
        return redirect('index')
    
    if request.method == 'POST':
        form = LoginForm(data=request.POST)
        
        if form.is_valid():
            username = form.cleaned_data.get('username')
            password = form.cleaned_data.get('password')
            
            user = authenticate(request, username=username, password=password)
            
            if user is not None:
                login(request, user)
                messages.success(request, f'Добро пожаловать, {user.username}!')
                return redirect('index')
            else:
                messages.error(request, 'Неверное имя пользователя или пароль.')
        else:
            messages.error(request, 'Пожалуйста, исправьте ошибки в форме.')
    
    else:
        form = LoginForm()
    
    return render(request, 'counter/login.html', {'form': form, 'title': 'Вход в систему'})



def logout_view(request):
    """Представление для выхода пользователя из системы."""
    
    logout(request)
    messages.info(request, 'Вы успешно вышли из системы.')
    
    return redirect('login')


@login_required(login_url='/login/')
@never_cache
def index(request):
    """Главная страница системы управления заказами."""
    
    orders = Order.objects.all()
    
    response = render(request, 'counter/index.html', {
        'orders': orders,
        'user': request.user,
    })
    
    response['Cache-Control'] = 'no-cache, no-store, must-revalidate, max-age=0'
    response['Pragma'] = 'no-cache'
    response['Expires'] = '0'
    
    return response