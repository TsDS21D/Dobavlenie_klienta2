"""
views.py для приложения devices
Обработчики HTTP запросов для страницы управления принтерами
"""

from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.views.decorators.cache import never_cache
from django.contrib import messages
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST
from django.db import transaction
from .models import Printer
from .forms import PrinterForm, PrinterEditForm
from sheet_formats.models import SheetFormat  # Импортируем для проверки


@login_required(login_url='/counter/login/')
@never_cache
def index(request):
    """
    Главная страница приложения devices - управление принтерами
    
    Отображает список всех принтеров и форму для добавления нового
    """
    
    # Получаем все принтеры из базы, отсортированные по названию
    printers = Printer.objects.all().select_related('sheet_format').order_by('name')
    
    # Получаем все форматы для выпадающего списка
    formats = SheetFormat.objects.all().order_by('name')
    
    # Обработка POST запроса (добавление нового принтера)
    if request.method == 'POST':
        # Создаем экземпляр формы с данными из запроса
        form = PrinterForm(request.POST)
        
        # Проверяем валидность формы
        if form.is_valid():
            try:
                # Используем транзакцию для безопасного сохранения
                with transaction.atomic():
                    # Сохраняем принтер
                    printer = form.save()
                
                # Добавляем сообщение об успехе
                messages.success(
                    request,
                    f'✅ Принтер "{printer.name}" успешно добавлен!\n'
                    f'Формат: {printer.sheet_format.name}, '
                    f'Поля: {printer.margin_mm} мм, '
                    f'Коэффициент: {printer.get_duplex_display()}'
                )
                
                # Перенаправляем на эту же страницу (чтобы избежать повторной отправки формы)
                return redirect('devices:index')
                
            except Exception as e:
                # Обработка ошибок при сохранении
                messages.error(request, f'❌ Ошибка при сохранении принтера: {str(e)}')
        else:
            # Если форма невалидна, показываем ошибки
            for field, errors in form.errors.items():
                for error in errors:
                    # Получаем человеко-читаемое имя поля
                    field_label = form.fields[field].label if field in form.fields else field
                    messages.error(request, f'❌ Ошибка в поле "{field_label}": {error}')
    else:
        # Для GET запроса создаем пустую форму
        form = PrinterForm()
    
    # Создаем контекст для передачи в шаблон
    context = {
        'printers': printers,      # Список всех принтеров
        'formats': formats,        # Список всех форматов (для проверки)
        'form': form,              # Форма добавления принтера
        'user': request.user,      # Текущий пользователь
        'active_app': 'devices',   # Для выделения активного приложения в навигации
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
    Удаляет принтер из базы данных
    
    Args:
        request: HTTP запрос
        printer_id: ID принтера для удаления
        
    Returns:
        HttpResponseRedirect: Перенаправление на главную страницу devices
    """
    try:
        # Получаем принтер по ID или возвращаем 404
        printer = get_object_or_404(Printer, id=printer_id)
        printer_name = printer.name
        format_name = printer.sheet_format.name
        
        # Удаляем принтер
        printer.delete()
        
        # Добавляем сообщение об успешном удалении
        messages.success(
            request,
            f'✅ Принтер "{printer_name}" ({format_name}) удален из базы данных.'
        )
        
    except Exception as e:
        # Обработка ошибок
        messages.error(request, f'❌ Ошибка при удалении принтера: {str(e)}')
    
    # Перенаправляем на главную страницу
    return redirect('devices:index')


@login_required(login_url='/counter/login/')
@require_POST
@csrf_exempt
def update_printer(request, printer_id):
    """
    Обрабатывает AJAX-запрос на обновление параметров принтера
    
    Args:
        request: HTTP запрос с данными для обновления
        printer_id: ID принтера, который нужно обновить
        
    Returns:
        JsonResponse: JSON-ответ с результатом операции
    """
    try:
        # Получаем принтер по ID
        printer = Printer.objects.get(id=printer_id)
        
        # Определяем формат данных запроса
        if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
            # Это AJAX запрос, данные могут быть в JSON
            import json
            try:
                # Пробуем получить данные из JSON
                data = json.loads(request.body)
            except json.JSONDecodeError:
                # Если не JSON, берем из POST
                data = request.POST.dict()
        else:
            # Обычный POST запрос
            data = request.POST.dict()
        
        # Создаем форму редактирования с данными из запроса
        form = PrinterEditForm(data, instance=printer)
        
        if form.is_valid():
            try:
                # Используем транзакцию для безопасного сохранения
                with transaction.atomic():
                    # Сохраняем изменения
                    updated_printer = form.save()
                
                # Подготавливаем данные для ответа
                response_data = {
                    'success': True,
                    'message': f'Принтер "{updated_printer.name}" успешно обновлен',
                    'printer': updated_printer.to_dict(),
                }
                
                return JsonResponse(response_data)
                
            except Exception as e:
                # Обработка ошибок при сохранении
                return JsonResponse({
                    'success': False,
                    'message': f'Ошибка при сохранении: {str(e)}'
                }, status=500)
                
        else:
            # Если форма невалидна, возвращаем ошибки
            errors = {}
            for field, error_list in form.errors.items():
                errors[field] = [str(error) for error in error_list]
            
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
        import traceback
        error_details = traceback.format_exc()
        
        return JsonResponse({
            'success': False,
            'message': f'Внутренняя ошибка сервера: {str(e)}'
        }, status=500)