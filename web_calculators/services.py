# web_calculators/services.py
"""
Сервисный слой приложения "Веб-калькуляторы".

Здесь сосредоточена вся логика расчёта публичного калькулятора:
- подготовка структуры опций для сайта (get_options),
- расчёт заказа по параметрам клиента (calculate_price).

Оба входа НЕ ПИШУТ В БД. Все объекты — PrintComponent, VichisliniyaListovModel,
VichisliniyaMultipageModel, Laminate, AdditionalWork — создаются в памяти
и используются только для расчёта. Это даёт высокую скорость (нет INSERT'ов)
и не засоряет базу тысячами временных записей.

Все ошибки валидации бросаются как OrderCalculationError — view ловит их
и превращает в JSON со статусом 400.
"""

# ===== СТАНДАРТНЫЕ ИМПОРТЫ =====
import math
from decimal import Decimal, InvalidOperation

# ===== ИМПОРТЫ DJANGO =====
from django.db import transaction

# ===== ИМПОРТЫ МОДЕЛЕЙ =====
from calculator.models_lamination import Laminate
from calculator.models_list_proschet import Proschet, PrintComponent, AdditionalWork
from vichisliniya_listov.models import VichisliniyaListovModel
from vichisliniya_listov.multipage_models import VichisliniyaMultipageModel
from print_price.utils import calculate_price_for_printer_and_copies
from sklad.models import Material
from spravochnik_dopolnitelnyh_rabot.models import Work
from spravochnik_dopolnitelnyh_rabot.utils import (
    calculate_price_for_work,
    calculate_price_for_work_by_circulation,
)

from .models import WebCalculator, WebCalculatorComponent


# ============================================================================
# ИСКЛЮЧЕНИЕ
# ============================================================================

class OrderCalculationError(Exception):
    """
    Ошибка валидации или расчёта. Содержит код ошибки (error_code) и
    произвольные детали (details) — чтобы клиент мог их обработать.
    """
    def __init__(self, message, error_code='validation_error', details=None):
        super().__init__(message)
        self.message = message
        self.error_code = error_code
        self.details = details or {}

    def to_dict(self):
        """Возвращает словарь для JSON-ответа."""
        return {
            'success': False,
            'error': self.message,
            'error_code': self.error_code,
            'details': self.details,
        }


# ============================================================================
# ПУБЛИЧНЫЙ ВХОД: OPTIONS
# ============================================================================

def get_options(calculator):
    """
    Возвращает структуру опций веб-калькулятора для внешнего сайта.
    Сайт по этому ответу строит форму: выпадающие списки бумаг, плёнок,
    работы, допустимые комбинации печати и т.д.
    """
    # Пресеты тиража (значения, которые клиент видит в выпадающем списке).
    circulation_presets = [
        p.value for p in calculator.circulation_presets.all().order_by('order', 'value')
    ]

    # Пресеты количества (для работ с флагом show_quantity).
    quantity_presets = [
        p.value for p in calculator.quantity_presets.all().order_by('order', 'value')
    ]

    components_data = []
    for comp in calculator.components.all().order_by('order', 'id'):
        # Собираем разрешённые комбинации печати.
        print_options = []
        if comp.allow_color_single:
            print_options.append({'value': 'color_single', 'label': 'Цветная односторонняя'})
        if comp.allow_color_duplex:
            print_options.append({'value': 'color_duplex', 'label': 'Цветная двусторонняя'})
        if comp.allow_bw_single:
            print_options.append({'value': 'bw_single', 'label': 'Ч/б односторонняя'})
        if comp.allow_bw_duplex:
            print_options.append({'value': 'bw_duplex', 'label': 'Ч/б двусторонняя'})

        # Бумаги: в API отдаём клиентское название, а если его нет —
        # полное складское. Привязка — через новую модель papers.
        papers = []
        for cp in comp.papers.all().select_related('material').order_by('order', 'id'):
            papers.append({
                'id': cp.material.id,
                'name': cp.customer_name or cp.material.name,
            })

        # Ламинация.
        lamination_data = None
        if comp.lamination_enabled:
            sides = []
            if comp.allow_lamination_single:
                sides.append({'value': 'single', 'label': 'Односторонняя'})
            if comp.allow_lamination_duplex:
                sides.append({'value': 'duplex', 'label': 'Двусторонняя'})
            films = []
            for cf in comp.films.all().select_related('material').order_by('order', 'id'):
                films.append({
                    'id': cf.material.id,
                    'name': cf.customer_name or cf.material.name,
                })
            lamination_data = {'enabled': True, 'sides': sides, 'films': films}

        # Работы: в API отдаём только опциональные (галочки в калькуляторе).
        # Работы с trigger='always' и 'lamination' — серверные, клиент их
        # не видит, но они всегда (или при определённых условиях) участвуют
        # в расчёте. Отправляем их отдельным списком для отладки.
        optional_works = []
        always_on_works = []
        quantity_works = []
        for cw in comp.works.all().select_related('work').order_by('order', 'id'):
            item = {
                'id': cw.work.id,
                'name': cw.work.name,
                'trigger': cw.trigger,
                'preview_effect': cw.preview_effect,
                'show_quantity': cw.show_quantity,
            }
            if cw.trigger == 'optional':
                optional_works.append(item)
            else:
                # И 'always', и 'lamination' — не показываем в форме,
                # но возвращаем клиенту для отладки.
                always_on_works.append(item)

            # Работы, для которых в калькуляторе нужна строка «Количество».
            # Отдельный список — JS рендерит по нему отдельный подблок.
            if cw.show_quantity:
                quantity_works.append({
                    'id': cw.work.id,
                    'name': cw.work.name,
                    'default_quantity': 1,
                })

        # Пресеты размеров.
        presets = [
            {
                'w': float(p.width_mm),
                'h': float(p.height_mm),
                'label': p.label or f"{p.width_mm}×{p.height_mm}",
            }
            for p in comp.size_presets.all().order_by('order', 'width_mm')
        ]

        # Скрепление и многостраничность.
        binding_data = None
        multipage_data = None
        if calculator.product_type == 'multipage':
            if comp.binding:
                binding_data = {
                    'id': comp.binding.id,
                    'name': comp.binding.name,
                    'page_multiple': comp.binding.page_multiple,
                }
            multipage_data = {
                'allow_portrait': comp.allow_booklet_portrait,
                'allow_landscape': comp.allow_booklet_landscape,
                'min_pages': comp.min_pages,
                'max_pages': comp.max_pages,
            }

        components_data.append({
            'id': comp.id,
            'name': comp.name,
            'order': comp.order,
            'printer': {'id': comp.printer.id, 'name': comp.printer.name} if comp.printer else None,
            'print_options': print_options,
            'papers': papers,
            'lamination': lamination_data,
            'works': optional_works,
            'always_on_works': always_on_works,
            'quantity_works': quantity_works,
            'size': {
                'min_width_mm': float(comp.min_width_mm),
                'max_width_mm': float(comp.max_width_mm),
                'min_height_mm': float(comp.min_height_mm),
                'max_height_mm': float(comp.max_height_mm),
                'presets': presets,
            },
            'binding': binding_data,
            'multipage': multipage_data,
        })

    return {
        'success': True,
        'calculator': {
            'name': calculator.name,
            'slug': calculator.slug,
            'product_type': calculator.product_type,
            'min_circulation': calculator.min_circulation,
            'max_circulation': calculator.max_circulation,
            'circulation_step': calculator.circulation_step,
            'default_circulation': calculator.default_circulation,
            'circulation_presets': circulation_presets,
            'quantity_presets': quantity_presets,
        },
        'components': components_data,
    }


