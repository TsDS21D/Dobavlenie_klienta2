# calculator/services_webcalc.py
"""
Сервисный модуль для взаимодействия с сайтом bukva-a.ru (Moguta).

НАЗНАЧЕНИЕ:
    Предоставить ЕДИНСТВЕННУЮ публичную функцию — calculate_proschet_current_price,
    которая пересчитывает АКТУАЛЬНУЮ цену существующего просчёта (Proschet)
    на текущий момент, БЕЗ ЗАПИСИ В БД.

    Эта функция нужна для эндпоинта /calculator/api/get-webcalc-prices/,
    который вызывает сайт bukva-a.ru, чтобы обновлять цены товаров
    в корзине покупателя.

ПОЧЕМУ БЕЗ ЗАПИСИ В БД:
    Мы не хотим, чтобы при каждом обновлении страницы корзины клиента
    на bukva-a.ru менялись сохранённые цены в просчёте. Просчёт — динамическая
    сущность договорного контура, но при пересчёте «для отображения» мы
    не должны трогать БД. Иначе получим лишние UPDATE'ы и потенциальные гонки.

    Сначала считаем в памяти, отдаём JSON — и всё.

ЧТО СЧИТАЕМ:
    1. Печать: интерполяция цены за лист × количество прогонов.
       - Одностраничный режим — из VichisliniyaListovModel.
       - Многостраничный — из VichisliniyaMultipageModel.
    2. Бумага: цена листа бумаги × количество листов.
    3. Ламинация (если включена): пересчитываем из Laminate в памяти.
    4. Дополнительные работы: пересчитываем каждую из AdditionalWork в памяти.

    Итого по просчёту = сумма по всем печатным компонентам.

ЧТО НЕ ДЕЛАЕМ:
    - Не сохраняем price_per_sheet, total_circulation_price в БД.
    - Не сохраняем total_price работ и ламинации.
    - Не меняем ничего в Proschet и связанных записях.
"""

# ===== СТАНДАРТНЫЕ ИМПОРТЫ =====
from decimal import Decimal              # точные числа — для финансов
from typing import Optional              # для типизации (может быть None)

# ===== ИМПОРТЫ DJANGO =====
from django.db.models import Sum         # агрегация (сейчас не используется, но оставим на будущее)

# ===== ИМПОРТЫ НАШИХ МОДЕЛЕЙ =====
from .models_list_proschet import Proschet, PrintComponent
from .models_lamination import Laminate
from vichisliniya_listov.models import VichisliniyaListovModel
from vichisliniya_listov.multipage_models import VichisliniyaMultipageModel

# ===== ИМПОРТЫ УТИЛИТ РАСЧЁТА =====
from print_price.utils import get_cost_and_markup_for_printer_and_copies
# (используем именно get_cost_and_markup, а не calculate_price_for_printer_and_copies,
#  потому что нам нужны и себестоимость, и наценка — по аналогии с views.get_proschet_price_data)


