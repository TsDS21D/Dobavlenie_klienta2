"""
views.py для приложения print_price
Представления для работы с ценами на печать (принтеры) и ламинирование (ламинаторы).
"""

from django.shortcuts import render, get_object_or_404, redirect
from django.http import JsonResponse
from django.contrib import messages
from django.views.decorators.http import require_POST, require_http_methods
from django.views.decorators.csrf import csrf_exempt
from django.contrib.auth.decorators import login_required
from django.views.decorators.cache import never_cache
from decimal import Decimal

from devices.models import Printer, Laminator
from .models import PrintPrice, LaminatorPrice
from .forms import PrintPriceForm, PrintPriceUpdateForm, LaminatorPriceForm, LaminatorPriceUpdateForm
from .utils import (
    get_cost_and_markup_for_printer_and_copies,
    get_cost_and_markup_for_laminator_and_copies,
)


# ==================== ПРИНТЕРЫ (существующий код, слегка изменён) ====================

@login_required(login_url='/login/')
@never_cache
def index(request):
    """Главная страница для принтеров."""
    printers = Printer.objects.all().order_by('name')
    selected_printer_id = request.GET.get('printer_id')
    selected_printer = None
    print_prices = []

    if selected_printer_id:
        try:
            selected_printer = Printer.objects.get(id=selected_printer_id)
            print_prices = PrintPrice.objects.filter(printer=selected_printer).order_by('copies')
        except Printer.DoesNotExist:
            messages.error(request, "Выбранный принтер не найден")

    form = PrintPriceForm(initial={'printer': selected_printer})

    if request.method == 'POST':
        form = PrintPriceForm(request.POST)
        if form.is_valid():
            price = form.save()
            messages.success(request, f"Цена добавлена: тираж {price.copies} шт.")
            return redirect(f"/print_price/?printer_id={price.printer.id}")

    context = {
        'printers': printers,
        'selected_printer': selected_printer,
        'print_prices': print_prices,
        'form': form,
        'device_type': 'printer',
    }
    return render(request, 'print_price/index.html', context)


@require_POST
def create_print_price(request):
    """AJAX-создание цены для принтера."""
    form = PrintPriceForm(request.POST)
    if form.is_valid():
        price = form.save()
        return JsonResponse({'success': True, 'print_price': price.to_dict()})
    return JsonResponse({'success': False, 'errors': form.errors}, status=400)


@require_POST
def delete_print_price(request, price_id):
    """Удаление цены принтера."""
    price = get_object_or_404(PrintPrice, id=price_id)
    printer_id = price.printer.id
    price.delete()
    if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
        return JsonResponse({'success': True})
    messages.success(request, "Цена удалена")
    return redirect(f"/print_price/?printer_id={printer_id}")


@require_POST
@csrf_exempt
def update_print_price(request, price_id):
    """AJAX-обновление цены принтера (inline-редактирование)."""
    price = get_object_or_404(PrintPrice, id=price_id)
    field_name = request.POST.get('field_name')
    new_value = request.POST.get('new_value')

    if not field_name or new_value is None:
        return JsonResponse({'success': False, 'error': 'Не указано поле'}, status=400)

    allowed_fields = ['copies', 'cost', 'markup_percent']
    if field_name not in allowed_fields:
        return JsonResponse({'success': False, 'error': 'Недопустимое поле'}, status=400)

    try:
        if field_name == 'copies':
            new_value = int(float(new_value))
            if new_value < 1:
                raise ValueError("Тираж должен быть положительным")
            if new_value != price.copies:
                if PrintPrice.objects.filter(printer=price.printer, copies=new_value).exclude(pk=price.pk).exists():
                    return JsonResponse({'success': False, 'error': 'Дубликат тиража'}, status=400)
        elif field_name == 'cost':
            new_value = Decimal(str(new_value).replace(',', '.'))
            if new_value < 0:
                raise ValueError("Себестоимость не может быть отрицательной")
        elif field_name == 'markup_percent':
            new_value = Decimal(str(new_value).replace(',', '.'))
            if new_value < 0:
                raise ValueError("Наценка не может быть отрицательной")

        setattr(price, field_name, new_value)
        price.save()
        return JsonResponse({'success': True, 'print_price': price.to_dict()})
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=400)


