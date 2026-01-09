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
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
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
                    f'Коэффициент: {printer.get_duplex_display()}, '
                    f'Интерполяция: {printer.get_interpolation_method_display_short()}'  # ДОБАВЛЯЕМ ИНФОРМАЦИЮ
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
        # ДОБАВЛЯЕМ КОНСТАНТЫ ДЛЯ ШАБЛОНА
        'INTERPOLATION_LINEAR': Printer.INTERPOLATION_LINEAR,
        'INTERPOLATION_LOGARITHMIC': Printer.INTERPOLATION_LOGARITHMIC,
        'INTERPOLATION_CHOICES': Printer.INTERPOLATION_CHOICES,
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


@login_required(login_url='/counter/login/')
@csrf_exempt
def calculate_price_devices(request, printer_id):
    """
    НОВАЯ VIEW-ФУНКЦИЯ: Рассчитывает цену за лист для произвольного тиража
    
    Использует метод интерполяции принтера и данные из модели PrintPrice
    
    Args:
        request: HTTP запрос
        printer_id: ID принтера для расчета
        
    Returns:
        JsonResponse: JSON-ответ с результатом расчета
    """
    try:
        # Получаем принтер по ID
        printer = Printer.objects.get(id=printer_id)
        
        # Получаем тираж из GET или POST параметров
        copies_str = request.GET.get('copies') or request.POST.get('copies')
        
        # Проверяем, что тираж указан
        if not copies_str:
            return JsonResponse({
                'success': False,
                'message': 'Не указан тираж для расчета'
            }, status=400)
        
        try:
            # Преобразуем тираж в целое число
            copies = int(copies_str)
            
            # Проверяем, что тираж положительный
            if copies <= 0:
                return JsonResponse({
                    'success': False,
                    'message': 'Тираж должен быть положительным числом'
                }, status=400)
                
        except ValueError:
            # Если не удалось преобразовать в число
            return JsonResponse({
                'success': False,
                'message': 'Тираж должен быть целым числом'
            }, status=400)
        
        # Вызываем метод расчета цены для произвольного тиража
        calculated_price = printer.calculate_price_for_arbitrary_copies_devices(copies)
        
        # Если расчет не удался (например, нет данных о ценах)
        if calculated_price is None:
            return JsonResponse({
                'success': False,
                'message': 'Не удалось рассчитать цену. Проверьте, есть ли данные о ценах для этого принтера в разделе "Цены печати".'
            }, status=400)
        
        try:
            # Рассчитываем общую стоимость (цена за лист * тираж)
            total_price = calculated_price * Decimal(copies)
            total_price = total_price.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
            
            # Форматируем результаты для отображения
            calculated_price_formatted = f"{calculated_price:.2f}"
            total_price_formatted = f"{total_price:.2f}"
            
            # Возвращаем успешный ответ
            return JsonResponse({
                'success': True,
                'message': f'Цена рассчитана успешно',
                'data': {
                    'printer_id': printer_id,
                    'printer_name': printer.name,
                    'copies': copies,
                    'calculated_price': float(calculated_price),  # Для JSON
                    'calculated_price_formatted': calculated_price_formatted,
                    'calculated_price_display': f"{calculated_price_formatted} руб./лист",
                    'total_price': float(total_price),  # Для JSON
                    'total_price_formatted': total_price_formatted,
                    'total_price_display': f"{total_price_formatted} руб.",
                    'interpolation_method': printer.devices_interpolation_method,
                    'interpolation_method_display': printer.get_interpolation_method_display_short(),
                }
            })
            
        except (InvalidOperation, TypeError) as e:
            # Ошибка при расчете
            return JsonResponse({
                'success': False,
                'message': f'Ошибка при расчете стоимости: {str(e)}'
            }, status=500)
            
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