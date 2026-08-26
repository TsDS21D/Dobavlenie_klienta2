"""
views.py для приложения sheet_formats
Обработчики HTTP запросов для страницы управления форматами листов
"""

from django.shortcuts import render, redirect
from django.contrib.auth.decorators import login_required
from django.views.decorators.cache import never_cache
from django.contrib import messages
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST
from .models import SheetFormat
from .forms import SheetFormatForm, SheetFormatEditForm


@login_required(login_url='/counter/login/')
@never_cache
def index(request):
    """
    Главная страница приложения sheet_formats - управление форматами листов
    Отображает список всех форматов и кнопку для открытия формы добавления нового
    Обрабатывает POST запросы для добавления новых форматов
    Args:
        request: HTTP запрос
    Returns:
        HttpResponse: Страница с форматами
    """
    
    # Получаем все форматы из базы данных, отсортированные по имени
    formats = SheetFormat.objects.all().order_by('name')
    
    # Обработка POST запроса (добавление нового формата)
    if request.method == 'POST':
        # Создаем экземпляр формы с данными из POST запроса
        form = SheetFormatForm(request.POST)
        
        # Проверяем валидность формы
        if form.is_valid():
            # Сохраняем новый формат в базу данных
            sheet_format = form.save()
            
            # Добавляем сообщение об успехе
            messages.success(
                request, 
                f'Формат "{sheet_format.name}" ({sheet_format.get_dimensions_display()}) успешно добавлен!'
            )
            
            # Перенаправляем на эту же страницу (чтобы избежать повторной отправки формы)
            return redirect('sheet_formats:index')
        else:
            # Если форма невалидна, показываем ошибки
            for field, errors in form.errors.items():
                for error in errors:
                    messages.error(request, f'Ошибка в поле "{form[field].label}": {error}')
    else:
        # Для GET запроса создаем пустую форму
        form = SheetFormatForm()
    
    # Создаем пустую форму редактирования для использования в шаблоне
    edit_form = SheetFormatEditForm()
    
    # Создаем контекст для передачи в шаблон
    context = {
        'formats': formats,  # Список всех форматов
        'form': form,        # Форма для добавления формата
        'edit_form': edit_form,  # Форма для редактирования формата
        'user': request.user,  # Текущий пользователь
        'active_app': 'sheet_formats',  # Для выделения активного приложения в панели навигации
    }
    
    # Рендерим шаблон с контекстом
    response = render(request, 'sheet_formats/index.html', context)
    
    # Запрещаем кэширование страницы
    response['Cache-Control'] = 'no-cache, no-store, must-revalidate, max-age=0'
    response['Pragma'] = 'no-cache'
    response['Expires'] = '0'
    
    return response


@login_required(login_url='/counter/login/')
def delete_format(request, format_id):
    """
    Удаляет формат из базы данных
    Args:
        request: HTTP запрос
        format_id: ID формата для удаления
    Returns:
        HttpResponseRedirect: Перенаправление на главную страницу sheet_formats
    """
    try:
        # Получаем формат по ID из базы данных
        sheet_format = SheetFormat.objects.get(id=format_id)
        format_name = sheet_format.name
        format_dimensions = sheet_format.get_dimensions_display()
        
        # Удаляем формат из базы данных
        sheet_format.delete()
        
        # Добавляем сообщение об успешном удалении
        messages.success(
            request, 
            f'Формат "{format_name}" ({format_dimensions}) удален из базы данных.'
        )
        
    except SheetFormat.DoesNotExist:
        # Если формат не найден, показываем ошибку
        messages.error(request, 'Формат не найден.')
    
    # Перенаправляем на главную страницу
    return redirect('sheet_formats:index')


@login_required(login_url='/counter/login/')
@require_POST
@csrf_exempt
def update_format(request, format_id):
    """
    Обрабатывает AJAX-запрос на обновление параметров формата
    Args:
        request: HTTP запрос с данными для обновления
        format_id: ID формата, который нужно обновить
    Returns:
        JsonResponse: JSON-ответ с результатом операции
    """
    try:
        # Получаем формат по ID
        sheet_format = SheetFormat.objects.get(id=format_id)
        
        print(f"DEBUG: Получен запрос на обновление формата {format_id}")
        print(f"DEBUG: Данные запроса: {request.POST}")
        print(f"DEBUG: Тело запроса: {request.body}")
        
        # Определяем формат данных запроса
        if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
            # Это AJAX запрос, данные в JSON формате
            import json
            try:
                data = json.loads(request.body)
                print(f"DEBUG: JSON данные: {data}")
            except json.JSONDecodeError as e:
                print(f"DEBUG: Ошибка парсинга JSON: {e}")
                return JsonResponse({
                    'success': False,
                    'message': 'Некорректный JSON формат данных'
                }, status=400)
        else:
            # Обычный POST запрос
            data = request.POST.dict()
            print(f"DEBUG: POST данные: {data}")
        
        # Создаем форму редактирования с данными из запроса
        form = SheetFormatEditForm(data, instance=sheet_format)
        
        if form.is_valid():
            # Сохраняем изменения
            updated_format = form.save()
            
            print(f"DEBUG: Формат успешно обновлен: {updated_format.name}")
            
            # Подготавливаем данные для ответа
            response_data = {
                'success': True,
                'message': f'Формат "{updated_format.name}" успешно обновлен',
                'format': {
                    'id': updated_format.id,
                    'name': updated_format.name,
                    'width_mm': updated_format.width_mm,
                    'height_mm': updated_format.height_mm,
                    'dimensions_display': updated_format.get_dimensions_display(),
                }
            }
            
            return JsonResponse(response_data)
        else:
            # Если форма невалидна, возвращаем ошибки
            errors = {}
            for field, error_list in form.errors.items():
                errors[field] = [str(error) for error in error_list]
            
            print(f"DEBUG: Ошибки валидации: {errors}")
            
            return JsonResponse({
                'success': False,
                'message': 'Ошибка валидации данных',
                'errors': errors
            }, status=400)
            
    except SheetFormat.DoesNotExist:
        # Если формат не найден
        print(f"DEBUG: Формат с ID {format_id} не найден")
        return JsonResponse({
            'success': False,
            'message': f'Формат с ID {format_id} не найден'
        }, status=404)
        
    except Exception as e:
        # Обработка неожиданных ошибок
        import traceback
        error_details = traceback.format_exc()
        print(f"DEBUG: Внутренняя ошибка: {str(e)}")
        print(f"DEBUG: Детали ошибки: {error_details}")
        
        return JsonResponse({
            'success': False,
            'message': f'Внутренняя ошибка сервера: {str(e)}'
        }, status=500)