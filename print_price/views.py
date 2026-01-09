"""
views.py для приложения print_price
Представления для отображения страницы справочника цен на печать (цена за 1 лист)
"""

from django.shortcuts import render, get_object_or_404, redirect
from django.http import JsonResponse
from django.contrib import messages
from django.views.decorators.http import require_POST, require_http_methods
from django.views.decorators.csrf import csrf_exempt
from django.contrib.auth.decorators import login_required
from django.views.decorators.cache import never_cache
import json
from decimal import Decimal
import math  # Добавляем импорт математики для логарифмической интерполяции
from devices.models import Printer
from .models import PrintPrice
from .forms import PrintPriceForm, PrintPriceUpdateForm


@login_required(login_url='/login/')
@never_cache
def index(request):
    """
    Главная страница приложения print_price
    
    Отображает список принтеров в левой колонке и цены для выбранного принтера
    в правой колонке.
    """
    
    # Получаем все принтеры из базы данных
    printers = Printer.objects.all().order_by('name')
    
    # Получаем ID выбранного принтера из GET-параметра
    selected_printer_id = request.GET.get('printer_id')
    selected_printer = None
    print_prices = []
    
    # Если принтер выбран, получаем его и связанные цены
    if selected_printer_id:
        try:
            selected_printer = Printer.objects.get(id=selected_printer_id)
            # Получаем все цены для этого принтера, отсортированные по тиражу
            print_prices = PrintPrice.objects.filter(
                printer=selected_printer
            ).order_by('copies')
        except Printer.DoesNotExist:
            # Если принтер не найден, показываем ошибку
            messages.error(request, "Выбранный принтер не найден")
    
    # Создаем форму для добавления новой цены
    form = PrintPriceForm(initial={'printer': selected_printer})
    
    # Если пришел POST-запрос на добавление цены
    if request.method == 'POST':
        form = PrintPriceForm(request.POST)
        if form.is_valid():
            # Сохраняем новую цену
            print_price = form.save()
            
            # Показываем сообщение об успехе
            messages.success(
                request, 
                f"Цена добавлена: {print_price.copies} шт. - {print_price.price_per_sheet} руб./лист"
            )
            
            # Перенаправляем на ту же страницу с выбранным принтером
            return redirect(f"/print_price/?printer_id={print_price.printer.id}")
    
    # Подготавливаем контекст для шаблона
    context = {
        'printers': printers,
        'selected_printer': selected_printer,
        'print_prices': print_prices,
        'form': form,
    }
    
    # Отображаем шаблон с контекстом
    return render(request, 'print_price/index.html', context)


@require_POST
def create_print_price(request):
    """
    Создание новой цены через AJAX
    
    Args:
        request: POST-запрос с данными цены
    
    Returns:
        JsonResponse: Результат операции
    """
    form = PrintPriceForm(request.POST)
    
    if form.is_valid():
        # Сохраняем новую цену
        print_price = form.save()
        
        # Возвращаем успешный ответ
        return JsonResponse({
            'success': True,
            'message': 'Цена успешно добавлена',
            'print_price': print_price.to_dict(),
        })
    
    else:
        # Если форма невалидна, возвращаем ошибки
        return JsonResponse({
            'success': False,
            'errors': form.errors,
        }, status=400)


@require_POST
def delete_print_price(request, price_id):
    """
    Удаление цены на печать
    
    Args:
        request: POST-запрос
        price_id: ID цены для удаления
    
    Returns:
        JsonResponse или redirect: Результат операции
    """
    # Получаем цену по ID или возвращаем 404
    print_price = get_object_or_404(PrintPrice, id=price_id)
    
    # Сохраняем ID принтера для перенаправления
    printer_id = print_price.printer.id
    
    # Удаляем цену
    print_price.delete()
    
    # Если это AJAX-запрос, возвращаем JSON
    if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
        return JsonResponse({
            'success': True,
            'message': 'Цена удалена',
        })
    
    # Иначе перенаправляем обратно с сообщением
    messages.success(request, "Цена успешно удалена")
    return redirect(f"/print_price/?printer_id={printer_id}")