# ============================================================================
# ПУБЛИЧНЫЙ ВХОД: PRICE
# ============================================================================

def calculate_price(calculator, data):
    """
    Считает заказ по данным от клиента. Возвращает dict для JSON-ответа.

    Не пишет в БД. Все проверки делаются здесь.
    """
    circulation = _validate_circulation(calculator, data.get('circulation'))

    # Параметры многостраничного изделия (для product_type='multipage').
    total_pages = data.get('total_pages')
    booklet_orientation = data.get('booklet_orientation')  # 'portrait' или 'landscape'

    # Компоненты.
    components_in = data.get('components') or []
    if not isinstance(components_in, list) or not components_in:
        raise OrderCalculationError(
            'Поле "components" обязательно и должно содержать хотя бы один компонент',
            'bad_request',
        )

    comps_by_id = {c.id: c for c in calculator.components.all()}
    provided_ids = set()

    result_components = []
    total_price = Decimal('0.00')
    total_mass_g = Decimal('0.00')
    total_volume_cm3 = Decimal('0.00')
    stacks = []
    warnings = []

    for comp_in in components_in:
        comp_id = comp_in.get('component_id')
        if comp_id not in comps_by_id:
            raise OrderCalculationError(
                f'Компонент id={comp_id} не относится к этому калькулятору',
                'unknown_component',
                {'component_id': comp_id},
            )
        if comp_id in provided_ids:
            raise OrderCalculationError(
                f'Компонент id={comp_id} передан дважды',
                'duplicate_component',
                {'component_id': comp_id},
            )
        provided_ids.add(comp_id)

        comp = comps_by_id[comp_id]
        res = _calculate_component(
            calculator, comp, comp_in, circulation,
            total_pages=total_pages,
            booklet_orientation=booklet_orientation,
        )
        result_components.append(res)
        total_price += Decimal(str(res['component_total']))
        total_mass_g += Decimal(str(res['mass_g']))
        total_volume_cm3 += Decimal(str(res['volume_cm3']))
        if res.get('stack'):
            stacks.append(res['stack'])

    missing = set(comps_by_id.keys()) - provided_ids
    if missing:
        names = ', '.join(comps_by_id[i].name for i in missing)
        raise OrderCalculationError(
            f'Не указаны обязательные компоненты: {names}',
            'missing_components',
            {'missing_ids': list(missing)},
        )

    # Коэффициент 1.02 на массу (краска, упаковка) — как в секции "Масса и объём".
    total_mass_g = (total_mass_g * Decimal('1.02')).quantize(Decimal('0.01'))

    # Сначала округляем цену за штуку, потом пересчитываем итог от неё.
    # Так цифры сходятся: price_per_unit × circulation = total_price.
    # Пример: точная цена 667.80 ₽ / 100 шт = 6.678 ₽/шт → округляем до 6.68,
    # итог = 6.68 × 100 = 668.00 ₽. Клиент не увидит расхождения.
    price_per_unit = (total_price / Decimal(circulation)).quantize(Decimal('0.01'))
    total_price = (price_per_unit * Decimal(circulation)).quantize(Decimal('0.01'))

    return {
        'success': True,
        'total_price': float(total_price),
        'price_per_unit': float(price_per_unit),
        'total_mass_g': float(total_mass_g),
        'total_volume_cm3': float(total_volume_cm3),
        'components': result_components,
        'stacks': stacks,
        'warnings': warnings,
    }


# ============================================================================
# ВАЛИДАЦИЯ ТИРАЖА
# ============================================================================

