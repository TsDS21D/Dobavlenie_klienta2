# calculator/utils_mass_volume.py
"""
Утилита расчёта массы, объёма и размера стопки для просчёта.

НАЗНАЧЕНИЕ:
    ЕДИНЫЙ источник правды для формул массы/объёма/стопки.
    Используется:
      - секцией «Масса и объём» калькулятора (через get_proschet_price_data);
      - сервисами приложения orders при создании изделия
        (чтобы заморозить массу/объём на момент создания).

ПОЧЕМУ ОТДЕЛЬНЫЙ ФАЙЛ:
    Формулы живут на Python, а JS только отображает результаты.
    Так гарантируется единый источник правды.

ЛОГИКА (ВАЖНО):

    Считаем «по факту нарезанной бумаги»:
    берём количество физических печатных листов (sheet_count),
    умножаем на количество изделий, помещающихся на одном листе
    (fit_total), и получаем N — общее число бумажных единиц,
    которое реально образуется после резки.

    N = sheet_count × fit_total

    Для многостраничного изделия sheet_count УЖЕ учитывает режим
    печати (single/duplex). Для single: sheet_count = ceil(pages*copies/fit_total);
    для duplex: sheet_count = ceil(pages*copies/(fit_total*2)).
    Поэтому отдельный множитель duplex в эти формулы не добавляем —
    он уже «спрятан» внутри sheet_count.

    Площадь одной бумажной единицы S берётся из размеров готового
    изделия (item_width/item_height или finished_width/finished_height).

ВХОД:
    Словарь data:
      data['print_components'][i] — компоненты, где есть:
          'id', 'number', 'printer_name',
          'paper_density' (г/м²), 'paper_thickness' (мм),
          'item_width' (мм), 'item_height' (мм),
          'sheet_count' (кол-во физических листов),
          'fit_total' (сколько единиц на листе).
      data['laminations'][j] — ламинации, где есть:
          'component_id', 'is_enabled', 'side' ('single'/'duplex'),
          'film_thickness' (мкм), 'film_name'

ВЫХОД:
    Словарь:
      {
        'paper_mass_g':     float,
        'film_mass_g':      float,
        'total_mass_g':     float,    # +2% на краску/упаковку
        'paper_volume_cm3': float,
        'film_volume_cm3':  float,
        'total_volume_cm3': float,
        'stacks': [
            {
                'label': str,
                'width_mm': float|None,
                'height_mm': float|None,
                'stack_height_mm': float|None,
                'valid': bool,
            },
            ...
        ],
      }

ФОРМУЛЫ:
    N = sheet_count × fit_total   (число бумажных единиц после резки)
    S = площадь единицы (м²)      (из размеров готового изделия)

    Масса бумаги (г)   = N × S × плотность_г/м².
    Объём бумаги (см³) = (N × S × толщина_мм) × 1_000_000 / 1000
                       = N × S × толщина_мм × 1000
                       (S в м², толщина в мм, объём в см³).

    Масса плёнки (г)   = N × S × толщина_мкм × 0.1 × (1 или 2 по стороне).
    Объём плёнки (см³) = N × S × толщина_мкм × 1000 × (1 или 2 по стороне)
                       / 1_000_000   (упрощённо ниже).

    Общая масса (г)    = (масса_бумаги + масса_плёнки) × 1.02.
    Толщина стопки (мм) = N × (толщина_бумаги_мм
                          + (толщина_плёнки_мкм / 1000) × сторона_ламинации).
"""

from decimal import Decimal   # Точная арифметика


# ============================================================================
# ВСПОМОГАТЕЛЬНЫЕ КОНВЕРТЕРЫ
# ============================================================================

def _to_float(value, default=0.0):
    """Безопасно приводит значение к float."""
    if value is None:
        return default
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _to_decimal(value, default='0'):
    """Безопасно приводит значение к Decimal."""
    if value is None:
        return Decimal(default)
    try:
        return Decimal(str(value))
    except Exception:
        return Decimal(default)


# ============================================================================
# ОСНОВНАЯ ФУНКЦИЯ
# ============================================================================

