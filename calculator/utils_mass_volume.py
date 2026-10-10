# calculator/utils_mass_volume.py
"""
Утилита расчёта массы, объёма и размера стопки для просчёта.

НАЗНАЧЕНИЕ:
    ЕДИНЫЙ источник правды для формул массы/объёма. Используется:
      - секцией «Масса и объём» калькулятора (через get_proschet_price_data);
      - сервисами приложения orders при создании изделия
        (чтобы заморозить массу/объём на момент создания).

ПОЧЕМУ ОТДЕЛЬНЫЙ ФАЙЛ:
    Раньше формулы были в JS (massa_i_obyom.js) и на сервере их не было.
    При создании изделия нам нужно сохранить массу/объём «как есть» —
    но сервер не может вызвать JS. Значит, формулы живут на Python,
    а JS их только отображает.

ВХОД:
    Словарь data — это тот же словарь, что сейчас возвращает
    get_proschet_price_data (или его подмножество). Нужны:
      data['proschet']['circulation']         — тираж
      data['print_components'][i]              — список компонентов, где есть:
          'id', 'number', 'printer_name',
          'paper_density' (г/м²), 'paper_thickness' (мм),
          'item_width' (мм), 'item_height' (мм)
      data['laminations'][j]                   — список ламинаций, где есть:
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

ФОРМУЛЫ (те же, что раньше в JS massa_i_obyom.js):
    Масса бумаги (г)   = площадь_м² × плотность_г/м² × тираж.
    Объём бумаги (см³) = (ширина_мм × высота_мм × толщина_мм × тираж) / 1000.
    Масса плёнки (г)   = площадь_м² × тираж × толщина_мкм × 0.1 × (1 или 2 по стороне).
    Объём плёнки (см³) = (ширина_мм × высота_мм × толщина_мкм × тираж) / 1_000_000.
    Общая масса (г)    = (масса_бумаги + масса_плёнки) × 1.02.
    Размер стопки (мм) = ширина × высота × (толщина_бумаги + толщина_плёнки_в_мм × сторона) × тираж.
"""

from decimal import Decimal   # Точная арифметика — чтобы не накапливать float-погрешности


# ============================================================================
# ВСПОМОГАТЕЛЬНЫЕ КОНВЕРТЕРЫ
# ============================================================================

def _to_float(value, default=0.0):
    """
    Безопасно приводит значение к float.
    Возвращает default, если значение None, пустая строка или не парсится.
    """
    if value is None:
        return default
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


# ============================================================================
# ОСНОВНАЯ ФУНКЦИЯ
# ============================================================================