@require_POST
@csrf_exempt
@login_required
def update_printer_interpolation_method(request, printer_id):
    """Обновление метода интерполяции для принтера."""
    printer = get_object_or_404(Printer, id=printer_id)
    new_method = request.POST.get('interpolation_method')
    if new_method not in ['linear', 'logarithmic']:
        return JsonResponse({'success': False, 'error': 'Недопустимый метод'}, status=400)
    printer.devices_interpolation_method = new_method
    printer.save()
    return JsonResponse({
        'success': True,
        'new_method_display': printer.get_interpolation_method_display_short(),
    })


@require_http_methods(["GET", "POST"])
@csrf_exempt
@login_required
def calculate_arbitrary_copies_price(request, printer_id):
    """Расчёт цены для произвольного тиража (принтер)."""
    printer = get_object_or_404(Printer, id=printer_id)
    if request.method == 'POST':
        arbitrary_copies = request.POST.get('arbitrary_copies')
    else:
        arbitrary_copies = request.GET.get('arbitrary_copies')

    if not arbitrary_copies:
        return JsonResponse({'success': False, 'error': 'Не указан тираж'}, status=400)

    try:
        copies_int = int(float(arbitrary_copies))
        if copies_int < 1:
            raise ValueError
    except:
        return JsonResponse({'success': False, 'error': 'Тираж должен быть положительным числом'}, status=400)

    if not PrintPrice.objects.filter(printer=printer).exists():
        return JsonResponse({'success': False, 'error': 'Нет сохранённых цен для этого принтера'})

    cost, markup = get_cost_and_markup_for_printer_and_copies(printer, copies_int)
    price = cost + (cost * markup / Decimal('100'))
    method_display = 'Линейная' if printer.devices_interpolation_method == 'linear' else 'Логарифмическая'

    return JsonResponse({
        'success': True,
        'interpolation_method_display': method_display,
        'arbitrary_copies': copies_int,
        'cost_display': f"{cost:.2f} руб.",
        'markup_percent_display': f"{markup}%",
        'calculated_price_display': f"{price:.2f} руб./лист",
    })


# ==================== НОВЫЕ ПРЕДСТАВЛЕНИЯ ДЛЯ ЛАМИНАТОРОВ ====================

@login_required(login_url='/login/')
@never_cache
def laminator_index(request):
    """Главная страница для ламинаторов."""
    laminators = Laminator.objects.all().order_by('name')
    selected_laminator_id = request.GET.get('laminator_id')
    selected_laminator = None
    laminator_prices = []

    if selected_laminator_id:
        try:
            selected_laminator = Laminator.objects.get(id=selected_laminator_id)
            laminator_prices = LaminatorPrice.objects.filter(laminator=selected_laminator).order_by('copies')
        except Laminator.DoesNotExist:
            messages.error(request, "Выбранный ламинатор не найден")

    form = LaminatorPriceForm(initial={'laminator': selected_laminator})

    if request.method == 'POST':
        form = LaminatorPriceForm(request.POST)
        if form.is_valid():
            price = form.save()
            messages.success(request, f"Цена добавлена: тираж {price.copies} шт.")
            return redirect(f"/print_price/laminators/?laminator_id={price.laminator.id}")

    context = {
        'laminators': laminators,
        'selected_laminator': selected_laminator,
        'laminator_prices': laminator_prices,
        'form': form,
        'device_type': 'laminator',
    }
    return render(request, 'print_price/laminators.html', context)


@require_POST
def create_laminator_price(request):
    """AJAX-создание цены для ламинатора."""
    form = LaminatorPriceForm(request.POST)
    if form.is_valid():
        price = form.save()
        return JsonResponse({'success': True, 'laminator_price': price.to_dict()})
    return JsonResponse({'success': False, 'errors': form.errors}, status=400)


@require_POST
def delete_laminator_price(request, price_id):
    """Удаление цены ламинатора."""
    price = get_object_or_404(LaminatorPrice, id=price_id)
    laminator_id = price.laminator.id
    price.delete()
    if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
        return JsonResponse({'success': True})
    messages.success(request, "Цена удалена")
    return redirect(f"/print_price/laminators/?laminator_id={laminator_id}")


