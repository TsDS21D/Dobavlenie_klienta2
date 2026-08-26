"""
utils.py для приложения spravochnik_dopolnitelnyh_rabot.
Содержит функции интерполяции цены по количеству листов и по тиражу.
"""

from decimal import Decimal
import math


def calculate_price_for_work(work, sheets):
    """
    Рассчитывает себестоимость работы для заданного количества листов,
    используя опорные точки WorkPrice и метод интерполяции, сохранённый в работе.

    Аргументы:
        work: объект Work
        sheets: int, количество листов

    Возвращает:
        Decimal: интерполированная себестоимость (без наценки)
    """
    # Получаем все опорные точки для данной работы, отсортированные по sheets
    price_points = work.work_prices.order_by('sheets')

    if not price_points.exists():
        # Если нет точек, возвращаем базовую цену работы
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


# НОВАЯ ФУНКЦИЯ: интерполяция цены по тиражу
def calculate_price_for_work_by_circulation(work, circulation):
    """
    Рассчитывает себестоимость работы для заданного тиража,
    используя опорные точки WorkCirculationPrice и метод интерполяции, сохранённый в работе.

    Аргументы:
        work: объект Work
        circulation: int, тираж

    Возвращает:
        Decimal: интерполированная себестоимость (без наценки)
    """
    # Получаем все опорные точки по тиражу для данной работы, отсортированные по circulation
    price_points = work.circulation_prices.order_by('circulation')

    if not price_points.exists():
        # Если нет точек, возвращаем базовую цену работы
        return work.price

    circulation_int = int(circulation)

    # Минимальная и максимальная точки
    min_point = price_points.first()
    max_point = price_points.last()

    # Если запрошенный тираж меньше минимального, возвращаем цену минимальной точки
    if circulation_int <= min_point.circulation:
        return min_point.price

    # Если больше максимального, возвращаем цену максимальной точки
    if circulation_int >= max_point.circulation:
        return max_point.price

    # Ищем две ближайшие точки для интерполяции
    prev_point = None
    next_point = None
    for point in price_points:
        if point.circulation <= circulation_int:
            prev_point = point
        if point.circulation >= circulation_int:
            next_point = point
            break

    # Если обе точки найдены и они разные
    if prev_point and next_point and prev_point != next_point:
        method = work.interpolation_method  # 'linear' или 'logarithmic'

        # Линейная интерполяция
        if method == 'linear':
            x1, y1 = float(prev_point.circulation), float(prev_point.price)
            x2, y2 = float(next_point.circulation), float(next_point.price)
            x = float(circulation_int)
            result = y1 + (y2 - y1) * (x - x1) / (x2 - x1)
            return Decimal(str(round(result, 2)))

        # Логарифмическая интерполяция
        elif method == 'logarithmic':
            epsilon = 1e-10
            x1 = math.log(float(prev_point.circulation) + epsilon)
            y1 = math.log(float(prev_point.price) + epsilon)
            x2 = math.log(float(next_point.circulation) + epsilon)
            y2 = math.log(float(next_point.price) + epsilon)
            x = math.log(float(circulation_int) + epsilon)
            result_log = y1 + (y2 - y1) * (x - x1) / (x2 - x1)
            result = math.exp(result_log) - epsilon
            return Decimal(str(round(result, 2)))

        # По умолчанию (если метод не распознан) – линейная
        else:
            x1, y1 = float(prev_point.circulation), float(prev_point.price)
            x2, y2 = float(next_point.circulation), float(next_point.price)
            x = float(circulation_int)
            result = y1 + (y2 - y1) * (x - x1) / (x2 - x1)
            return Decimal(str(round(result, 2)))

    # Если не нашли две разные точки (например, только одна точка)
    return prev_point.price if prev_point else min_point.price