"""
views.py для приложения print_price
Представления для отображения страницы справочника цен на печать (себестоимость + наценка)
"""

from django.shortcuts import render, get_object_or_404, redirect
from django.http import JsonResponse
from django.contrib import messages
from django.views.decorators.http import require_POST, require_http_methods
from django.views.decorators.csrf import csrf_exempt
from django.contrib.auth.decorators import login_required
from django.views.decorators.cache import never_cache
from decimal import Decimal, InvalidOperation
import math

from devices.models import Printer
from .models import PrintPrice
from .forms import PrintPriceForm, PrintPriceUpdateForm
from .utils import get_cost_and_markup_for_printer_and_copies, calculate_price_for_printer_and_copies


@login_required(login_url='/login/')
@never_cache
def index(request):
    """
    Главная страница приложения print_price.
    Отображает список принтеров и для выбранного принтера – таблицу цен.
    """
    # Получаем все принтеры
    printers = Printer.objects.all().order_by('name')

    # Получаем ID выбранного принтера из GET-параметра
    selected_printer_id = request.GET.get('printer_id')
    selected_printer = None
    print_prices = []

    if selected_printer_id:
        try:
            selected_printer = Printer.objects.get(id=selected_printer_id)
            print_prices = PrintPrice.objects.filter(
                printer=selected_printer
            ).order_by('copies')
        except Printer.DoesNotExist:
            messages.error(request, "Выбранный принтер не найден")

    # Форма для добавления новой цены
    form = PrintPriceForm(initial={'printer': selected_printer})

    if request.method == 'POST':
        form = PrintPriceForm(request.POST)
        if form.is_valid():
            print_price = form.save()
            messages.success(
                request,
                f"Цена добавлена: тираж {print_price.copies} шт., себестоимость {print_price.cost:.2f} руб., наценка {print_price.markup_percent}%"
            )
            return redirect(f"/print_price/?printer_id={print_price.printer.id}")

    context = {
        'printers': printers,
        'selected_printer': selected_printer,
        'print_prices': print_prices,
        'form': form,
    }
    return render(request, 'print_price/index.html', context)


@require_POST
def create_print_price(request):
    """
    Создание новой цены через AJAX.
    """
    form = PrintPriceForm(request.POST)
    if form.is_valid():
        print_price = form.save()
        return JsonResponse({
            'success': True,
            'message': 'Цена успешно добавлена',
            'print_price': print_price.to_dict(),
        })
    else:
        return JsonResponse({
            'success': False,
            'errors': form.errors,
        }, status=400)


@require_POST
def delete_print_price(request, price_id):
    """
    Удаление цены.
    """
    print_price = get_object_or_404(PrintPrice, id=price_id)
    printer_id = print_price.printer.id
    print_price.delete()

    if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
        return JsonResponse({'success': True, 'message': 'Цена удалена'})

    messages.success(request, "Цена удалена")
    return redirect(f"/print_price/?printer_id={printer_id}")


@require_POST
@csrf_exempt
def update_print_price(request, price_id):
    """
    Обновление существующей цены через AJAX (inline-редактирование).
    Обрабатывает поля copies, cost, markup_percent.
    """
    print_price = get_object_or_404(PrintPrice, id=price_id)

    field_name = request.POST.get('field_name')
    new_value = request.POST.get('new_value')

    if not field_name or new_value is None:
        return JsonResponse({
            'success': False,
            'error': 'Не указано поле или новое значение'
        }, status=400)

    allowed_fields = ['copies', 'cost', 'markup_percent']
    if field_name not in allowed_fields:
        return JsonResponse({
            'success': False,
            'error': f'Поле "{field_name}" нельзя обновлять'
        }, status=400)

    try:
        # Преобразуем значение в правильный тип
        if field_name == 'copies':
            new_value = int(float(new_value))
            if new_value < 1:
                raise ValueError("Тираж должен быть положительным числом")
            # Проверка уникальности
            if new_value != print_price.copies:
                existing = PrintPrice.objects.filter(
                    printer=print_price.printer,
                    copies=new_value
                ).exclude(pk=print_price.pk)
                if existing.exists():
                    return JsonResponse({
                        'success': False,
                        'error': f'Цена для принтера "{print_price.printer.name}" с тиражом {new_value} шт. уже существует'
                    }, status=400)

        elif field_name == 'cost':
            new_value = Decimal(str(new_value).replace(',', '.'))
            if new_value < 0:
                raise ValueError("Себестоимость не может быть отрицательной")

        elif field_name == 'markup_percent':
            new_value = Decimal(str(new_value).replace(',', '.'))
            if new_value < 0:
                raise ValueError("Наценка не может быть отрицательной")

        setattr(print_price, field_name, new_value)
        # Сохраним – внутри save() пересчитается price_per_sheet
        print_price.save()
        print_price.refresh_from_db()

        return JsonResponse({
            'success': True,
            'message': 'Цена успешно обновлена',
            'print_price': print_price.to_dict(),
            'field_name': field_name,
            'new_value': str(new_value),
        })

    except ValueError as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=400)
    except Exception as e:
        return JsonResponse({'success': False, 'error': f'Ошибка: {str(e)}'}, status=500)


