"""
utils.py для приложения print_price
Утилиты для интерполяции себестоимости и наценки, расчёта цены.
"""

from decimal import Decimal
import math
from .models import PrintPrice
from devices.models import Printer


def get_cost_and_markup_for_printer_and_copies(printer, copies):
    """
    Возвращает интерполированные себестоимость и наценку для заданного принтера и тиража.

    Args:
        printer: объект Printer или ID принтера
        copies: int, количество копий (тираж)

    Returns:
        tuple: (cost, markup_percent) – интерполированные значения (Decimal)
    """
    # Если передан ID, получаем объект принтера
    if isinstance(printer, int):
        try:
            printer = Printer.objects.get(id=printer)
        except Printer.DoesNotExist:
            return Decimal('0.00'), Decimal('0.00')

    # Получаем все сохранённые опорные точки для этого принтера, отсортированные по тиражу
    price_points = PrintPrice.objects.filter(printer=printer).order_by('copies')

    if not price_points.exists():
        # Если нет сохранённых точек, возвращаем нули
        return Decimal('0.00'), Decimal('0.00')

    copies_int = int(copies)
    # Получаем метод интерполяции принтера (по умолчанию линейный)
    interpolation_method = getattr(printer, 'devices_interpolation_method', 'linear')

    # Минимальная и максимальная точки
    min_point = price_points.first()
    max_point = price_points.last()

    # Если тираж меньше минимального, возвращаем значения из минимальной точки
    if copies_int <= min_point.copies:
        return min_point.cost, min_point.markup_percent

    # Если тираж больше максимального, возвращаем значения из максимальной точки
    if copies_int >= max_point.copies:
        return max_point.cost, max_point.markup_percent

    # Ищем две ближайшие точки для интерполяции
    prev_point = None
    next_point = None
    for point in price_points:
        if point.copies <= copies_int:
            prev_point = point
        if point.copies >= copies_int:
            next_point = point
            break

    # Если обе точки найдены и они разные
    if prev_point and next_point and prev_point != next_point:
        # Линейная интерполяция для себестоимости
        if interpolation_method == 'linear':
            # Себестоимость
            x1, y1 = float(prev_point.copies), float(prev_point.cost)
            x2, y2 = float(next_point.copies), float(next_point.cost)
            x = float(copies_int)
            cost = y1 + (y2 - y1) * (x - x1) / (x2 - x1)

            # Наценка
            y1_m = float(prev_point.markup_percent)
            y2_m = float(next_point.markup_percent)
            markup = y1_m + (y2_m - y1_m) * (x - x1) / (x2 - x1)

        # Логарифмическая интерполяция
        elif interpolation_method == 'logarithmic':
            epsilon = 1e-10
            # Себестоимость
            x1 = math.log(float(prev_point.copies) + epsilon)
            y1 = math.log(float(prev_point.cost) + epsilon)
            x2 = math.log(float(next_point.copies) + epsilon)
            y2 = math.log(float(next_point.cost) + epsilon)
            x = math.log(float(copies_int) + epsilon)
            cost_log = y1 + (y2 - y1) * (x - x1) / (x2 - x1)
            cost = math.exp(cost_log) - epsilon

            # Наценка
            y1_m = math.log(float(prev_point.markup_percent) + epsilon)
            y2_m = math.log(float(next_point.markup_percent) + epsilon)
            markup_log = y1_m + (y2_m - y1_m) * (x - x1) / (x2 - x1)
            markup = math.exp(markup_log) - epsilon

        else:
            # По умолчанию линейная
            x1, y1 = float(prev_point.copies), float(prev_point.cost)
            x2, y2 = float(next_point.copies), float(next_point.cost)
            x = float(copies_int)
            cost = y1 + (y2 - y1) * (x - x1) / (x2 - x1)

            y1_m = float(prev_point.markup_percent)
            y2_m = float(next_point.markup_percent)
            markup = y1_m + (y2_m - y1_m) * (x - x1) / (x2 - x1)

        # Округляем до двух знаков
        cost = Decimal(str(round(cost, 2)))
        markup = Decimal(str(round(markup, 2)))
        return cost, markup

    # Если не нашли две разные точки (например, только одна точка)
    return prev_point.cost, prev_point.markup_percent


def calculate_price_for_printer_and_copies(printer, copies):
    """
    Рассчитывает цену за лист для заданного принтера и тиража.
    Сначала интерполирует себестоимость и наценку, затем вычисляет цену.

    Args:
        printer: объект Printer или ID принтера
        copies: int, количество копий

    Returns:
        Decimal: цена за лист
    """
    cost, markup = get_cost_and_markup_for_printer_and_copies(printer, copies)
    # Цена = себестоимость + себестоимость * наценка / 100
    price = cost + (cost * markup / Decimal('100'))
    return price.quantize(Decimal('0.01'))


def get_price_info_for_printer_and_copies(printer, copies):
    """
    Возвращает полную информацию о расчёте: себестоимость, наценка, цена.
    """
    cost, markup = get_cost_and_markup_for_printer_and_copies(printer, copies)
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
    }