def _validate_circulation(calculator, value):
    """
    Проверяет тираж. Округляет его до ближайшего кратного circulation_step
    (математически — .5 и выше идут вверх, меньше .5 — вниз).

    Возвращает округлённое int-значение или бросает OrderCalculationError.
    """
    if value is None:
        raise OrderCalculationError('Не указан тираж', 'missing_circulation')
    try:
        n = int(value)
    except (ValueError, TypeError):
        raise OrderCalculationError('Тираж должен быть целым числом', 'invalid_circulation')

    if n <= 0:
        raise OrderCalculationError('Тираж должен быть положительным', 'invalid_circulation')

    # Округляем до ближайшего кратного шагу.
    step = calculator.circulation_step or 1
    if step > 1:
        # (x + step/2) // step * step — округление к ближайшему кратному.
        # Например, при step=50: 74 → 50, 75 → 100, 100 → 100.
        n = ((n + step // 2) // step) * step

    # Проверяем, что после округления тираж в границах.
    if n < calculator.min_circulation:
        n = calculator.min_circulation
    if n > calculator.max_circulation:
        # Округляем вниз до ближайшего кратного, не превышающего max.
        n = (calculator.max_circulation // step) * step

    return n


# ============================================================================
# РАСЧЁТ ОДНОГО КОМПОНЕНТА
# ============================================================================

def _calculate_component(calculator, comp, comp_in, circulation,
                        total_pages=None, booklet_orientation=None):
    """
    Считает один печатный компонент. Возвращает словарь с разбивкой.
    """
    # --- 1. Параметры печати ---
    print_type, printing_mode = _validate_print_combination(comp, comp_in)

    # --- 2. Бумага ---
    paper = _get_allowed_paper(comp, comp_in.get('paper_id'))

    # --- 3. Размеры изделия ---
    width_mm = _to_decimal(comp_in.get('width_mm'), 'width_mm')
    height_mm = _to_decimal(comp_in.get('height_mm'), 'height_mm')
    _validate_size(comp, width_mm, height_mm)

    # --- 4. Количество листов ---
    if calculator.product_type == 'multipage':
        sheets_count, cuts_count = _calc_sheets_multipage(
            comp, width_mm, height_mm, total_pages, booklet_orientation,
            circulation, printing_mode,
        )
    else:
        sheets_count, cuts_count = _calc_sheets_single(
            comp, width_mm, height_mm, circulation,
        )

    sheets_count_int = int(sheets_count)

    # --- 5. Цена за лист (интерполяция) ---
    price_per_sheet = Decimal('0.00')
    if comp.printer and sheets_count_int > 0:
        price_per_sheet = calculate_price_for_printer_and_copies(
            comp.printer, sheets_count_int, print_type,
        )

    # --- 6. Прогоны (для двусторонней — ×2) ---
    runs_count = sheets_count_int * (2 if printing_mode == 'duplex' else 1)

    # --- 7. Стоимость печати и бумаги ---
    printing_cost = (price_per_sheet * Decimal(runs_count)).quantize(Decimal('0.01'))
    paper_price = paper.get_price() if hasattr(paper, 'get_price') else Decimal('0.00')
    paper_cost = (paper_price * Decimal(sheets_count_int)).quantize(Decimal('0.01'))

    # --- 8. Ламинация ---
    lamination_cost = Decimal('0.00')
    lamination_data = None
    lamination_side = None
    film = None
    if comp_in.get('lamination_enabled') and comp.lamination_enabled:
        lamination_side = comp_in.get('lamination_side', 'single')
        _validate_lamination_side(comp, lamination_side)
        film = _get_allowed_film(comp, comp_in.get('film_id'))
        if not comp.laminator:
            raise OrderCalculationError(
                f'У компонента "{comp.name}" не задан ламинатор',
                'no_laminator',
            )
        lamination_cost = _calc_lamination(comp, lamination_side, film, sheets_count_int)
        lamination_data = {
            'enabled': True,
            'side': lamination_side,
            'film_id': film.id,
            'film_name': film.name,
            'cost': float(lamination_cost),
        }

    # --- 9. Дополнительные работы ---
    # У каждой работы есть trigger:
    #   'optional'   — участвует, если пришла в work_ids;
    #   'always'     — всегда участвует;
    #   'lamination' — участвует, если у компонента включена ламинация.
    # Дубликаты (работа и в trigger, и в work_ids) считаются один раз.
    works_cost = Decimal('0.00')
    works_list = []
    always_on_list = []

    # 9.1. Сначала определяем, включена ли ламинация у этого компонента.
    # ВАЖНО: клиент передаёт lamination_enabled=True, но это только его желание.
    # Учитываем его как «включено», если у компонента разрешена ламинация.
    client_lamination_on = bool(comp_in.get('lamination_enabled')) and comp.lamination_enabled

    provided_ids = set(comp_in.get('work_ids') or [])
    provided_quantities = comp_in.get('work_quantities') or {}
    processed_work_ids = set()      # защита от дубликатов

    for cw in comp.works.all().select_related('work').order_by('order', 'id'):
        work = cw.work

        # 9.2. Определяем, участвует ли работа в расчёте.
        if cw.trigger == 'always':
            is_selected = True
        elif cw.trigger == 'lamination':
            is_selected = client_lamination_on
        else:  # 'optional' и любое неизвестное значение
            is_selected = work.id in provided_ids

        if not is_selected:
            continue
        if work.id in processed_work_ids:
            continue
        processed_work_ids.add(work.id)

        # 9.3. Количество работы. Если у работы стоит флаг show_quantity —
        # количество берём из work_quantities (по ключу-строке ID работы).
        # Если клиент не прислал значение — по умолчанию 1.
        work_qty = 1
        if cw.show_quantity:
            raw = provided_quantities.get(str(work.id))
            if raw is not None:
                try:
                    work_qty = int(raw)
                    if work_qty < 1:
                        work_qty = 1
                except (ValueError, TypeError):
                    work_qty = 1

        cost = _calc_work_cost(
            work, Decimal(sheets_count), cuts_count, circulation, quantity=work_qty,
        )
        works_cost += cost

        entry = {
            'id': work.id,
            'name': work.name,
            'cost': float(cost),
            'quantity': work_qty,
            'trigger': cw.trigger,
            'preview_effect': cw.preview_effect,
            'show_quantity': cw.show_quantity,
        }
        works_list.append(entry)
        # Для отладки в результат отдаём все не-опциональные работы.
        if cw.trigger != 'optional':
            always_on_list.append(entry)

    # --- 10. Итог по компоненту ---
    component_total = (printing_cost + paper_cost + lamination_cost + works_cost).quantize(Decimal('0.01'))

    # --- 11. Масса и объём ---
    mass_g, volume_cm3 = _calc_mass_volume(
        paper, film, lamination_side,
        width_mm, height_mm, circulation,
    )

    # --- 12. Размер стопки ---
    stack = _calc_stack(
        comp, paper, film, lamination_side,
        width_mm, height_mm, circulation,
    )

    return {
        'component_id': comp.id,
        'name': comp.name,
        'print_type': print_type,
        'printing_mode': printing_mode,
        'printing_cost': float(printing_cost),
        'paper_cost': float(paper_cost),
        'lamination_cost': float(lamination_cost),
        'works_cost': float(works_cost),
        'component_total': float(component_total),
        'sheets_count': float(sheets_count),
        'runs_count': runs_count,
        'price_per_sheet': float(price_per_sheet),
        'paper_price_per_unit': float(paper_price),
        'mass_g': float(mass_g),
        'volume_cm3': float(volume_cm3),
        'stack': stack,
        'lamination': lamination_data,
        'works': works_list,
        'always_on_works': always_on_list,
    }


# ============================================================================
# ПРОВЕРКИ КОМБИНАЦИИ ПЕЧАТИ
# ============================================================================

def _validate_print_combination(comp, comp_in):
    """
    Возвращает (print_type, printing_mode). Проверяет, что комбинация разрешена.
    """
    combo = comp_in.get('print_combo')  # ожидаем 'color_single' и т.п.
    if combo:
        if combo == 'color_single':
            print_type, printing_mode, allowed = 'color', 'single', comp.allow_color_single
        elif combo == 'color_duplex':
            print_type, printing_mode, allowed = 'color', 'duplex', comp.allow_color_duplex
        elif combo == 'bw_single':
            print_type, printing_mode, allowed = 'bw', 'single', comp.allow_bw_single
        elif combo == 'bw_duplex':
            print_type, printing_mode, allowed = 'bw', 'duplex', comp.allow_bw_duplex
        else:
            raise OrderCalculationError(
                f'Неизвестная комбинация печати: {combo}',
                'invalid_print_combo',
                {'print_combo': combo},
            )
    else:
        # Альтернативный формат: отдельные поля print_type и printing_mode.
        print_type = comp_in.get('print_type', 'color')
        printing_mode = comp_in.get('printing_mode', 'single')
        if print_type not in ('color', 'bw'):
            raise OrderCalculationError('print_type должен быть color или bw', 'invalid_print_type')
        if printing_mode not in ('single', 'duplex'):
            raise OrderCalculationError('printing_mode должен быть single или duplex', 'invalid_printing_mode')
        allowed = {
            ('color', 'single'): comp.allow_color_single,
            ('color', 'duplex'): comp.allow_color_duplex,
            ('bw', 'single'):    comp.allow_bw_single,
            ('bw', 'duplex'):    comp.allow_bw_duplex,
        }[(print_type, printing_mode)]

    if not allowed:
        raise OrderCalculationError(
            f'Комбинация печати "{print_type} / {printing_mode}" недоступна для этого компонента',
            'print_combo_not_allowed',
            {'print_type': print_type, 'printing_mode': printing_mode},
        )
    return print_type, printing_mode


# ============================================================================
# ПРОВЕРКА РАЗМЕРА
# ============================================================================

def _validate_size(comp, width_mm, height_mm):
    """Проверяет, что размеры в допустимом диапазоне компонента."""
    if width_mm < comp.min_width_mm or width_mm > comp.max_width_mm:
        raise OrderCalculationError(
            f'Ширина должна быть от {comp.min_width_mm} до {comp.max_width_mm} мм',
            'width_out_of_range',
            {'min': float(comp.min_width_mm), 'max': float(comp.max_width_mm), 'provided': float(width_mm)},
        )
    if height_mm < comp.min_height_mm or height_mm > comp.max_height_mm:
        raise OrderCalculationError(
            f'Высота должна быть от {comp.min_height_mm} до {comp.max_height_mm} мм',
            'height_out_of_range',
            {'min': float(comp.min_height_mm), 'max': float(comp.max_height_mm), 'provided': float(height_mm)},
        )


def _validate_lamination_side(comp, side):
    """Проверяет, что сторона ламинации разрешена."""
    if side == 'single' and not comp.allow_lamination_single:
        raise OrderCalculationError('Односторонняя ламинация недоступна', 'lamination_side_not_allowed')
    if side == 'duplex' and not comp.allow_lamination_duplex:
        raise OrderCalculationError('Двусторонняя ламинация недоступна', 'lamination_side_not_allowed')
    if side not in ('single', 'duplex'):
        raise OrderCalculationError('lamination_side должен быть single или duplex', 'invalid_lamination_side')


# ============================================================================
# ДОСТУП К РАЗРЕШЁННЫМ МАТЕРИАЛАМ И РАБОТАМ
# ============================================================================

def _get_allowed_paper(comp, paper_id):
    """Возвращает объект бумаги или бросает ошибку."""
    if not paper_id:
        raise OrderCalculationError('Не указана бумага', 'missing_paper')
    try:
        paper = Material.objects.get(id=paper_id)
    except Material.DoesNotExist:
        raise OrderCalculationError(f'Бумага с id={paper_id} не найдена', 'paper_not_found', {'paper_id': paper_id})
    if paper.type != 'paper':
        raise OrderCalculationError(f'Материал "{paper.name}" не является бумагой', 'bad_paper_type')
    # Проверяем, что материал привязан к компоненту (через новую модель papers).
    if not comp.papers.filter(material_id=paper.id).exists():
        raise OrderCalculationError(f'Бумага "{paper.name}" недоступна в этом калькуляторе', 'paper_not_allowed')
    return paper


def _get_allowed_film(comp, film_id):
    """Возвращает объект плёнки или бросает ошибку."""
    if not film_id:
        raise OrderCalculationError('Не указана плёнка для ламинации', 'missing_film')
    try:
        film = Material.objects.get(id=film_id)
    except Material.DoesNotExist:
        raise OrderCalculationError(f'Плёнка с id={film_id} не найдена', 'film_not_found', {'film_id': film_id})
    if film.type != 'film':
        raise OrderCalculationError(f'Материал "{film.name}" не является плёнкой', 'bad_film_type')
    # Проверяем, что материал привязан к компоненту (через новую модель films).
    if not comp.films.filter(material_id=film.id).exists():
        raise OrderCalculationError(f'Плёнка "{film.name}" недоступна в этом калькуляторе', 'film_not_allowed')
    return film


def _get_allowed_work(comp, work_id):
    """
    Возвращает объект работы или бросает ошибку.
    Проверяет, что работа привязана к компоненту (в модели
    WebCalculatorComponentWork) и что её trigger разрешает
    выбрать её вручную (то есть trigger == 'optional').
    Серверные работы (always, lamination) клиент выбирать не может.
    """
    try:
        work = Work.objects.get(id=work_id)
    except Work.DoesNotExist:
        raise OrderCalculationError(f'Работа с id={work_id} не найдена', 'work_not_found', {'work_id': work_id})
    if not comp.works.filter(work_id=work.id).exists():
        raise OrderCalculationError(f'Работа "{work.name}" недоступна в этом калькуляторе', 'work_not_allowed')
    return work


# ============================================================================
# РАСЧЁТ КОЛИЧЕСТВА ЛИСТОВ — ОДНОСТРАНИЧНЫЙ
# ============================================================================

def _calc_sheets_single(comp, width_mm, height_mm, circulation):
    """
    Возвращает (sheets_count, cuts_count) для одностраничного изделия.
    Использует существующий метод VichisliniyaListovModel в памяти.
    """
    printer = comp.printer
    if not printer:
        raise OrderCalculationError(
            f'У компонента "{comp.name}" не задан принтер',
            'no_printer',
        )
    if not printer.sheet_format:
        raise OrderCalculationError(
            f'У принтера "{printer.name}" не задан формат листа',
            'no_sheet_format',
        )

    vich = VichisliniyaListovModel()
    vich.vichisliniya_listov_item_width = width_mm
    vich.vichisliniya_listov_item_height = height_mm
    # Зазор берём из компонента веб-калькулятора.
    # Если поле не заполнено (например, для старых записей до миграции) — 4 мм.
    vich.vichisliniya_listov_vyleta = comp.vyleta_mm if comp.vyleta_mm is not None else 4
    vich.vichisliniya_listov_fit_selected_orientation = 'auto'
    # calculate_fitting обновит fit_horizontal/fit_vertical/fit_total/cuts_count.
    vich.calculate_fitting(
        printer.sheet_format.width_mm,
        printer.sheet_format.height_mm,
        printer.margin_mm,
    )
    # calculate_list_count вернёт количество листов и запишет его в поле.
    sheets = vich.vichisliniya_listov_calculate_list_count(circulation)
    return Decimal(sheets), vich.vichisliniya_listov_cuts_count


# ============================================================================
# РАСЧЁТ КОЛИЧЕСТВА ЛИСТОВ — МНОГОСТРАНИЧНЫЙ
# ============================================================================

def _calc_sheets_multipage(comp, width_mm, height_mm, total_pages,
                          booklet_orientation, circulation, printing_mode):
    """
    Возвращает (sheets_count, cuts_count) для многостраничного изделия
    (брошюры). Считает размещение страниц на листе прямо здесь, без записи в БД.
    """
    printer = comp.printer
    if not printer:
        raise OrderCalculationError(f'У компонента "{comp.name}" не задан принтер', 'no_printer')
    if not printer.sheet_format:
        raise OrderCalculationError(f'У принтера "{printer.name}" не задан формат листа', 'no_sheet_format')
    if not comp.binding:
        raise OrderCalculationError(
            f'У компонента "{comp.name}" не задан способ скрепления',
            'no_binding',
        )

    if total_pages is None:
        raise OrderCalculationError('Не указано количество страниц', 'missing_total_pages')
    try:
        total_pages_int = int(total_pages)
    except (ValueError, TypeError):
        raise OrderCalculationError('Количество страниц должно быть целым числом', 'invalid_total_pages')
    if total_pages_int < comp.min_pages or total_pages_int > comp.max_pages:
        raise OrderCalculationError(
            f'Количество страниц должно быть от {comp.min_pages} до {comp.max_pages}',
            'total_pages_out_of_range',
            {'min': comp.min_pages, 'max': comp.max_pages, 'provided': total_pages_int},
        )

    # Ориентация брошюры.
    if booklet_orientation not in ('portrait', 'landscape'):
        raise OrderCalculationError(
            'booklet_orientation должен быть portrait или landscape',
            'invalid_booklet_orientation',
        )
    if booklet_orientation == 'portrait' and not comp.allow_booklet_portrait:
        raise OrderCalculationError('Портретная ориентация недоступна', 'orientation_not_allowed')
    if booklet_orientation == 'landscape' and not comp.allow_booklet_landscape:
        raise OrderCalculationError('Альбомная ориентация недоступна', 'orientation_not_allowed')

    # Считаем fit_total (страниц на одной стороне листа).
    # Зазор берём из компонента веб-калькулятора.
    vyleta_mm = comp.vyleta_mm if comp.vyleta_mm is not None else 4
    fit_h, fit_v, fit_total = _calc_multipage_fitting(
        printer, comp.binding, width_mm, height_mm, booklet_orientation, vyleta_mm,
    )
    if fit_total <= 0:
        raise OrderCalculationError(
            'Страницы такого размера не помещаются на листе',
            'does_not_fit',
        )

    # Кратность страниц.
    adjusted_pages = total_pages_int
    if comp.binding.page_multiple > 0:
        m = comp.binding.page_multiple
        adjusted_pages = math.ceil(total_pages_int / m) * m

    # Эффективное количество страниц на физическом листе.
    effective_fit = fit_total * 2 if printing_mode == 'duplex' else fit_total

    # Количество физических листов.
    sheets = math.ceil(adjusted_pages * circulation / effective_fit)

    # cuts_count для многостраничного = 0 (резка страниц не считается).
    return Decimal(sheets), 0


def _calc_multipage_fitting(printer, binding, item_width, item_height, orientation, vyleta_mm):
    """
    Порт логики размещения страниц/разворотов на листе из JS
    (vichisliniya_listov_multipage.js).

    Аргументы:
        printer: экземпляр Printer.
        binding: экземпляр MultipageBinding (способ скрепления).
        item_width, item_height: размеры страницы, мм.
        orientation: 'portrait' или 'landscape'.
        vyleta_mm: зазор между страницами/разворотами, мм.

    Возвращает (fit_horizontal, fit_vertical, fit_total).
    fit_total — количество СТРАНИЦ на одной стороне листа.
    """
    printable_w = printer.sheet_format.width_mm - 2 * printer.margin_mm
    printable_h = printer.sheet_format.height_mm - 2 * printer.margin_mm
    # Зазор между изделиями — из параметра (задан в веб-калькуляторе).
    gap = vyleta_mm

    def count_items(available, item_size, gap):
        if item_size <= 0:
            return 0
        step = item_size + gap
        if step <= 0:
            return 0
        return int((available + gap) // step)

    # Является ли способ скрепления "скрепка" — тогда используются развороты.
    is_stapled = binding and binding.name and binding.name.lower() == 'скрепка'

    if is_stapled:
        # Размер разворота зависит от ориентации брошюры.
        if orientation == 'portrait':
            spread_w = item_width * 2
            spread_h = item_height
        else:
            spread_w = item_width
            spread_h = item_height * 2

        cx_land = count_items(printable_w, spread_w, gap)
        cy_land = count_items(printable_h, spread_h, gap)
        total_land = cx_land * cy_land

        cx_port = count_items(printable_w, spread_h, gap)
        cy_port = count_items(printable_h, spread_w, gap)
        total_port = cx_port * cy_port

        if total_land >= total_port:
            fit_h, fit_v, spreads = cx_land, cy_land, total_land
        else:
            fit_h, fit_v, spreads = cx_port, cy_port, total_port
        fit_total = spreads * 2  # страниц на одной стороне = разворотов × 2
    else:
        # Обычные страницы.
        cx_land = count_items(printable_w, item_width, gap)
        cy_land = count_items(printable_h, item_height, gap)
        total_land = cx_land * cy_land

        cx_port = count_items(printable_w, item_height, gap)
        cy_port = count_items(printable_h, item_width, gap)
        total_port = cx_port * cy_port

        if total_land >= total_port:
            fit_h, fit_v, fit_total = cx_land, cy_land, total_land
        else:
            fit_h, fit_v, fit_total = cx_port, cy_port, total_port

    return fit_h, fit_v, fit_total


# ============================================================================
# РАСЧЁТ ЛАМИНАЦИИ
# ============================================================================

def _calc_lamination(comp, side, film, sheets_count):
    """
    Возвращает стоимость ламинации для всего тиража.
    Создаёт Laminate в памяти и вызывает его recalculate_price.
    """
    lam = Laminate(
        is_enabled=True,
        side=side,
        laminator=comp.laminator,
        film=film,
    )
    lam.recalculate_price(Decimal(sheets_count))
    return lam.total_price


# ============================================================================
# РАСЧЁТ ДОПОЛНИТЕЛЬНОЙ РАБОТЫ
# ============================================================================

def _calc_work_cost(work, sheets_count, cuts_count, circulation, quantity=1):
    """
    Считает стоимость одной дополнительной работы БЕЗ создания объекта
    AdditionalWork. Это принципиально: модель AdditionalWork при расчёте
    формул типа 2/3 обращается к self.print_component, а у нас его нет
    (мы работаем без записи в БД). Поэтому расчёт делается напрямую,
    по тем же формулам, что и в AdditionalWork.recalculate_price.

    quantity — количество копий работы (по умолчанию 1).
    Возвращает Decimal — итоговую стоимость работы.
    """
    qty = quantity if quantity and quantity >= 1 else 1   # количество копий работы
    items = work.default_items_per_sheet or 1     # изделий на листе
    lines = work.default_lines_count or 1         # линий реза по умолчанию
    formula = work.formula_type                   # тип формулы (1–6)

    # --- Интерполированная себестоимость единицы работы ---
    if formula in (2, 3):
        # Формулы 2 и 3 используют интерполяцию по ТИРАЖУ.
        cost = calculate_price_for_work_by_circulation(work, circulation)
    else:
        # Остальные — по количеству ЛИСТОВ.
        cost = calculate_price_for_work(work, sheets_count)

    # --- Эффективная цена = себестоимость + наценка ---
    markup = work.markup_percent or Decimal('0')
    if markup > 0:
        effective_price = cost + (cost * markup / Decimal('100'))
    else:
        effective_price = cost

    # --- Итог по формулам (копия из AdditionalWork.recalculate_price) ---
    if formula == 1:
        # Фиксированная цена × количество.
        total = work.price * qty

    elif formula == 2:
        # Эффективная цена × тираж × количество.
        total = effective_price * circulation * qty

    elif formula == 3:
        # Логарифмическая надбавка за линии реза (по тиражу).
        k_lines = float(work.k_lines or 2.0)
        log_lines = math.log2(1 + lines) if lines > 0 else 0
        base_cost = (effective_price * circulation) / Decimal('6')
        surcharge = (Decimal(str(k_lines * log_lines)) * circulation) / Decimal('4')
        total = (base_cost + surcharge) * qty

    elif formula == 4:
        # Логарифмическая надбавка за линии реза (по листам).
        k_lines = float(work.k_lines or 2.0)
        log_lines = math.log2(1 + lines) if lines > 0 else 0
        base = effective_price * sheets_count
        surcharge = Decimal(str(k_lines * log_lines)) * sheets_count
        total = (base + surcharge) * qty

    elif formula == 5:
        # Эффективная цена × изделий на листе × листов × количество.
        total = effective_price * items * sheets_count * qty

    elif formula == 6:
        # Эффективная цена × изделий на листе × тираж × количество.
        total = effective_price * items * circulation * qty

    else:
        # Резервный вариант — как формула 1.
        total = work.price * qty

    return total.quantize(Decimal('0.01'))


# ============================================================================
# РАСЧЁТ МАССЫ И ОБЪЁМА
# ============================================================================

def _calc_mass_volume(paper, film, lamination_side, width_mm, height_mm, circulation):
    """
    Возвращает (mass_g, volume_cm3) по формулам из секции "Масса и объём".
    """
    # Площадь изделия в м².
    area_m2 = (width_mm * height_mm) / Decimal('1000000')

    # --- Бумага ---
    density = Decimal(str(getattr(paper, 'density', 0) or 0))
    if 0 < density < 100:
        density = density * 1000  # кг/м² → г/м²
    paper_thickness_mm = Decimal(str(getattr(paper, 'paper_thickness', 0) or 0))

    paper_mass = area_m2 * density * circulation  # г
    paper_volume = (width_mm * height_mm * paper_thickness_mm * circulation) / Decimal('1000')  # см³

    # --- Плёнка ---
    film_mass = Decimal('0.00')
    film_volume = Decimal('0.00')
    if film and lamination_side:
        film_thickness_um = Decimal(str(getattr(film, 'thickness', 0) or 0))
        side_mult = Decimal('2') if lamination_side == 'duplex' else Decimal('1')
        film_mass = area_m2 * circulation * film_thickness_um * Decimal('0.1') * side_mult
        film_volume = (width_mm * height_mm * film_thickness_um * circulation) / Decimal('1000000')

    return (paper_mass + film_mass), (paper_volume + film_volume)


# ============================================================================
# РАСЧЁТ РАЗМЕРА СТОПКИ
# ============================================================================

def _calc_stack(comp, paper, film, lamination_side, width_mm, height_mm, circulation):
    """
    Возвращает словарь со словами о стопке:
    {"label": "Обложка", "width_mm": ..., "height_mm": ..., "stack_height_mm": ...}
    """
    paper_thickness_mm = Decimal(str(getattr(paper, 'paper_thickness', 0) or 0))
    thickness_per_item = paper_thickness_mm

    if film and lamination_side:
        film_thickness_mm = Decimal(str(getattr(film, 'thickness', 0) or 0)) / Decimal('1000')
        side_mult = Decimal('2') if lamination_side == 'duplex' else Decimal('1')
        thickness_per_item += film_thickness_mm * side_mult

    if thickness_per_item <= 0:
        return {
            'label': comp.name,
            'width_mm': float(width_mm),
            'height_mm': float(height_mm),
            'stack_height_mm': 0.0,
        }

    return {
        'label': comp.name,
        'width_mm': float(width_mm),
        'height_mm': float(height_mm),
        'stack_height_mm': float(thickness_per_item * circulation),
    }


# ============================================================================
# ВСПОМОГАТЕЛЬНОЕ ПРЕОБРАЗОВАНИЕ
# ============================================================================

def _to_decimal(value, field_name):
    """Приводит значение к Decimal. Бросает ошибку, если не получилось."""
    if value is None:
        raise OrderCalculationError(f'Не указано поле "{field_name}"', 'missing_field', {'field': field_name})
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        raise OrderCalculationError(f'Поле "{field_name}" должно быть числом', 'invalid_field', {'field': field_name})



# ============================================================================
# ПУБЛИЧНЫЙ ВХОД: СОЗДАНИЕ ПРОСЧЁТА ИЗ ВЕБ-КАЛЬКУЛЯТОРА (для сотрудников)
# ============================================================================

@transaction.atomic
def create_proschet_from_webcalc(calculator, data, user=None):
    """
    Создаёт реальный просчёт (calculator.Proschet) со всеми вложенными
    объектами на основе данных от публичного калькулятора.

    В отличие от calculate_price — ПИШЕТ В БД. Используется только
    сотрудниками (is_staff) — по кнопке «Создать просчёт» в веб-калькуляторе.

    Аргументы:
        calculator — экземпляр WebCalculator.
        data       — словарь из JSON-запроса (формат как у calculate_price).
        user       — пользователь (пока не используется, оставлен для будущего).

    Возвращает:
        созданный экземпляр Proschet.

    Логика (по образцу create_proschet_from_template):
    1. Проверить тираж, разобрать параметры многостраничности.
    2. Создать Proschet.
    3. Для каждого компонента:
       a) валидировать печать, бумагу, размеры;
       b) создать PrintComponent;
       c) создать VichisliniyaListovModel и пересчитать размещение;
       d) при product_type='multipage' — VichisliniyaMultipageModel;
       e) Laminate — если ламинация включена;
       f) AdditionalWork — только для работ, влияющих на цену;
       g) финальный пересчёт цены компонента.
    """
    # --- 1. Тираж и общие параметры заказа ---
    circulation = _validate_circulation(calculator, data.get('circulation'))

    total_pages = data.get('total_pages')
    booklet_orientation = data.get('booklet_orientation')

    components_in = data.get('components') or []
    if not isinstance(components_in, list) or not components_in:
        raise OrderCalculationError(
            'Поле "components" обязательно и должно содержать хотя бы один компонент',
            'bad_request',
        )

    comps_by_id = {c.id: c for c in calculator.components.all()}
    provided_ids = set()

    # --- 2. Корневой просчёт ---
    # title = название калькулятора (например, «Простые визитки»).
    # source_template оставляем пустым — просчёт создан не из шаблона.
    proschet = Proschet.objects.create(
        title=calculator.name,
        circulation=circulation,
    )

    # --- 3. Перебираем компоненты из payload ---
    for comp_in in components_in:
        comp_id = comp_in.get('component_id')
        if comp_id not in comps_by_id:
            raise OrderCalculationError(
                f'Компонент id={comp_id} не относится к этому калькулятору',
                'unknown_component',
                {'component_id': comp_id},
            )
        if comp_id in provided_ids:
            raise OrderCalculationError(
                f'Компонент id={comp_id} передан дважды',
                'duplicate_component',
                {'component_id': comp_id},
            )
        provided_ids.add(comp_id)

        comp = comps_by_id[comp_id]

        # 3.1. Параметры печати (color/bw + single/duplex).
        print_type, printing_mode = _validate_print_combination(comp, comp_in)

        # 3.2. Бумага.
        paper = _get_allowed_paper(comp, comp_in.get('paper_id'))

        # 3.3. Размеры изделия.
        width_mm = _to_decimal(comp_in.get('width_mm'), 'width_mm')
        height_mm = _to_decimal(comp_in.get('height_mm'), 'height_mm')
        _validate_size(comp, width_mm, height_mm)

        # 3.4. Ламинация: валидируем ДО создания объектов, чтобы при ошибке
        # не оставлять мусор в БД (хотя @transaction.atomic всё равно откатит).
        lamination_on = bool(comp_in.get('lamination_enabled')) and comp.lamination_enabled
        lamination_side = None
        film = None
        if lamination_on:
            lamination_side = comp_in.get('lamination_side', 'single')
            _validate_lamination_side(comp, lamination_side)
            film = _get_allowed_film(comp, comp_in.get('film_id'))
            if not comp.laminator:
                raise OrderCalculationError(
                    f'У компонента "{comp.name}" не задан ламинатор',
                    'no_laminator',
                )

        # 3.5. Печатный компонент.
        component = PrintComponent.objects.create(
            proschet=proschet,
            printer=comp.printer,
            paper=paper,
            print_type=print_type,
            printing_mode=printing_mode,
        )

        # 3.6. Одностраничный расчёт листов.
        vich_data = VichisliniyaListovModel(
            vichisliniya_listov_print_component=component,
            vichisliniya_listov_vyleta=comp.vyleta_mm if comp.vyleta_mm is not None else 4,
            vichisliniya_listov_color='4+0',
            vichisliniya_listov_item_width=width_mm,
            vichisliniya_listov_item_height=height_mm,
            vichisliniya_listov_fit_selected_orientation='auto',
        )
        if component.printer and component.printer.sheet_format and component.printer.margin_mm is not None:
            vich_data.calculate_fitting(
                component.printer.sheet_format.width_mm,
                component.printer.sheet_format.height_mm,
                component.printer.margin_mm,
            )
        vich_data.vichisliniya_listov_calculate_list_count(circulation)
        vich_data.save()

        # 3.7. Многостраничный режим (только для multipage-калькуляторов).
        if calculator.product_type == 'multipage' and comp.binding:
            if total_pages is None:
                raise OrderCalculationError('Не указано количество страниц', 'missing_total_pages')
            try:
                total_pages_int = int(total_pages)
            except (ValueError, TypeError):
                raise OrderCalculationError('Количество страниц должно быть целым числом', 'invalid_total_pages')
            if total_pages_int < comp.min_pages or total_pages_int > comp.max_pages:
                raise OrderCalculationError(
                    f'Количество страниц должно быть от {comp.min_pages} до {comp.max_pages}',
                    'total_pages_out_of_range',
                    {'min': comp.min_pages, 'max': comp.max_pages, 'provided': total_pages_int},
                )
            if booklet_orientation not in ('portrait', 'landscape'):
                raise OrderCalculationError(
                    'booklet_orientation должен быть portrait или landscape',
                    'invalid_booklet_orientation',
                )
            if booklet_orientation == 'portrait' and not comp.allow_booklet_portrait:
                raise OrderCalculationError('Портретная ориентация недоступна', 'orientation_not_allowed')
            if booklet_orientation == 'landscape' and not comp.allow_booklet_landscape:
                raise OrderCalculationError('Альбомная ориентация недоступна', 'orientation_not_allowed')

            mp = VichisliniyaMultipageModel(
                print_component=component,
                binding=comp.binding,
                total_pages=total_pages_int,
                copies=circulation,
                finished_width=width_mm,
                finished_height=height_mm,
                vyleta=comp.vyleta_mm if comp.vyleta_mm is not None else 4,
                color='4+0',
                booklet_orientation=booklet_orientation,
                is_active=True,
            )
            mp.calculate_sheet_count()
            mp.save()

        # 3.8. Ламинация.
        if lamination_on:
            lamination = Laminate.objects.create(
                print_component=component,
                is_enabled=True,
                side=lamination_side,
                laminator=comp.laminator,
                film=film,
            )
            lamination.recalculate_price(component.get_sheet_count())
            lamination.save()

        # 3.9. Дополнительные работы.
        # Берём только те, которые влияют на цену:
        #   always     — всегда;
        #   lamination — если у компонента включена ламинация;
        #   optional   — если ID работы пришёл в work_ids.
        provided_work_ids = set(comp_in.get('work_ids') or [])
        provided_quantities = comp_in.get('work_quantities') or {}

        for cw in comp.works.all().select_related('work').order_by('order', 'id'):
            work = cw.work

            if cw.trigger == 'always':
                is_selected = True
            elif cw.trigger == 'lamination':
                is_selected = lamination_on
            else:  # 'optional' и любое неизвестное значение
                is_selected = work.id in provided_work_ids

            if not is_selected:
                continue

            # Количество работы: если флаг show_quantity — берём из payload,
            # иначе по умолчанию 1.
            work_qty = 1
            if cw.show_quantity:
                raw = provided_quantities.get(str(work.id))
                if raw is not None:
                    try:
                        work_qty = max(1, int(raw))
                    except (ValueError, TypeError):
                        work_qty = 1

            # AdditionalWork.save() сам подставит title, cost, markup_percent,
            # price, formula_type, lines_count, items_per_sheet из work
            # и пересчитает total_price.
            AdditionalWork.objects.create(
                print_component=component,
                work=work,
                quantity=work_qty,
            )

        # 3.10. Финальный пересчёт цены компонента — когда уже созданы
        # все вложенные объекты (листы, ламинация, работы).
        component.recalculate_price()

    # --- 4. Проверка, что пришли все компоненты калькулятора ---
    missing = set(comps_by_id.keys()) - provided_ids
    if missing:
        names = ', '.join(comps_by_id[i].name for i in missing)
        raise OrderCalculationError(
            f'Не указаны обязательные компоненты: {names}',
            'missing_components',
            {'missing_ids': list(missing)},
        )

    return proschet


# ============================================================================
# СБОРКА ТОВАРА ДЛЯ MOGUTA (bukva-a.ru)
# ============================================================================

def build_product_for_webcalc(calculator, payload, price, mass_g=None):
    """
    Собирает словарь товара для Moguta API на основе параметров,
    выбранных в веб-калькуляторе.

    Аргументы:
        calculator — экземпляр WebCalculator.
        payload    — dict параметров от клиента (как в calculate_price).
        price      — итоговая цена за весь тираж (число).
        mass_g     — общая масса заказа в граммах (опционально).

    Возвращает:
        dict, готовый для передачи в MogutaClient.import_product().

    Логика:
      - title — «{название калькулятора}, {размер}, {тираж} шт., {печать}, {бумага}».
      - code — уникальный артикул CALC-<slug>-<timestamp>.
      - price — цена за весь тираж (count будет -1, т.к. это не штучный товар).
      - count — «-1» (в Moguta это значит «неограниченно»).
      - cat_id — id категории «Калькулятор онлайн» из настроек.
      - description — читаемый HTML со всеми параметрами заказа.
      - weight — масса в кг (граммы / 1000).
    """
    import time
    from django.conf import settings
    from sklad.models import Material

    circulation = int(payload.get('circulation', 0))
    components_in = payload.get('components') or []
    comps_by_id = {c.id: c for c in calculator.components.all()}

    # ---------------------------------------------------------------
    # Расшифровка комбинации печати — словарь, чтобы не повторяться.
    # ---------------------------------------------------------------
    combo_texts = {
        'color_single': 'цветная односторонняя',
        'color_duplex': 'цветная двусторонняя',
        'bw_single':    'ч/б односторонняя',
        'bw_duplex':    'ч/б двусторонняя',
    }

    # ---------------------------------------------------------------
    # 1. Собираем название товара по первому компоненту.
    # ---------------------------------------------------------------
    first_data = components_in[0] if components_in else {}
    first_comp = comps_by_id.get(first_data.get('component_id'))

    title_parts = [calculator.name]
    if first_comp:
        w = first_data.get('width_mm')
        h = first_data.get('height_mm')
        if w and h:
            # Округляем до целых — размеры в мм не нужны с копейками.
            title_parts.append(f"{int(round(float(w)))}×{int(round(float(h)))} мм")
    title_parts.append(f"{circulation} шт.")

    combo = first_data.get('print_combo')
    if combo and combo in combo_texts:
        title_parts.append(combo_texts[combo])

    if first_data.get('paper_id'):
        try:
            paper = Material.objects.get(id=first_data['paper_id'])
            title_parts.append(paper.name)
        except Material.DoesNotExist:
            pass

    title = ', '.join(title_parts)

    # ---------------------------------------------------------------
    # 2. Собираем HTML-описание со всеми параметрами.
    # ---------------------------------------------------------------
    lines = [f'<h3>{title}</h3>', '<ul>']

    for comp_in in components_in:
        comp = comps_by_id.get(comp_in.get('component_id'))
        if not comp:
            continue

        w = comp_in.get('width_mm')
        h = comp_in.get('height_mm')
        combo = comp_in.get('print_combo', '')
        combo_text = combo_texts.get(combo, combo)

        # Если компонентов больше одного — показываем имя компонента.
        if len(components_in) > 1:
            lines.append(f'<li><b>Компонент:</b> {comp.name}</li>')

        if w and h:
            lines.append(f'<li><b>Размер:</b> {w} × {h} мм</li>')
        if combo_text:
            lines.append(f'<li><b>Печать:</b> {combo_text}</li>')

        # Бумага
        if comp_in.get('paper_id'):
            try:
                paper = Material.objects.get(id=comp_in['paper_id'])
                lines.append(f'<li><b>Бумага:</b> {paper.name}</li>')
            except Material.DoesNotExist:
                pass

        # Ламинация
        if comp_in.get('lamination_enabled') and comp.lamination_enabled:
            side = comp_in.get('lamination_side', 'single')
            side_text = 'односторонняя' if side == 'single' else 'двусторонняя'
            film_name = ''
            if comp_in.get('film_id'):
                try:
                    film = Material.objects.get(id=comp_in['film_id'])
                    film_name = film.name
                except Material.DoesNotExist:
                    pass
            laminator_name = comp.laminator.name if comp.laminator else '—'
            lines.append(
                f'<li><b>Ламинация:</b> {laminator_name}, {film_name}, {side_text}</li>'
            )

        # Дополнительные работы (учитывая триггеры)
        work_ids = comp_in.get('work_ids') or []
        work_quantities = comp_in.get('work_quantities') or {}
        for cw in comp.works.all().select_related('work'):
            work = cw.work
            is_on = (
                cw.trigger == 'always'
                or (cw.trigger == 'lamination' and comp_in.get('lamination_enabled'))
                or (cw.trigger == 'optional' and work.id in work_ids)
            )
            if not is_on:
                continue
            qty = int(work_quantities.get(str(work.id), 1))
            lines.append(f'<li><b>Работа:</b> {work.name} × {qty}</li>')

    lines.append('</ul>')
    lines.append(f'<p><b>Итоговая цена:</b> {price:.2f} ₽</p>')
    description = '\n'.join(lines)

    # ---------------------------------------------------------------
    # 3. Короткое описание и артикул.
    # ---------------------------------------------------------------
    short_description = f'{title}. Цена: {price:.2f} ₽'
    code = f'CALC-{calculator.slug}-{int(time.time())}'

    # ---------------------------------------------------------------
    # 4. Вес — переводим граммы в килограммы.
    # ---------------------------------------------------------------
    weight_kg = 0.0
    if mass_g:
        weight_kg = round(float(mass_g) / 1000.0, 3)

    # ---------------------------------------------------------------
    # 4.5. Характеристики товара для отображения под названием в корзине.
    # Moguta при добавлении товара в корзину автоматически подтягивает
    # характеристики из товара и выводит их как property_html.
    # Передаём только то, что не видно из названия.
    # ---------------------------------------------------------------
    properties_list = []

    # Имя компонента как префикс — только если компонентов больше одного.
    def _pname(comp_name):
        return f'{comp_name}: ' if len(components_in) > 1 else ''

    for comp_in in components_in:
        comp = comps_by_id.get(comp_in.get('component_id'))
        if not comp:
            continue
        prefix = _pname(comp.name)

        # Размер
        w = comp_in.get('width_mm')
        h = comp_in.get('height_mm')
        if w and h:
            properties_list.append({
                'name':  f'{prefix}Размер',
                'type':  'string',
                'value': f'{int(round(float(w)))} × {int(round(float(h)))} мм',
            })

        # Тираж
        properties_list.append({
            'name':  f'{prefix}Тираж',
            'type':  'string',
            'value': f'{circulation} шт.',
        })

        # Печать
        combo = comp_in.get('print_combo')
        if combo and combo in combo_texts:
            properties_list.append({
                'name':  f'{prefix}Печать',
                'type':  'string',
                'value': combo_texts[combo].capitalize(),
            })

        # Бумага
        if comp_in.get('paper_id'):
            try:
                paper = Material.objects.get(id=comp_in['paper_id'])
                properties_list.append({
                    'name':  f'{prefix}Бумага',
                    'type':  'string',
                    'value': paper.name,
                })
            except Material.DoesNotExist:
                pass

        # Ламинация — только если включена
        if comp_in.get('lamination_enabled') and comp.lamination_enabled:
            side = comp_in.get('lamination_side', 'single')
            side_text = 'односторонняя' if side == 'single' else 'двусторонняя'
            film_name = ''
            if comp_in.get('film_id'):
                try:
                    film = Material.objects.get(id=comp_in['film_id'])
                    film_name = film.name
                except Material.DoesNotExist:
                    pass
            laminator_name = comp.laminator.name if comp.laminator else ''
            parts = [p for p in [film_name, laminator_name, side_text] if p]
            properties_list.append({
                'name':  f'{prefix}Ламинация',
                'type':  'string',
                'value': ', '.join(parts),
            })

        # Дополнительные работы — ищем «Скругление углов» и «Обработка макета»
        work_ids = comp_in.get('work_ids') or []
        work_quantities = comp_in.get('work_quantities') or {}
        for cw in comp.works.all().select_related('work'):
            work = cw.work
            is_on = (
                cw.trigger == 'always'
                or (cw.trigger == 'lamination' and comp_in.get('lamination_enabled'))
                or (cw.trigger == 'optional' and work.id in work_ids)
            )
            if not is_on:
                continue

            # Скругление углов — только отметка «да», без значения, если не включено.
            if work.name == 'Скругление углов':
                properties_list.append({
                    'name':  f'{prefix}Скругление углов',
                    'type':  'string',
                    'value': 'да',
                })

            # Количество макетов — из работ с флагом show_quantity.
            if cw.show_quantity:
                qty = int(work_quantities.get(str(work.id), 1))
                properties_list.append({
                    'name':  f'{prefix}Количество макетов',
                    'type':  'string',
                    'value': f'{qty} шт.',
                })

    # Вес — общий для всего заказа.
    if mass_g:
        properties_list.append({
            'name':  'Вес',
            'type':  'string',
            'value': f'{int(round(float(mass_g)))} г',
        })

    # Объём — общий, если посчитан. Ищем его в результате calculate_price?
    # Пока пропускаем, потому что volume_cm3 не передаётся в build_product_for_webcalc.
    # Если нужно — допишем позже.


    # ---------------------------------------------------------------
    # 5. Итоговый словарь для Moguta API.
    # ---------------------------------------------------------------
    return {
        'title':             title[:200],
        'code':              code,
        'price':             f'{price:.2f}',
        # price_course — цена в основной валюте магазина. Moguta использует
        # именно это поле при добавлении товара в корзину. Если передать только
        # price, корзина покажет 0 руб. Значение совпадает с price, потому что
        # валюта товара = валюта магазина (RUR).
        'price_course':      f'{price:.2f}',
        'count':             -1,
        'cat_id':            settings.MOGUTA_CATEGORY_ID,
        'description':       description,
        'short_description': short_description,
        'weight':            weight_kg,
        'activity':          1,
        'unit':              'шт.',
        'currency_iso':      'RUR',
        'property':          properties_list,
    }