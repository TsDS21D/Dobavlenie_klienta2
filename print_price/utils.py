"""
utils.py для приложения print_price
Утилиты для интерполяции себестоимости и наценки для принтеров и ламинаторов.

ДОБАВЛЕНО: параметр print_type для функций принтеров.
"""

from decimal import Decimal
import math
from .models import PrintPrice, LaminatorPrice
from devices.models import Printer, Laminator


# ==================== ПРИНТЕРЫ ====================

def get_cost_and_markup_for_printer_and_copies(printer, copies, print_type='color'):
    """
    Возвращает интерполированные себестоимость и наценку для принтера.

    Аргументы:
        printer: объект Printer или ID принтера
        copies: int, количество копий (тираж)
        print_type: str, тип печати ('color' или 'bw'), по умолчанию 'color'

    Возвращает:
        tuple: (cost, markup_percent) – интерполированные значения (Decimal)
    """
    # Если передан ID, получаем объект принтера
    if isinstance(printer, int):
        try:
            printer = Printer.objects.get(id=printer)
        except Printer.DoesNotExist:
            return Decimal('0.00'), Decimal('0.00')

    # Получаем все сохранённые опорные точки для этого принтера и указанного типа печати
    price_points = PrintPrice.objects.filter(
        printer=printer,
        print_type=print_type
    ).order_by('copies')
    if not price_points.exists():
        return Decimal('0.00'), Decimal('0.00')

    copies_int = int(copies)
    interpolation_method = getattr(printer, 'devices_interpolation_method', 'linear')

    min_point = price_points.first()
    max_point = price_points.last()

    if copies_int <= min_point.copies:
        return min_point.cost, min_point.markup_percent

    if copies_int >= max_point.copies:
        return max_point.cost, max_point.markup_percent

    prev_point = None
    next_point = None
    for point in price_points:
        if point.copies <= copies_int:
            prev_point = point
        if point.copies >= copies_int:
            next_point = point
            break

    if prev_point and next_point and prev_point != next_point:
        if interpolation_method == 'linear':
            # Линейная интерполяция для себестоимости
            x1, y1 = float(prev_point.copies), float(prev_point.cost)
            x2, y2 = float(next_point.copies), float(next_point.cost)
            x = float(copies_int)
            cost = y1 + (y2 - y1) * (x - x1) / (x2 - x1)

            # Линейная интерполяция для наценки
            y1_m = float(prev_point.markup_percent)
            y2_m = float(next_point.markup_percent)
            markup = y1_m + (y2_m - y1_m) * (x - x1) / (x2 - x1)

        else:  # logarithmic
            epsilon = 1e-10
            # Логарифмическая интерполяция для себестоимости
            x1 = math.log(float(prev_point.copies) + epsilon)
            y1 = math.log(float(prev_point.cost) + epsilon)
            x2 = math.log(float(next_point.copies) + epsilon)
            y2 = math.log(float(next_point.cost) + epsilon)
            x = math.log(float(copies_int) + epsilon)
            cost_log = y1 + (y2 - y1) * (x - x1) / (x2 - x1)
            cost = math.exp(cost_log) - epsilon

            # Логарифмическая интерполяция для наценки
            y1_m = math.log(float(prev_point.markup_percent) + epsilon)
            y2_m = math.log(float(next_point.markup_percent) + epsilon)
            markup_log = y1_m + (y2_m - y1_m) * (x - x1) / (x2 - x1)
            markup = math.exp(markup_log) - epsilon

        cost = Decimal(str(round(cost, 2)))
        markup = Decimal(str(round(markup, 2)))
        return cost, markup

    return prev_point.cost, prev_point.markup_percent


# ==================== ЛАМИНАТОРЫ (без изменений) ====================

