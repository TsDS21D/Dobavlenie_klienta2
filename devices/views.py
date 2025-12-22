"""
views.py
View-функции Django для приложения devices.
Обработчики HTTP запросов для страницы управления принтерами.
"""

# ===== ИМПОРТЫ =====
from django.shortcuts import render, redirect
from django.contrib.auth.decorators import login_required
from django.views.decorators.cache import never_cache
from django.contrib import messages
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST
from .models import Printer
from .forms import PrinterForm, PrinterEditForm


# ===== ГЛАВНАЯ СТРАНИЦА =====
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
    
    # Создаем пустую форму редактирования для использования в шаблоне
    edit_form = PrinterEditForm()
    
    # Создаем контекст для передачи в шаблон
    context = {
        'printers': printers,  # Список всех принтеров
        'form': form,          # Форма для добавления принтера
        'edit_form': edit_form,# Форма для редактирования принтера
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


# ===== УДАЛЕНИЕ ПРИНТЕРА =====
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


# ===== ОБНОВЛЕНИЕ ПРИНТЕРА (AJAX) =====
@login_required(login_url='/counter/login/')
@require_POST
@csrf_exempt
def update_printer(request, printer_id):
    """
    Обрабатывает AJAX-запрос на обновление параметров принтера.
    
    Эта функция:
    1. Принимает POST-запрос с данными для обновления
    2. Валидирует данные через PrinterEditForm
    3. Сохраняет изменения в базе данных
    4. Возвращает JSON-ответ с результатом операции
    
    Args:
        request: HTTP запрос с данными для обновления
        printer_id: ID принтера, который нужно обновить
    
    Returns:
        JsonResponse: JSON-ответ с результатом операции
    """
    try:
        # Получаем принтер по ID или возвращаем 404
        printer = Printer.objects.get(id=printer_id)
        
        # Создаем форму редактирования с данными из запроса
        form = PrinterEditForm(request.POST, instance=printer)
        
        if form.is_valid():
            # Сохраняем изменения
            updated_printer = form.save()
            
            # Подготавливаем данные для ответа
            response_data = {
                'success': True,
                'message': f'Принтер "{updated_printer.name}" успешно обновлен',
                'printer': {
                    'id': updated_printer.id,
                    'name': updated_printer.name,
                    'sheet_format': updated_printer.sheet_format,
                    'width_mm': updated_printer.width_mm,
                    'height_mm': updated_printer.height_mm,
                    'margin_mm': updated_printer.margin_mm,
                    'duplex_coefficient': updated_printer.duplex_coefficient,
                    'dimensions_display': updated_printer.get_dimensions_display(),
                    'margin_display': updated_printer.get_margin_display(),
                    'duplex_display': updated_printer.get_duplex_display(),
                }
            }
            
            return JsonResponse(response_data)
        else:
            # Если форма невалидна, возвращаем ошибки
            errors = {}
            for field, error_list in form.errors.items():
                errors[field] = error_list
            
            return JsonResponse({
                'success': False,
                'message': 'Ошибка валидации данных',
                'errors': errors
            }, status=400)
            
    except Printer.DoesNotExist:
        # Если принтер не найден
        return JsonResponse({
            'success': False,
            'message': f'Принтер с ID {printer_id} не найден'
        }, status=404)
        
    except Exception as e:
        # Обработка неожиданных ошибок
        return JsonResponse({
            'success': False,
            'message': f'Внутренняя ошибка сервера: {str(e)}'
        }, status=500)