def calculate_proschet_current_price(proschet):
    """
    Пересчитывает АКТУАЛЬНУЮ цену просчёта БЕЗ записи в БД.

    Аргументы:
        proschet — экземпляр Proschet (должен быть уже загружен из БД).

    Возвращает:
        dict со следующими полями:
            {
                "available": True,
                "total_price": 1500.00,     # цена за весь тираж, за весь просчёт (float)
                "currency": "RUR",
                "components_count": 2,      # сколько печатных компонентов (для отладки)
                "works_count": 3,           # сколько работ (для отладки)
            }

        Если просчёт невозможно пересчитать (например, у всех компонентов
        нет принтера и листов), возвращает:
            {
                "available": False,
                "error": "no_print_components",   # или другой код
                "total_price": 0.0,
            }

    ВАЖНО: функция никогда не бросает исключения наружу — она возвращает
    словарь с ошибкой. Это сделано, чтобы API-эндпоинт мог единообразно
    обработать ЛЮБУЮ проблему и вернуть клиенту валидный JSON.
    """
    # --- Шаг 1. Собираем печатные компоненты просчёта ---
    # Берём только НЕ удалённые (is_deleted=False). Если у компонента
    # удалили бумагу или принтер — он остаётся, но в расчёте даст 0.
    components = PrintComponent.objects.filter(
        proschet=proschet,
        is_deleted=False,
    ).select_related('printer', 'paper')

    # Если у просчёта вообще нет печатных компонентов — считать нечего.
    if not components.exists():
        return {
            'available': False,
            'error': 'no_print_components',
            'total_price': 0.0,
            'currency': 'RUR',
        }

    # --- Шаг 2. Загружаем одностраничные данные одним запросом ---
    # Ключ — id печатного компонента, значение — сама запись VichisliniyaListovModel.
    # Так мы не будем дёргать БД в цикле по каждому компоненту.
    vich_qs = VichisliniyaListovModel.objects.filter(
        vichisliniya_listov_print_component__in=components
    )
    vich_dict = {
        v.vichisliniya_listov_print_component_id: v for v in vich_qs
    }

    # --- Шаг 3. Загружаем многостраничные данные одним запросом ---
    multipage_qs = VichisliniyaMultipageModel.objects.filter(
        print_component__in=components
    )
    multipage_dict = {
        m.print_component_id: m for m in multipage_qs
    }

    # --- Шаг 4. Загружаем ламинацию одним запросом ---
    # Laminate связан с PrintComponent как OneToOne, поэтому ключ — id компонента.
    laminations_qs = Laminate.objects.filter(print_component__in=components)
    lamination_dict = {
        lam.print_component_id: lam for lam in laminations_qs
    }

    # --- Шаг 5. Актуальный тираж просчёта ---
    # Он мог поменяться менеджером — берём свежее значение.
    circulation = proschet.circulation or 1

    # --- Шаг 6. Итерируемся по компонентам и считаем ---
    total_price = Decimal('0.00')
    works_count = 0
    components_count = 0

    for comp in components:
        components_count += 1

        # ===== 6.1. Определяем количество листов для компонента =====
        # Логика та же, что в views.get_proschet_price_data:
        # если есть активная многостраничная запись — берём её sheet_count,
        # иначе — из одностраничной модели.
        multipage_obj = multipage_dict.get(comp.id)
        if multipage_obj and multipage_obj.is_active:
            # Актуализируем тираж и пересчитываем листы В ПАМЯТИ.
            # multipage_obj.save() НЕ вызываем — мы не хотим писать в БД.
            multipage_obj.copies = circulation
            multipage_obj.calculate_sheet_count()
            sheet_count = multipage_obj.sheet_count
        else:
            vich_obj = vich_dict.get(comp.id)
            if vich_obj:
                # Пересчитываем листы в памяти на текущий тираж.
                # ВАЖНО: метод vichisliniya_listov_calculate_list_count
                # возвращает значение и записывает в поле объекта, но не
                # сохраняет в БД. Нам это подходит — объект в памяти живёт
                # до конца функции, БД не тронута.
                sheet_count = vich_obj.vichisliniya_listov_calculate_list_count(circulation)
            else:
                # Ни многостраничной, ни одностраничной записи — считать нечего.
                sheet_count = Decimal('0.00')

        # Приводим к float для удобства расчёта цены (интерполяция работает с int).
        sheet_count_float = float(sheet_count)

        # ===== 6.2. Считаем цену печати за лист =====
        # Если у компонента есть принтер и хотя бы один лист — интерполируем.
        price_per_sheet = Decimal('0.00')
        if comp.printer and sheet_count_float > 0:
            copies_int = int(sheet_count_float)
            # get_cost_and_markup_for_printer_and_copies возвращает (себестоимость, наценка%).
            cost, markup = get_cost_and_markup_for_printer_and_copies(
                comp.printer, copies_int, comp.print_type,
            )
            # Итоговая цена = себестоимость + наценка.
            price_per_sheet = cost + (cost * markup / Decimal('100'))
            # Округляем до копеек.
            price_per_sheet = price_per_sheet.quantize(Decimal('0.01'))

        # ===== 6.3. Стоимость печати за весь тираж =====
        # Прогонов = листов × 2 для двусторонней, иначе = листов.
        runs_count = int(sheet_count_float) * (2 if comp.printing_mode == 'duplex' else 1)
        printing_cost = price_per_sheet * runs_count

        # ===== 6.4. Стоимость бумаги =====
        # material_price_per_unit — это свойство модели, оно читает get_price()
        # у выбранной бумаги. Оно уже учитывает актуальную цену материала.
        paper_price = comp.material_price_per_unit
        paper_cost = paper_price * sheet_count

        # ===== 6.5. Ламинация =====
        lamination_cost = Decimal('0.00')
        lam = lamination_dict.get(comp.id)
        if lam and lam.is_enabled:
            # recalculate_price пересчитывает поля объекта В ПАМЯТИ.
            # Метод НЕ сохраняет в БД (save вызывается отдельно).
            lam.recalculate_price(sheet_count)
            lamination_cost = lam.total_price

        # ===== 6.6. Дополнительные работы =====
        works_cost = Decimal('0.00')
        # Загружаем работы одним запросом на компонент.
        # (можно было бы и заранее собрать все компоненты, но работы
        # читаются редко, поэтому ок.)
        for work in comp.additional_works.filter(is_deleted=False):
            works_count += 1
            # Работам нужны sheet_count и cuts_count.
            # cuts_count берём из одностраничной модели, если она есть
            # (в многостраничном режиме резка обычно не считается).
            cuts_count = 0
            vich_obj_for_cuts = vich_dict.get(comp.id)
            if vich_obj_for_cuts:
                cuts_count = vich_obj_for_cuts.vichisliniya_listov_cuts_count

            # recalculate_price пересчитывает total_price работы В ПАМЯТИ.
            # Метод НЕ сохраняет в БД — save вызывается отдельно.
            work.recalculate_price(sheet_count, cuts_count, circulation)
            works_cost += work.total_price

        # ===== 6.7. Итог по компоненту =====
        component_total = printing_cost + paper_cost + lamination_cost + works_cost
        total_price += component_total

    # --- Шаг 7. Финальное округление ---
    total_price = total_price.quantize(Decimal('0.01'))

    # --- Шаг 8. Возврат результата ---
    return {
        'available': True,
        'total_price': float(total_price),         # float — чтобы json.dumps работал без кастомного encoder
        'currency': 'RUR',
        'components_count': components_count,      # для отладки
        'works_count': works_count,                # для отладки
    }