@require_POST
@csrf_exempt
def update_print_price(request, price_id):
    """
    Обновление существующей цены через AJAX (для in-line редактирования)
    
    Args:
        request: POST-запрос с данными для обновления
        price_id: ID цены для обновления
    
    Returns:
        JsonResponse: Результат операции
    """
    # Получаем цену по ID или возвращаем 404
    print_price = get_object_or_404(PrintPrice, id=price_id)
    
    # Определяем, какое поле обновляется, по данным запроса
    field_name = request.POST.get('field_name')
    new_value = request.POST.get('new_value')
    
    # Проверяем, что оба параметра присутствуют
    if not field_name or new_value is None:
        return JsonResponse({
            'success': False,
            'error': 'Не указано поле для обновления или новое значение'
        }, status=400)
    
    # Проверяем, что поле можно обновлять
    if field_name not in ['copies', 'price_per_sheet']:
        return JsonResponse({
            'success': False,
            'error': f'Поле "{field_name}" нельзя обновлять'
        }, status=400)
    
    try:
        # Преобразуем значение в правильный тип данных
        if field_name == 'copies':
            new_value = int(float(new_value))  # Сначала float, потом int для безопасности
            if new_value < 1:
                raise ValueError("Тираж должен быть положительным числом")
                
        elif field_name == 'price_per_sheet':
            # Заменяем запятую на точку для корректного преобразования
            new_value_str = str(new_value).replace(',', '.')
            new_value = Decimal(new_value_str)  # Используем Decimal для денежных значений
            if new_value < Decimal('0.01'):
                raise ValueError("Цена не может быть меньше 0.01")
        
        # Проверяем уникальность тиража (если обновляется поле copies)
        if field_name == 'copies' and new_value != print_price.copies:
            # Проверяем, нет ли уже записи с таким же тиражем для этого принтера
            existing = PrintPrice.objects.filter(
                printer=print_price.printer,
                copies=new_value
            ).exclude(pk=print_price.pk)  # Исключаем текущую запись
            
            if existing.exists():
                return JsonResponse({
                    'success': False,
                    'error': f'Цена для принтера "{print_price.printer.name}" с тиражем {new_value} шт. уже существует'
                }, status=400)
        
        # Сохраняем старое значение для отладки
        old_value = getattr(print_price, field_name)
        
        # Обновляем поле
        setattr(print_price, field_name, new_value)
        
        # Сохраняем изменения в базе данных
        print_price.save()
        
        # Обновляем объект из базы, чтобы получить актуальные данные
        print_price.refresh_from_db()
        
        # Возвращаем успешный ответ с обновленными данными
        return JsonResponse({
            'success': True,
            'message': 'Цена успешно обновлена',
            'print_price': print_price.to_dict(),
            'field_name': field_name,
            'new_value': str(new_value),
        })
    
    except ValueError as e:
        # Обработка ошибок преобразования типов или валидации
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=400)
    except Exception as e:
        # Обработка всех остальных ошибок
        return JsonResponse({
            'success': False,
            'error': f'Произошла ошибка при обновлении: {str(e)}'
        }, status=500)


