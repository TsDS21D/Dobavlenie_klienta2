"""
views.py для приложения print_price
Представления для отображения страницы справочника цен на печать (цена за 1 лист)
"""

from django.shortcuts import render, get_object_or_404, redirect
from django.http import JsonResponse
from django.contrib import messages
from django.views.decorators.http import require_POST
from django.views.decorators.csrf import csrf_exempt
import json
from decimal import Decimal
from devices.models import Printer
from .models import PrintPrice
from .forms import PrintPriceForm, PrintPriceUpdateForm


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
    print(f"DEBUG: Получен запрос на обновление цены {price_id}")  # Отладочное сообщение
    
    # Получаем цену по ID или возвращаем 404
    print_price = get_object_or_404(PrintPrice, id=price_id)
    print(f"DEBUG: Найден объект PrintPrice: {print_price}")  # Отладочное сообщение
    
    # Определяем, какое поле обновляется, по данным запроса
    field_name = request.POST.get('field_name')
    new_value = request.POST.get('new_value')
    
    print(f"DEBUG: Поле: {field_name}, Новое значение: {new_value}")  # Отладочное сообщение
    print(f"DEBUG: Все POST данные: {dict(request.POST)}")  # Отладочное сообщение
    
    # Проверяем, что оба параметра присутствуют
    if not field_name or new_value is None:
        print(f"DEBUG: Ошибка - отсутствуют параметры")  # Отладочное сообщение
        return JsonResponse({
            'success': False,
            'error': 'Не указано поле для обновления или новое значение'
        }, status=400)
    
    # Проверяем, что поле можно обновлять
    if field_name not in ['copies', 'price_per_sheet']:
        print(f"DEBUG: Ошибка - поле {field_name} нельзя обновлять")  # Отладочное сообщение
        return JsonResponse({
            'success': False,
            'error': f'Поле "{field_name}" нельзя обновлять'
        }, status=400)
    
    try:
        # Преобразуем значение в правильный тип данных
        if field_name == 'copies':
            print(f"DEBUG: Преобразуем копии")  # Отладочное сообщение
            new_value = int(float(new_value))  # Сначала float, потом int для безопасности
            if new_value < 1:
                raise ValueError("Тираж должен быть положительным числом")
            print(f"DEBUG: Преобразовано в int: {new_value}")  # Отладочное сообщение
                
        elif field_name == 'price_per_sheet':
            print(f"DEBUG: Преобразуем цену")  # Отладочное сообщение
            # Заменяем запятую на точку для корректного преобразования
            new_value_str = str(new_value).replace(',', '.')
            new_value = Decimal(new_value_str)  # Используем Decimal для денежных значений
            if new_value < Decimal('0.01'):
                raise ValueError("Цена не может быть меньше 0.01")
            print(f"DEBUG: Преобразовано в Decimal: {new_value}")  # Отладочное сообщение
        
        # Проверяем уникальность тиража (если обновляется поле copies)
        if field_name == 'copies' and new_value != print_price.copies:
            print(f"DEBUG: Проверяем уникальность тиража")  # Отладочное сообщение
            # Проверяем, нет ли уже записи с таким же тиражем для этого принтера
            existing = PrintPrice.objects.filter(
                printer=print_price.printer,
                copies=new_value
            ).exclude(pk=print_price.pk)  # Исключаем текущую запись
            
            if existing.exists():
                print(f"DEBUG: Найден дубликат тиража")  # Отладочное сообщение
                return JsonResponse({
                    'success': False,
                    'error': f'Цена для принтера "{print_price.printer.name}" с тиражем {new_value} шт. уже существует'
                }, status=400)
        
        # Сохраняем старое значение для отладки
        old_value = getattr(print_price, field_name)
        print(f"DEBUG: Старое значение: {old_value}, Новое значение: {new_value}")  # Отладочное сообщение
        
        # Обновляем поле
        setattr(print_price, field_name, new_value)
        
        # Сохраняем изменения в базе данных
        print_price.save()
        print(f"DEBUG: Объект сохранен в БД")  # Отладочное сообщение
        
        # Обновляем объект из базы, чтобы получить актуальные данные
        print_price.refresh_from_db()
        
        # Возвращаем успешный ответ с обновленными данными
        response_data = {
            'success': True,
            'message': 'Цена успешно обновлена',
            'print_price': print_price.to_dict(),
            'field_name': field_name,
            'new_value': str(new_value),
        }
        print(f"DEBUG: Возвращаем ответ: {response_data}")  # Отладочное сообщение
        
        return JsonResponse(response_data)
    
    except ValueError as e:
        # Обработка ошибок преобразования типов или валидации
        print(f"DEBUG: ValueError: {str(e)}")  # Отладочное сообщение
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=400)
    except Exception as e:
        # Обработка всех остальных ошибок
        print(f"DEBUG: Exception: {str(e)}")  # Отладочное сообщение
        import traceback
        print(f"DEBUG: Traceback: {traceback.format_exc()}")  # Отладочное сообщение
        return JsonResponse({
            'success': False,
            'error': f'Произошла ошибка при обновлении: {str(e)}',
            'traceback': traceback.format_exc()  # Только для отладки!
        }, status=500)