def calculate_mass_and_volume(data):
    """
    Считает массу/объём/стопки для просчёта.
    См. docstring модуля выше — там подробно описаны формулы и логика.
    """

    # ===== Итоговые суммы =====
    total_paper_mass_g = Decimal('0')
    total_film_mass_g = Decimal('0')
    total_paper_volume_cm3 = Decimal('0')
    total_film_volume_cm3 = Decimal('0')

    stacks_data = []

    # ===== Карта ламинаций по component_id =====
    lamination_by_component = {}
    for lam in data.get('laminations') or []:
        comp_id = lam.get('component_id')
        if comp_id is not None:
            lamination_by_component[comp_id] = lam

    # ===== Перебираем компоненты =====
    for comp in data.get('print_components') or []:
        comp_id = comp.get('id')

        # --- Размеры изделия (мм) ---
        item_w_mm = _to_float(comp.get('item_width'), 0.0)
        item_h_mm = _to_float(comp.get('item_height'), 0.0)

        # --- Метка компонента ---
        label_parts = []
        if comp.get('number'):
            label_parts.append(str(comp['number']))
        if comp.get('printer_name'):
            label_parts.append(str(comp['printer_name']))
        label = ' · '.join(label_parts) if label_parts else f'Компонент #{comp_id}'

        # --- Если размеры не заданы — стопку считать не можем ---
        if item_w_mm <= 0 or item_h_mm <= 0:
            stacks_data.append({
                'label': label,
                'width_mm': item_w_mm or None,
                'height_mm': item_h_mm or None,
                'stack_height_mm': None,
                'valid': False,
            })
            continue

        # --- Количество «бумажных единиц после резки»: N = sheet_count × fit_total ---
        sheet_count = _to_float(comp.get('sheet_count'), 0.0)
        fit_total = _to_float(comp.get('fit_total'), 0.0)
        N = sheet_count * fit_total

        # Если N = 0 — тоже не можем считать
        if N <= 0:
            stacks_data.append({
                'label': label,
                'width_mm': item_w_mm,
                'height_mm': item_h_mm,
                'stack_height_mm': None,
                'valid': False,
            })
            continue

        N_dec = Decimal(str(N))

        # --- Площадь одной единицы (м²) ---
        area_m2 = (Decimal(str(item_w_mm)) * Decimal(str(item_h_mm))) / Decimal('1000000')

        # --- Бумага ---
        paper_density = _to_float(comp.get('paper_density'), 0.0)
        paper_thickness_mm = _to_float(comp.get('paper_thickness'), 0.0)

        # Автоконвертация: если плотность < 100 — вероятно в кг/м².
        if 0 < paper_density < 100:
            paper_density = paper_density * 1000

        paper_density_dec = Decimal(str(paper_density))
        paper_thickness_dec = Decimal(str(paper_thickness_mm))

        # --- Масса бумаги (г) = N × area_m2 × плотность ---
        paper_mass_g = N_dec * area_m2 * paper_density_dec
        total_paper_mass_g += paper_mass_g

        # --- Объём бумаги (см³) = N × area_m2 × толщина_мм × 1000 ---
        # (area_m2 в м², толщина в мм → результат в см³)
        paper_volume_cm3 = N_dec * area_m2 * paper_thickness_dec * Decimal('1000')
        total_paper_volume_cm3 += paper_volume_cm3

        # --- Ламинация ---
        lam = lamination_by_component.get(comp_id)
        film_thickness_um = 0.0
        film_side_multiplier = Decimal('1')
        if lam and lam.get('is_enabled'):
            film_thickness_um = _to_float(lam.get('film_thickness'), 0.0)
            if lam.get('side') == 'duplex':
                film_side_multiplier = Decimal('2')

        # --- Масса плёнки (г) = N × area_m2 × толщина_мкм × 0.1 × сторона ---
        film_mass_g = Decimal('0')
        if film_thickness_um > 0:
            film_mass_g = (
                N_dec
                * area_m2
                * Decimal(str(film_thickness_um))
                * Decimal('0.1')
                * film_side_multiplier
            )
        total_film_mass_g += film_mass_g

        # --- Объём плёнки (см³) = N × area_m2 × толщина_мкм × 1000 × сторона / 1_000_000 ---
        # Упрощённо: N × area_m2 × (толщина_мкм / 1000) × 1000 × сторона
        # = N × area_m2 × толщина_мкм × сторона
        film_volume_cm3 = Decimal('0')
        if film_thickness_um > 0:
            film_volume_cm3 = (
                N_dec
                * area_m2
                * Decimal(str(film_thickness_um))
                * film_side_multiplier
            )
        total_film_volume_cm3 += film_volume_cm3

        # --- Размер стопки (мм) ---
        # толщина_одной_единицы = толщина_бумаги + толщина_плёнки_в_мм × сторона
        thickness_per_item_mm = paper_thickness_dec
        if film_thickness_um > 0:
            film_thickness_mm = Decimal(str(film_thickness_um)) / Decimal('1000')
            thickness_per_item_mm += film_thickness_mm * film_side_multiplier

        if thickness_per_item_mm > 0:
            stack_height_mm = N_dec * thickness_per_item_mm
            stacks_data.append({
                'label': label,
                'width_mm': item_w_mm,
                'height_mm': item_h_mm,
                'stack_height_mm': float(stack_height_mm.quantize(Decimal('0.1'))),
                'valid': True,
            })
        else:
            stacks_data.append({
                'label': label,
                'width_mm': item_w_mm,
                'height_mm': item_h_mm,
                'stack_height_mm': None,
                'valid': False,
            })

    # ===== Итоговая масса с +2% на краску/упаковку =====
    packaging_coefficient = Decimal('1.02')
    total_mass_g = (total_paper_mass_g + total_film_mass_g) * packaging_coefficient

    # ===== Округления до 2 знаков =====
    def _round2(d):
        return float(d.quantize(Decimal('0.01')))

    return {
        'paper_mass_g':     _round2(total_paper_mass_g),
        'film_mass_g':      _round2(total_film_mass_g),
        'total_mass_g':     _round2(total_mass_g),
        'paper_volume_cm3': _round2(total_paper_volume_cm3),
        'film_volume_cm3':  _round2(total_film_volume_cm3),
        'total_volume_cm3': _round2(total_paper_volume_cm3 + total_film_volume_cm3),
        'stacks':           stacks_data,
    }