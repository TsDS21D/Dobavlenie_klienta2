"""
views.py - обновленная версия с аутентификацией
"""

from django.shortcuts import render, redirect
from django.views.decorators.cache import never_cache
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.decorators import login_required
from django.contrib.auth.forms import UserCreationForm
from django.contrib import messages
from .models import Order
from .forms import LoginForm, RegistrationForm


def login_view(request):
    """
    Представление для входа пользователя в систему.
    
    Параметры:
    - request: HTTP запрос
    
    Возвращает:
    - При успешном входе: перенаправление на главную страницу
    - При ошибке: страницу входа с сообщением об ошибке
    """
    
    # Если пользователь уже аутентифицирован, перенаправляем на главную
    if request.user.is_authenticated:
        return redirect('index')
    
    # Если запрос POST - обрабатываем данные формы
    if request.method == 'POST':
        # Создаем форму с данными из запроса
        form = LoginForm(data=request.POST)
        
        # Проверяем валидность формы
        if form.is_valid():
            # Извлекаем очищенные данные
            username = form.cleaned_data.get('username')
            password = form.cleaned_data.get('password')
            
            # Аутентифицируем пользователя
            user = authenticate(request, username=username, password=password)
            
            # Если аутентификация успешна
            if user is not None:
                # Входим в систему (создаем сессию)
                login(request, user)
                
                # Добавляем сообщение об успехе
                messages.success(request, f'Добро пожаловать, {user.username}!')
                
                # Перенаправляем на главную страницу
                return redirect('index')
            else:
                # Если аутентификация не удалась
                messages.error(request, 'Неверное имя пользователя или пароль.')
        else:
            # Если форма невалидна
            messages.error(request, 'Пожалуйста, исправьте ошибки в форме.')
    
    else:
        # Если запрос GET - создаем пустую форму
        form = LoginForm()
    
    # Рендерим страницу входа с формой
    return render(request, 'counter/login.html', {
        'form': form,
        'title': 'Вход в систему'
    })


def register_view(request):
    """
    Представление для регистрации нового пользователя.
    
    Параметры:
    - request: HTTP запрос
    
    Возвращает:
    - При успешной регистрации: перенаправление на страницу входа
    - При ошибке: страницу регистрации с сообщением об ошибке
    """
    
    # Если пользователь уже аутентифицирован, перенаправляем на главную
    if request.user.is_authenticated:
        return redirect('index')
    
    # Если запрос POST - обрабатываем данные формы
    if request.method == 'POST':
        # Создаем форму с данными из запроса
        form = RegistrationForm(request.POST)
        
        # Проверяем валидность формы
        if form.is_valid():
            # Сохраняем пользователя
            user = form.save()
            
            # Добавляем сообщение об успехе
            messages.success(
                request, 
                f'Аккаунт {user.username} успешно создан! Теперь вы можете войти.'
            )
            
            # Перенаправляем на страницу входа
            return redirect('login')
        else:
            # Если форма невалидна
            messages.error(request, 'Пожалуйста, исправьте ошибки в форме.')
    
    else:
        # Если запрос GET - создаем пустую форму
        form = RegistrationForm()
    
    # Рендерим страницу регистрации с формой
    return render(request, 'counter/register.html', {
        'form': form,
        'title': 'Регистрация'
    })


def logout_view(request):
    """
    Представление для выхода пользователя из системы.
    
    Параметры:
    - request: HTTP запрос
    
    Возвращает:
    - Перенаправление на страницу входа
    """
    
    # Выходим из системы (удаляем сессию)
    logout(request)
    
    # Добавляем сообщение об успешном выходе
    messages.info(request, 'Вы успешно вышли из системы.')
    
    # Перенаправляем на страницу входа
    return redirect('login')


@login_required(login_url='/login/')  # Декоратор требует аутентификации
@never_cache
def index(request):
    """
    Главная страница системы управления заказами.
    Доступна только аутентифицированным пользователям.
    
    Параметры:
    - request: HTTP запрос
    
    Возвращает:
    - HTTP ответ с главной страницей
    """
    
    # Получаем все заказы из базы данных
    orders = Order.objects.all()
    
    # Рендерим главную страницу с дополнительным контекстом
    response = render(request, 'counter/index.html', {
        'orders': orders,
        'user': request.user,  # Передаем объект пользователя в шаблон
    })
    
    # Добавляем заголовки для предотвращения кэширования
    response['Cache-Control'] = 'no-cache, no-store, must-revalidate, max-age=0'
    response['Pragma'] = 'no-cache'
    response['Expires'] = '0'
    
    return response