def get_cost_and_markup_for_laminator_and_copies(laminator, copies):
    """Возвращает интерполированные себестоимость и наценку для ламинатора."""
    if isinstance(laminator, int):
        try:
            laminator = Laminator.objects.get(id=laminator)
        except Laminator.DoesNotExist:
            return Decimal('0.00'), Decimal('0.00')

    price_points = LaminatorPrice.objects.filter(laminator=laminator).order_by('copies')
    if not price_points.exists():
        return Decimal('0.00'), Decimal('0.00')

    copies_int = int(copies)
    interpolation_method = getattr(laminator, 'laminator_interpolation_method', 'linear')

    min_point = price_points.first()
    max_point = price_points.last()

    if copies_int <= min_point.copies:
        return min_point.cost, min_point.markup_percent
    if copies_int >= max_point.copies:
        return max_point.cost, max_point.markup_percent

    prev_point = None
    next_point = None
    for point in price_points:
        if point.copies <= copies_int:
            prev_point = point
        if point.copies >= copies_int:
            next_point = point
            break

    if prev_point and next_point and prev_point != next_point:
        if interpolation_method == 'linear':
            x1, y1 = float(prev_point.copies), float(prev_point.cost)
            x2, y2 = float(next_point.copies), float(next_point.cost)
            x = float(copies_int)
            cost = y1 + (y2 - y1) * (x - x1) / (x2 - x1)

            y1_m = float(prev_point.markup_percent)
            y2_m = float(next_point.markup_percent)
            markup = y1_m + (y2_m - y1_m) * (x - x1) / (x2 - x1)

        else:  # logarithmic
            epsilon = 1e-10
            x1 = math.log(float(prev_point.copies) + epsilon)
            y1 = math.log(float(prev_point.cost) + epsilon)
            x2 = math.log(float(next_point.copies) + epsilon)
            y2 = math.log(float(next_point.cost) + epsilon)
            x = math.log(float(copies_int) + epsilon)
            cost_log = y1 + (y2 - y1) * (x - x1) / (x2 - x1)
            cost = math.exp(cost_log) - epsilon

            y1_m = math.log(float(prev_point.markup_percent) + epsilon)
            y2_m = math.log(float(next_point.markup_percent) + epsilon)
            markup_log = y1_m + (y2_m - y1_m) * (x - x1) / (x2 - x1)
            markup = math.exp(markup_log) - epsilon

        cost = Decimal(str(round(cost, 2)))
        markup = Decimal(str(round(markup, 2)))
        return cost, markup

    return prev_point.cost, prev_point.markup_percent


# ==================== ФУНКЦИИ ДЛЯ РАСЧЁТА ЦЕНЫ (ИСПОЛЬЗУЮТСЯ В СИГНАЛАХ) ====================

def calculate_price_for_printer_and_copies(printer, copies, print_type='color'):
    """
    Рассчитывает цену за лист для заданного принтера, тиража и типа печати.
    Сначала интерполирует себестоимость и наценку, затем вычисляет цену.

    Аргументы:
        printer: объект Printer или ID принтера
        copies: int, количество копий
        print_type: str, тип печати ('color' или 'bw'), по умолчанию 'color'

    Возвращает:
        Decimal: цена за лист, округлённая до 2 знаков
    """
    cost, markup = get_cost_and_markup_for_printer_and_copies(printer, copies, print_type)
    price = cost + (cost * markup / Decimal('100'))
    return price.quantize(Decimal('0.01'))


def get_price_info_for_printer_and_copies(printer, copies, print_type='color'):
    """
    Возвращает полную информацию о расчёте: себестоимость, наценка, цена.

    Аргументы:
        printer: объект Printer или ID принтера
        copies: int, количество копий
        print_type: str, тип печати ('color' или 'bw'), по умолчанию 'color'

    Возвращает:
        dict: словарь с ключами:
            - cost (Decimal)
            - cost_display (str)
            - markup_percent (Decimal)
            - markup_percent_display (str)
            - price (Decimal)
            - price_display (str)
            - printer_id (int or None)
            - printer_name (str or None)
            - copies (int)
            - interpolation_method (str)
            - print_type (str)
            - print_type_display (str)
    """
    cost, markup = get_cost_and_markup_for_printer_and_copies(printer, copies, print_type)
    price = cost + (cost * markup / Decimal('100'))

    if isinstance(printer, int):
        try:
            printer_obj = Printer.objects.get(id=printer)
        except Printer.DoesNotExist:
            printer_obj = None
    else:
        printer_obj = printer

    return {
        'cost': cost,
        'cost_display': f"{cost:.2f} руб.",
        'markup_percent': markup,
        'markup_percent_display': f"{markup}%",
        'price': price,
        'price_display': f"{price:.2f} руб./лист",
        'printer_id': printer_obj.id if printer_obj else None,
        'printer_name': printer_obj.name if printer_obj else None,
        'copies': copies,
        'interpolation_method': getattr(printer_obj, 'devices_interpolation_method', 'linear') if printer_obj else 'linear',
        'print_type': print_type,
        'print_type_display': dict(PrintPrice.PRINT_TYPE_CHOICES).get(print_type, print_type),
    }