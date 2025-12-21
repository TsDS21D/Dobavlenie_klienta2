"""
views.py
View-функции Django для приложения devices.
Обработчики HTTP запросов для страницы управления принтерами.
"""

from django.shortcuts import render, redirect
from django.contrib.auth.decorators import login_required
from django.contrib import messages
from django.views.decorators.cache import never_cache
from .models import Printer
from .forms import PrinterForm


@login_required(login_url='/counter/login/')
@never_cache
def index(request):
    """
    Главная страница приложения devices - управление принтерами.
    
    Отображает список всех принтеров и кнопку для открытия формы добавления нового.
    Обрабатывает POST запросы для добавления новых принтеров.
    
    Args:
        request: HTTP запрос
    
    Returns:
        HttpResponse: Страница с принтерами
    """
    
    # Получаем все принтеры из базы данных, отсортированные по имени
    printers = Printer.objects.all().order_by('name')
    
    # Обработка POST запроса (добавление нового принтера)
    if request.method == 'POST':
        # Создаем экземпляр формы с данными из POST запроса
        form = PrinterForm(request.POST)
        
        # Проверяем валидность формы
        if form.is_valid():
            # Сохраняем новый принтер в базу данных
            printer = form.save()
            
            # Добавляем сообщение об успехе с информацией о новых полях
            messages.success(
                request, 
                f'Принтер "{printer.name}" ({printer.sheet_format}) успешно добавлен! '
                f'Поля: {printer.margin_mm} мм, Коэффициент: {printer.duplex_coefficient}'
            )
            
            # Перенаправляем на эту же страницу (чтобы избежать повторной отправки формы)
            return redirect('devices:index')
        else:
            # Если форма невалидна, показываем ошибки
            for field, errors in form.errors.items():
                for error in errors:
                    messages.error(request, f'Ошибка в поле "{form[field].label}": {error}')
    else:
        # Для GET запроса создаем пустую форму
        form = PrinterForm()
    
    # Создаем контекст для передачи в шаблон
    context = {
        'printers': printers,  # Список всех принтеров
        'form': form,          # Форма для добавления принтера
        'user': request.user,  # Текущий пользователь
        'active_app': 'devices',  # Для выделения активного приложения в панели навигации
    }
    
    # Рендерим шаблон с контекстом
    response = render(request, 'devices/index.html', context)
    
    # Запрещаем кэширование страницы
    response['Cache-Control'] = 'no-cache, no-store, must-revalidate, max-age=0'
    response['Pragma'] = 'no-cache'
    response['Expires'] = '0'
    
    return response


@login_required(login_url='/counter/login/')
def delete_printer(request, printer_id):
    """
    Удаляет принтер из базы данных.
    
    Args:
        request: HTTP запрос
        printer_id: ID принтера для удаления
    
    Returns:
        HttpResponseRedirect: Перенаправление на главную страницу devices
    """
    try:
        # Получаем принтер по ID из базы данных
        printer = Printer.objects.get(id=printer_id)
        printer_name = printer.name
        printer_format = printer.sheet_format
        
        # Удаляем принтер из базы данных
        printer.delete()
        
        # Добавляем сообщение об успешном удалении
        messages.success(
            request, 
            f'Принтер "{printer_name}" ({printer_format}) удален из базы данных.'
        )
        
    except Printer.DoesNotExist:
        # Если принтер не найден, показываем ошибку
        messages.error(request, 'Принтер не найден.')
    
    # Перенаправляем на главную страницу
    return redirect('devices:index')