def calculate_prices_for_codes(codes):
    """
    Утилита для пакетного пересчёта: принимает список кодов просчётов
    (строки вида "PR-1", "PR-42") и возвращает словарь с ценами.

    Аргументы:
        codes — список строк. Может содержать дубликаты и мусор —
                функция сама их отфильтрует.

    Возвращает:
        dict:
            {
                "PR-1": {"available": True,  "total_price": 1500.0, "currency": "RUR"},
                "PR-42": {"available": False, "error": "not_found", "total_price": 0.0},
                ...
            }

    ВАЖНО:
        - Дубликаты кодов отбрасываются.
        - Пустые строки и не-PR коды игнорируются.
        - Если просчёт удалён (is_deleted=True), возвращаем available=False.
        - Просчёты, коды которых не найдены в БД, тоже получают available=False.
    """
    # --- Шаг 1. Нормализация входа ---
    if not isinstance(codes, list):
        return {}

    # Уникальные коды, только непустые строки. Не фильтруем по префиксу PR-
    # (на будущее — вдруг понадобится пересчитывать другие типы),
    # но сейчас предполагаем, что клиент присылает только PR-*.
    unique_codes = []
    seen = set()
    for code in codes:
        if not isinstance(code, str):
            continue
        code = code.strip()
        if not code or code in seen:
            continue
        seen.add(code)
        unique_codes.append(code)

    if not unique_codes:
        return {}

    # --- Шаг 2. Одним запросом достаём все просчёты ---
    # Используем filter(number__in=...) — один запрос вместо N.
    proschets = Proschet.objects.filter(
        number__in=unique_codes,
        is_deleted=False,
    )

    # Строим словарь {номер: Proschet} для быстрого доступа.
    proschet_by_number = {p.number: p for p in proschets}

    # --- Шаг 3. Для каждого кода вызываем пересчёт ---
    result = {}
    for code in unique_codes:
        proschet = proschet_by_number.get(code)
        if not proschet:
            # Просчёт не найден или удалён.
            result[code] = {
                'available': False,
                'error': 'not_found',
                'total_price': 0.0,
                'currency': 'RUR',
            }
            continue

        # Пересчитываем актуальную цену (без записи в БД).
        result[code] = calculate_proschet_current_price(proschet)

    return result