def calculate_mass_and_volume(data):
    """
    Считает массу/объём/стопки для просчёта.

    Аргумент:
        data — словарь с ключами 'proschet', 'print_components', 'laminations'.
               Смотри docstring модуля выше — что именно нужно.

    Возвращает:
        dict — смотри docstring модуля выше.
    """

    # ===== Итоговые суммы =====
    total_paper_mass_g = Decimal('0')       # масса бумаги (г)
    total_film_mass_g = Decimal('0')        # масса плёнки (г)
    total_paper_volume_cm3 = Decimal('0')   # объём бумаги (см³)
    total_film_volume_cm3 = Decimal('0')    # объём плёнки (см³)

    stacks_data = []                         # сюда соберём данные по каждой стопке

    # ===== Тираж (общий для всех компонентов) =====
    proschet = data.get('proschet') or {}
    circulation = int(proschet.get('circulation') or 1)
    circulation_dec = Decimal(str(circulation))

    # ===== Карта ламинаций по component_id — для быстрого поиска =====
    lamination_by_component = {}
    for lam in data.get('laminations') or []:
        comp_id = lam.get('component_id')
        if comp_id is not None:
            lamination_by_component[comp_id] = lam

    # ===== Перебираем все компоненты =====
    for comp in data.get('print_components') or []:
        comp_id = comp.get('id')

        # --- Размеры изделия ---
        item_w_mm = _to_float(comp.get('item_width'), 0.0)
        item_h_mm = _to_float(comp.get('item_height'), 0.0)

        # --- Метка компонента (для отображения стопки) ---
        label_parts = []
        if comp.get('number'):
            label_parts.append(str(comp['number']))
        if comp.get('printer_name'):
            label_parts.append(str(comp['printer_name']))
        label = ' · '.join(label_parts) if label_parts else f'Компонент #{comp_id}'

        # --- Если размеры не заданы — стопку посчитать не можем, но запись оставим ---
        if item_w_mm <= 0 or item_h_mm <= 0:
            stacks_data.append({
                'label': label,
                'width_mm': item_w_mm or None,
                'height_mm': item_h_mm or None,
                'stack_height_mm': None,
                'valid': False,
            })
            continue

        # --- Площадь изделия в м² ---
        area_m2 = (Decimal(str(item_w_mm)) * Decimal(str(item_h_mm))) / Decimal('1000000')

        # --- Бумага: плотность и толщина ---
        paper_density = _to_float(comp.get('paper_density'), 0.0)
        paper_thickness_mm = _to_float(comp.get('paper_thickness'), 0.0)

        # Автоконвертация: если плотность < 100, вероятно она в кг/м² — переводим в г/м².
        if 0 < paper_density < 100:
            paper_density = paper_density * 1000

        paper_density_dec = Decimal(str(paper_density))
        paper_thickness_dec = Decimal(str(paper_thickness_mm))

        # --- Масса бумаги (г) ---
        paper_mass_g = area_m2 * paper_density_dec * circulation_dec
        total_paper_mass_g += paper_mass_g

        # --- Объём бумаги (см³) ---
        # (ш × в × толщина_мм × тираж) / 1000  → из мм³ в см³.
        paper_volume_cm3 = (
            Decimal(str(item_w_mm))
            * Decimal(str(item_h_mm))
            * paper_thickness_dec
            * circulation_dec
        ) / Decimal('1000')
        total_paper_volume_cm3 += paper_volume_cm3

        # --- Ламинация для этого компонента (если есть) ---
        lam = lamination_by_component.get(comp_id)
        film_thickness_um = 0.0
        film_side_multiplier = Decimal('1')
        if lam and lam.get('is_enabled'):
            film_thickness_um = _to_float(lam.get('film_thickness'), 0.0)
            if lam.get('side') == 'duplex':
                film_side_multiplier = Decimal('2')

        # --- Масса плёнки (г) ---
        # Формула: площадь_м² × тираж × толщина_мкм × 0.1 × сторона.
        film_mass_g = Decimal('0')
        if film_thickness_um > 0:
            film_mass_g = (
                area_m2
                * circulation_dec
                * Decimal(str(film_thickness_um))
                * Decimal('0.1')
                * film_side_multiplier
            )
        total_film_mass_g += film_mass_g

        # --- Объём плёнки (см³) ---
        # (ш × в × толщина_мкм × тираж) / 1_000_000.
        film_volume_cm3 = Decimal('0')
        if film_thickness_um > 0:
            film_volume_cm3 = (
                Decimal(str(item_w_mm))
                * Decimal(str(item_h_mm))
                * Decimal(str(film_thickness_um))
                * circulation_dec
            ) / Decimal('1000000')
        total_film_volume_cm3 += film_volume_cm3

        # --- Размер стопки ---
        # Толщина одного изделия = толщина бумаги + (толщина плёнки_мкм / 1000) × сторона.
        thickness_per_item_mm = paper_thickness_dec
        if film_thickness_um > 0:
            film_thickness_mm = Decimal(str(film_thickness_um)) / Decimal('1000')
            thickness_per_item_mm += film_thickness_mm * film_side_multiplier

        if thickness_per_item_mm > 0:
            stack_height_mm = thickness_per_item_mm * circulation_dec
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

    # ===== Итоговая масса с коэффициентом +2% на краску/упаковку =====
    packaging_coefficient = Decimal('1.02')
    total_mass_g = (total_paper_mass_g + total_film_mass_g) * packaging_coefficient

    # ===== Округления до 2 знаков (как в JS) =====
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