@require_POST
@csrf_exempt
@login_required
def update_printer_interpolation_method(request, printer_id):
    """
    Обновление метода интерполяции для принтера.
    """
    printer = get_object_or_404(Printer, id=printer_id)
    new_method = request.POST.get('interpolation_method')

    if not new_method:
        return JsonResponse({'success': False, 'error': 'Не указан метод интерполяции'}, status=400)

    valid_methods = ['linear', 'logarithmic']
    if new_method not in valid_methods:
        return JsonResponse({'success': False, 'error': 'Недопустимый метод интерполяции'}, status=400)

    old_method = printer.devices_interpolation_method
    printer.devices_interpolation_method = new_method
    printer.save()
    printer.refresh_from_db()

    return JsonResponse({
        'success': True,
        'message': 'Метод интерполяции обновлен',
        'printer_id': printer.id,
        'printer_name': printer.name,
        'old_method': old_method,
        'new_method': new_method,
        'new_method_display': printer.get_interpolation_method_display_short(),
    })


@require_http_methods(["GET", "POST"])
@csrf_exempt
@login_required
def calculate_arbitrary_copies_price(request, printer_id):
    """
    Расчёт цены для произвольного тиража.
    Возвращает себестоимость, наценку и итоговую цену за лист.
    """
    printer = get_object_or_404(Printer, id=printer_id)

    # Получаем произвольный тираж из запроса
    if request.method == 'POST':
        arbitrary_copies = request.POST.get('arbitrary_copies')
    else:
        arbitrary_copies = request.GET.get('arbitrary_copies')

    if not arbitrary_copies:
        return JsonResponse({'success': False, 'error': 'Не указан тираж'}, status=400)

    try:
        copies_int = int(float(arbitrary_copies))
        if copies_int < 1:
            return JsonResponse({'success': False, 'error': 'Тираж должен быть положительным'}, status=400)
    except (ValueError, TypeError):
        return JsonResponse({'success': False, 'error': 'Тираж должен быть числом'}, status=400)

    # Проверяем наличие опорных точек
    if not PrintPrice.objects.filter(printer=printer).exists():
        return JsonResponse({
            'success': False,
            'error': f'Для принтера "{printer.name}" нет сохранённых цен.'
        })

    # Получаем интерполированные себестоимость и наценку
    from .utils import get_cost_and_markup_for_printer_and_copies
    cost, markup = get_cost_and_markup_for_printer_and_copies(printer, copies_int)
    price = cost + (cost * markup / Decimal('100'))

    method_display = 'Линейная' if printer.devices_interpolation_method == 'linear' else 'Логарифмическая'

    return JsonResponse({
        'success': True,
        'printer_id': printer.id,
        'printer_name': printer.name,
        'interpolation_method': printer.devices_interpolation_method,
        'interpolation_method_display': method_display,
        'arbitrary_copies': copies_int,
        'cost': float(cost),
        'cost_display': f"{cost:.2f} руб.",
        'markup_percent': float(markup),
        'markup_percent_display': f"{markup}%",
        'calculated_price': float(price),
        'calculated_price_display': f"{price:.2f} руб./лист",
        'message': f'Для тиража {copies_int} шт.: себестоимость {cost:.2f} руб., наценка {markup}%, цена {price:.2f} руб./лист',
    })