@require_POST
@csrf_exempt
@login_required(login_url='/login/')
def update_printer_interpolation_method(request, printer_id):
    """
    Обновление метода интерполяции для принтера через AJAX
    
    Args:
        request: POST-запрос с новым методом интерполяции
        printer_id: ID принтера для обновления
    
    Returns:
        JsonResponse: Результат операции
    """
    try:
        # Получаем принтер по ID или возвращаем 404
        printer = get_object_or_404(Printer, id=printer_id)
        
        # Получаем новый метод интерполяции из запроса
        new_method = request.POST.get('interpolation_method')
        
        # Проверяем, что метод указан
        if not new_method:
            return JsonResponse({
                'success': False,
                'error': 'Не указан метод интерполяции'
            }, status=400)
        
        # Проверяем, что метод валидный (один из разрешенных)
        # Примечание: предполагается, что в модели Printer есть INTERPOLATION_CHOICES
        valid_methods = ['linear', 'logarithmic']  # Упрощенная проверка
        if new_method not in valid_methods:
            return JsonResponse({
                'success': False,
                'error': f'Недопустимый метод интерполяции. Допустимые значения: {", ".join(valid_methods)}'
            }, status=400)
        
        # Сохраняем старое значение для отладки
        old_method = printer.devices_interpolation_method
        
        # Обновляем метод интерполяции
        printer.devices_interpolation_method = new_method
        printer.save()
        
        # Обновляем объект из базы
        printer.refresh_from_db()
        
        # Возвращаем успешный ответ
        return JsonResponse({
            'success': True,
            'message': 'Метод интерполяции успешно обновлен',
            'printer_id': printer.id,
            'printer_name': printer.name,
            'old_method': old_method,
            'new_method': new_method,
            'new_method_display': printer.get_interpolation_method_display_short(),
        })
    
    except Exception as e:
        # Обработка всех ошибок
        return JsonResponse({
            'success': False,
            'error': f'Произошла ошибка при обновлении метода интерполяции: {str(e)}'
        }, status=500)