@require_POST
@csrf_exempt
def update_laminator_price(request, price_id):
    """AJAX-обновление цены ламинатора (inline-редактирование)."""
    price = get_object_or_404(LaminatorPrice, id=price_id)
    field_name = request.POST.get('field_name')
    new_value = request.POST.get('new_value')

    if not field_name or new_value is None:
        return JsonResponse({'success': False, 'error': 'Не указано поле'}, status=400)

    allowed_fields = ['copies', 'cost', 'markup_percent']
    if field_name not in allowed_fields:
        return JsonResponse({'success': False, 'error': 'Недопустимое поле'}, status=400)

    try:
        if field_name == 'copies':
            new_value = int(float(new_value))
            if new_value < 1:
                raise ValueError("Тираж должен быть положительным")
            if new_value != price.copies:
                if LaminatorPrice.objects.filter(laminator=price.laminator, copies=new_value).exclude(pk=price.pk).exists():
                    return JsonResponse({'success': False, 'error': 'Дубликат тиража'}, status=400)
        elif field_name == 'cost':
            new_value = Decimal(str(new_value).replace(',', '.'))
            if new_value < 0:
                raise ValueError("Себестоимость не может быть отрицательной")
        elif field_name == 'markup_percent':
            new_value = Decimal(str(new_value).replace(',', '.'))
            if new_value < 0:
                raise ValueError("Наценка не может быть отрицательной")

        setattr(price, field_name, new_value)
        price.save()
        return JsonResponse({'success': True, 'laminator_price': price.to_dict()})
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=400)


@require_POST
@csrf_exempt
@login_required
def update_laminator_interpolation_method(request, laminator_id):
    """Обновление метода интерполяции для ламинатора."""
    laminator = get_object_or_404(Laminator, id=laminator_id)
    new_method = request.POST.get('interpolation_method')
    if new_method not in ['linear', 'logarithmic']:
        return JsonResponse({'success': False, 'error': 'Недопустимый метод'}, status=400)
    laminator.laminator_interpolation_method = new_method
    laminator.save()
    return JsonResponse({
        'success': True,
        'new_method_display': laminator.get_interpolation_method_display_short(),
    })


@require_http_methods(["GET", "POST"])
@csrf_exempt
@login_required
def calculate_arbitrary_laminator_price(request, laminator_id):
    """Расчёт цены для произвольного тиража (ламинатор)."""
    laminator = get_object_or_404(Laminator, id=laminator_id)
    if request.method == 'POST':
        arbitrary_copies = request.POST.get('arbitrary_copies')
    else:
        arbitrary_copies = request.GET.get('arbitrary_copies')

    if not arbitrary_copies:
        return JsonResponse({'success': False, 'error': 'Не указан тираж'}, status=400)

    try:
        copies_int = int(float(arbitrary_copies))
        if copies_int < 1:
            raise ValueError
    except:
        return JsonResponse({'success': False, 'error': 'Тираж должен быть положительным числом'}, status=400)

    if not LaminatorPrice.objects.filter(laminator=laminator).exists():
        return JsonResponse({'success': False, 'error': 'Нет сохранённых цен для этого ламинатора'})

    cost, markup = get_cost_and_markup_for_laminator_and_copies(laminator, copies_int)
    price = cost + (cost * markup / Decimal('100'))
    method_display = 'Линейная' if laminator.laminator_interpolation_method == 'linear' else 'Логарифмическая'

    return JsonResponse({
        'success': True,
        'interpolation_method_display': method_display,
        'arbitrary_copies': copies_int,
        'cost_display': f"{cost:.2f} руб.",
        'markup_percent_display': f"{markup}%",
        'calculated_price_display': f"{price:.2f} руб./лист",
    })

@login_required
def get_laminators_list(request):
    """
    Возвращает список всех ламинаторов для выпадающего списка в секции "Ламинация".
    URL: /print_price/api/get_laminators/
    """
    from devices.models import Laminator
    laminators = Laminator.objects.all().order_by('name')
    data = [{'id': l.id, 'name': l.name} for l in laminators]
    return JsonResponse({'success': True, 'laminators': data})