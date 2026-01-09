"""
utils.py для приложения print_price
Утилиты для расчета цены на печать
"""

from decimal import Decimal
import math
from .models import PrintPrice
from devices.models import Printer


def calculate_price_for_printer_and_copies(printer, copies):
    """
    Расчет цены за лист для заданного принтера и тиража.
    
    Args:
        printer: Объект Printer или ID принтера
        copies: int, количество копий (тираж)
    
    Returns:
        Decimal: рассчитанная цена за лист
    """
    # Если передан ID, получаем объект принтера
    if isinstance(printer, int):
        try:
            printer = Printer.objects.get(id=printer)
        except Printer.DoesNotExist:
            return Decimal('0.00')
    
    # Получаем все сохраненные цены для этого принтера, отсортированные по тиражу
    price_points = PrintPrice.objects.filter(printer=printer).order_by('copies')
    
    if not price_points.exists():
        # Если нет сохраненных цен, возвращаем 0
        return Decimal('0.00')
    
    # Преобразуем copies в int
    copies_int = int(copies)
    
    # Получаем метод интерполяции (по умолчанию линейный)
    interpolation_method = getattr(printer, 'devices_interpolation_method', 'linear')
    
    # Получаем минимальную и максимальную цены
    min_price = price_points.first()
    max_price = price_points.last()
    
    # Если запрошенный тираж меньше минимального, возвращаем минимальную цену
    if copies_int <= min_price.copies:
        return min_price.price_per_sheet
    
    # Если запрошенный тираж больше максимального, возвращаем максимальную цену
    if copies_int >= max_price.copies:
        return max_price.price_per_sheet
    
    # Ищем два ближайших тиража для интерполяции
    prev_price = None
    next_price = None
    
    for price in price_points:
        if price.copies <= copies_int:
            prev_price = price
        if price.copies >= copies_int:
            next_price = price
            break
    
    # Если нашли оба значения для интерполяции и они разные
    if prev_price and next_price and prev_price != next_price:
        
        # Линейная интерполяция
        if interpolation_method == 'linear':
            x1, y1 = float(prev_price.copies), float(prev_price.price_per_sheet)
            x2, y2 = float(next_price.copies), float(next_price.price_per_sheet)
            x = float(copies_int)
            
            result = y1 + (y2 - y1) * (x - x1) / (x2 - x1)
            calculated_price = Decimal(str(round(result, 2)))
        
        # Логарифмическая интерполяция
        elif interpolation_method == 'logarithmic':
            epsilon = 1e-10
            
            x1 = math.log(float(prev_price.copies) + epsilon)
            y1 = math.log(float(prev_price.price_per_sheet) + epsilon)
            x2 = math.log(float(next_price.copies) + epsilon)
            y2 = math.log(float(next_price.price_per_sheet) + epsilon)
            x = math.log(float(copies_int) + epsilon)
            
            result_log = y1 + (y2 - y1) * (x - x1) / (x2 - x1)
            result = math.exp(result_log) - epsilon
            calculated_price = Decimal(str(round(result, 2)))
        
        else:
            # По умолчанию линейная
            x1, y1 = float(prev_price.copies), float(prev_price.price_per_sheet)
            x2, y2 = float(next_price.copies), float(next_price.price_per_sheet)
            x = float(copies_int)
            
            result = y1 + (y2 - y1) * (x - x1) / (x2 - x1)
            calculated_price = Decimal(str(round(result, 2)))
    
    else:
        # Если не нашли два разных значения для интерполяции
        calculated_price = prev_price.price_per_sheet if prev_price else min_price.price_per_sheet
    
    return calculated_price


def get_price_info_for_printer_and_copies(printer, copies):
    """
    Получение информации о расчете цены для заданного принтера и тиража.
    
    Args:
        printer: Объект Printer или ID принтера
        copies: int, количество копий (тираж)
    
    Returns:
        dict: информация о расчете
    """
    price = calculate_price_for_printer_and_copies(printer, copies)
    
    if isinstance(printer, int):
        try:
            printer_obj = Printer.objects.get(id=printer)
        except Printer.DoesNotExist:
            printer_obj = None
    else:
        printer_obj = printer
    
    return {
        'price': price,
        'printer_id': printer_obj.id if printer_obj else None,
        'printer_name': printer_obj.name if printer_obj else None,
        'copies': copies,
        'interpolation_method': getattr(printer_obj, 'devices_interpolation_method', 'linear') if printer_obj else 'linear',
    }