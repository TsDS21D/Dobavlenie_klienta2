"""
utils.py для приложения spravochnik_dopolnitelnyh_rabot.
Содержит функцию интерполяции цены по количеству листов.
"""

from decimal import Decimal
import math

def calculate_price_for_work(work, sheets):
    """
    Рассчитывает цену работы для заданного количества листов,
    используя опорные точки и метод интерполяции, сохранённый в работе.

    Аргументы:
        work: объект Work
        sheets: int, количество листов

    Возвращает:
        Decimal: интерполированная цена
    """
    # Получаем все опорные точки для данной работы, отсортированные по sheets
    price_points = work.work_prices.order_by('sheets')

    if not price_points.exists():
        # Если нет точек, возвращаем базовую цену работы (или 0)
        return work.price

    sheets_int = int(sheets)

    # Минимальная и максимальная точки
    min_point = price_points.first()
    max_point = price_points.last()

    # Если запрошенное количество меньше минимального, возвращаем цену минимальной точки
    if sheets_int <= min_point.sheets:
        return min_point.price

    # Если больше максимального, возвращаем цену максимальной точки
    if sheets_int >= max_point.sheets:
        return max_point.price

    # Ищем две ближайшие точки для интерполяции
    prev_point = None
    next_point = None
    for point in price_points:
        if point.sheets <= sheets_int:
            prev_point = point
        if point.sheets >= sheets_int:
            next_point = point
            break

    # Если обе точки найдены и они разные
    if prev_point and next_point and prev_point != next_point:
        method = work.interpolation_method  # 'linear' или 'logarithmic'

        # Линейная интерполяция
        if method == 'linear':
            x1, y1 = float(prev_point.sheets), float(prev_point.price)
            x2, y2 = float(next_point.sheets), float(next_point.price)
            x = float(sheets_int)
            result = y1 + (y2 - y1) * (x - x1) / (x2 - x1)
            return Decimal(str(round(result, 2)))

        # Логарифмическая интерполяция
        elif method == 'logarithmic':
            epsilon = 1e-10  # для избежания log(0)
            x1 = math.log(float(prev_point.sheets) + epsilon)
            y1 = math.log(float(prev_point.price) + epsilon)
            x2 = math.log(float(next_point.sheets) + epsilon)
            y2 = math.log(float(next_point.price) + epsilon)
            x = math.log(float(sheets_int) + epsilon)
            result_log = y1 + (y2 - y1) * (x - x1) / (x2 - x1)
            result = math.exp(result_log) - epsilon
            return Decimal(str(round(result, 2)))

        # По умолчанию (если метод не распознан) – линейная
        else:
            x1, y1 = float(prev_point.sheets), float(prev_point.price)
            x2, y2 = float(next_point.sheets), float(next_point.price)
            x = float(sheets_int)
            result = y1 + (y2 - y1) * (x - x1) / (x2 - x1)
            return Decimal(str(round(result, 2)))

    # Если не нашли две разные точки (например, только одна точка)
    return prev_point.price if prev_point else min_point.price