@require_http_methods(["GET", "POST"])
@csrf_exempt
@login_required(login_url='/login/')
def calculate_arbitrary_copies_price(request, printer_id):
    """
    Расчет цены для произвольного тиража на основе выбранного метода интерполяции
    
    Args:
        request: GET/POST запрос с произвольным тиражом
        printer_id: ID принтера для расчета
    
    Returns:
        JsonResponse: Результат расчета с ценой за лист
    """
    try:
        # Получаем принтер по ID или возвращаем 404
        printer = get_object_or_404(Printer, id=printer_id)
        
        # Определяем, откуда брать данные (GET или POST)
        if request.method == 'POST':
            # Для POST-запросов
            arbitrary_copies = request.POST.get('arbitrary_copies')
        else:
            # Для GET-запросов
            arbitrary_copies = request.GET.get('arbitrary_copies')
        
        # Проверяем, что тираж указан
        if not arbitrary_copies:
            return JsonResponse({
                'success': False,
                'error': 'Не указан тираж для расчета'
            }, status=400)
        
        try:
            # Преобразуем тираж в целое число
            arbitrary_copies_int = int(float(arbitrary_copies))
            
            # Проверяем, что тираж положительный
            if arbitrary_copies_int < 1:
                return JsonResponse({
                    'success': False,
                    'error': 'Тираж должен быть положительным числом'
                }, status=400)
        except (ValueError, TypeError):
            return JsonResponse({
                'success': False,
                'error': 'Тираж должен быть числом'
            }, status=400)
        
        # ВАЖНОЕ ИСПРАВЛЕНИЕ: Проверяем, что у принтера есть сохраненные цены
        price_points = PrintPrice.objects.filter(printer=printer).order_by('copies')
        
        if not price_points.exists():
            return JsonResponse({
                'success': False,
                'error': f'Для принтера "{printer.name}" нет сохраненных цен. Добавьте цены в таблице выше.'
            })
        
        # Получаем метод интерполяции (по умолчанию линейный)
        interpolation_method = getattr(printer, 'devices_interpolation_method', 'linear')
        
        # Получаем минимальную и максимальную цены
        min_price = price_points.first()
        max_price = price_points.last()
        
        # Если запрошенный тираж меньше минимального, возвращаем минимальную цену
        if arbitrary_copies_int <= min_price.copies:
            calculated_price = min_price.price_per_sheet
        
        # Если запрошенный тираж больше максимального, возвращаем максимальную цену
        elif arbitrary_copies_int >= max_price.copies:
            calculated_price = max_price.price_per_sheet
        
        else:
            # Ищем два ближайших тиража для интерполяции
            prev_price = None
            next_price = None
            
            for price in price_points:
                if price.copies <= arbitrary_copies_int:
                    prev_price = price
                if price.copies >= arbitrary_copies_int:
                    next_price = price
                    break
            
            # Если нашли оба значения для интерполяции и они разные
            if prev_price and next_price and prev_price != next_price:
                
                # Линейная интерполяция
                if interpolation_method == 'linear':
                    # Линейная интерполяция между двумя точками
                    x1, y1 = float(prev_price.copies), float(prev_price.price_per_sheet)
                    x2, y2 = float(next_price.copies), float(next_price.price_per_sheet)
                    x = float(arbitrary_copies_int)
                    
                    # Формула линейной интерполяции: y = y1 + (y2 - y1) * (x - x1) / (x2 - x1)
                    result = y1 + (y2 - y1) * (x - x1) / (x2 - x1)
                    calculated_price = Decimal(str(round(result, 2)))
                
                # Логарифмическая интерполяция
                elif interpolation_method == 'logarithmic':
                    # Логарифмическая интерполяция (используем натуральный логарифм)
                    # Для безопасности добавляем небольшую константу к аргументам логарифма
                    epsilon = 1e-10
                    
                    x1 = math.log(float(prev_price.copies) + epsilon)
                    y1 = math.log(float(prev_price.price_per_sheet) + epsilon)
                    x2 = math.log(float(next_price.copies) + epsilon)
                    y2 = math.log(float(next_price.price_per_sheet) + epsilon)
                    x = math.log(float(arbitrary_copies_int) + epsilon)
                    
                    # Линейная интерполяция в логарифмическом пространстве
                    # Формула: y = y1 + (y2 - y1) * (x - x1) / (x2 - x1)
                    result_log = y1 + (y2 - y1) * (x - x1) / (x2 - x1)
                    
                    # Экспоненцируем, чтобы вернуться к обычному пространству
                    result = math.exp(result_log) - epsilon
                    calculated_price = Decimal(str(round(result, 2)))
                
                # Если метод неизвестен, используем линейную интерполяцию
                else:
                    x1, y1 = float(prev_price.copies), float(prev_price.price_per_sheet)
                    x2, y2 = float(next_price.copies), float(next_price.price_per_sheet)
                    x = float(arbitrary_copies_int)
                    
                    result = y1 + (y2 - y1) * (x - x1) / (x2 - x1)
                    calculated_price = Decimal(str(round(result, 2)))
            
            # Если не нашли два разных значения для интерполяции
            else:
                # Используем ближайшую цену
                calculated_price = prev_price.price_per_sheet if prev_price else min_price.price_per_sheet
        
        # Подготавливаем информацию об опорных точках
        points_info = []
        for point in price_points:
            points_info.append({
                'copies': point.copies,
                'price_per_sheet': float(point.price_per_sheet),
                'price_per_sheet_display': point.get_price_per_sheet_display(),
            })
        
        # Определяем отображаемое название метода интерполяции
        if interpolation_method == 'linear':
            interpolation_method_display = 'Линейная'
        elif interpolation_method == 'logarithmic':
            interpolation_method_display = 'Логарифмическая'
        else:
            interpolation_method_display = 'Линейная'
        
        # Возвращаем успешный ответ с результатом расчета
        return JsonResponse({
            'success': True,
            'printer_id': printer.id,
            'printer_name': printer.name,
            'interpolation_method': interpolation_method,
            'interpolation_method_display': interpolation_method_display,
            'arbitrary_copies': arbitrary_copies_int,
            'calculated_price': float(calculated_price),
            'calculated_price_display': f"{calculated_price:.2f} руб./лист",
            'calculated_price_formatted': f"{calculated_price:.2f}",
            'points_count': len(points_info),
            'price_points': points_info,
            'message': f'Для тиража {arbitrary_copies_int} шт. цена за лист: {calculated_price:.2f} руб. (метод: {interpolation_method_display})'
        })
    
    except Exception as e:
        # Обработка всех ошибок
        return JsonResponse({
            'success': False,
            'error': f'Произошла ошибка при расчете цены: {str(e)}'
        }, status=500)