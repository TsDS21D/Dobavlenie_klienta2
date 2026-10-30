# orders/services.py
"""
Сервисный слой приложения "orders" (Заказы и изделия).

Здесь живут функции бизнес-логики, не привязанные к HTTP-запросам.

СОСТАВ (по мере наполнения):
- create_order_from_proschet  — создать новый заказ из просчёта
                                (создать Order + Product-копию со всей структурой).
- add_product_to_order        — добавить копию просчёта в существующий заказ.
- create_proschet_from_product — создать новый просчёт из изделия
                                (цена пересчитается на актуальные справочники).

На этом шаге реализована только первая функция — create_order_from_proschet.
Остальные добавим отдельными шагами.
"""

# ===== СТАНДАРТНЫЕ ИМПОРТЫ =====
from decimal import Decimal                              # Точные десятичные числа

# ===== ИМПОРТЫ DJANGO =====
from django.db import transaction                        # Атомарность (всё или ничего)
from django.db.models import Max                         # Max — для «max(position) + 1» при добавлении изделия

# ===== ИМПОРТЫ МОДЕЛЕЙ-ОРИГИНАЛОВ ИЗ calculator =====
from calculator.models_list_proschet import (               # Модели просчёта
    Proschet,                                                # Просчёт — корневой объект
    PrintComponent,                                          # Печатный компонент
    AdditionalWork,                                          # Дополнительная работа
)
from calculator.models_lamination import Laminate            # Ламинация

# ===== ИМПОРТЫ МОДЕЛЕЙ ИЗ vichisliniya_listov =====
from vichisliniya_listov.models import VichisliniyaListovModel       # Одностраничный расчёт
from vichisliniya_listov.multipage_models import VichisliniyaMultipageModel  # Многостраничный расчёт

# ===== ИМПОРТЫ НАШИХ МОДЕЛЕЙ =====
from .models import (
    Order,
    Product,
    ProductPrintComponent,
    ProductAdditionalWork,
    ProductLaminate,
    ProductVichisliniya,
    ProductMultipage,
)

import math
from decimal import Decimal

def _calculate_final_prices(proschet, discount_percent=None, base_total=None):
    """
    Вспомогательная функция. 
    1. Считает скидку.
    2. Вычисляет цену за 1 шт., округляя её ВВЕРХ до копеек.
    3. Умножает цену за штуку на тираж, чтобы получить точную сумму к оплате.
    
    Аргументы:
        proschet         — просчёт, из которого берём circulation и base_total.
        discount_percent — необязательный процент скидки (число: int/float/Decimal).
        base_total       — необязательная базовая сумма (без скидки). Если передана,
                           используется вместо proschet.total_price (который может
                           включать удалённые компоненты).
    """
    circulation = proschet.circulation or 1
    
    if discount_percent is not None:
        discount = float(discount_percent)
    elif proschet.client and proschet.client.discount:
        discount = float(proschet.client.discount)
    else:
        discount = 0
        
    multiplier = Decimal(str(1 - (discount / 100.0)))
    
    # Если базовая сумма передана явно (только по активным элементам) — используем её.
    # Иначе берём proschet.total_price (для обратной совместимости).
    if base_total is None:
        base_total = Decimal(str(proschet.total_price))
    else:
        base_total = Decimal(str(base_total))
        
    discounted_total = base_total * multiplier
    
    # Округляем цену за штуку ВВЕРХ до 2 знаков (например, 110.60784 -> 110.61)
    unit_price_float = math.ceil((float(discounted_total) / circulation) * 100) / 100
    unit_price = Decimal(str(unit_price_float))
    
    # Итоговая сумма = цена за шт * тираж
    final_total_price = (unit_price * circulation).quantize(Decimal('0.01'))
    
    return final_total_price, multiplier


def _get_active_base_total(proschet):
    """
    Вспомогательная функция.
    Считает базовую сумму просчёта (без скидки), проходя ТОЛЬКО по
    активным (is_deleted=False) компонентам, работам и ламинации.
    
    Логика полностью повторяет расчет из calculator/views.py::get_proschet_price_data,
    чтобы цена в заказе совпадала с ценой на экране просчёта.
    """
    base_total = Decimal('0.00')
    
    # Берем только неудаленные печатные компоненты
    for comp in proschet.print_components.filter(is_deleted=False):
        
        # 1. Стоимость печати компонента (total_circulation_price уже включает 
        # в себя и стоимость печати, и стоимость бумаги)
        base_total += (comp.total_circulation_price or Decimal('0.00'))
        
        # 2. Дополнительные работы (только неудаленные)
        for work in comp.additional_works.filter(is_deleted=False):
            base_total += (work.total_price or Decimal('0.00'))
            
        # 3. Ламинация (если объект существует и включен)
        try:
            lam = comp.lamination
            if lam and lam.is_enabled:
                base_total += (lam.total_price or Decimal('0.00'))
        except Exception:
            pass
            
    return base_total


# ============================================================================
# ФУНКЦИЯ 1: СОЗДАТЬ ЗАКАЗ ИЗ ПРОСЧЁТА
# ============================================================================

@transaction.atomic
def create_order_from_proschet(proschet, comment='', created_by=None):
    """
    Создаёт НОВЫЙ заказ на основе просчёта.

    Аргументы:
        proschet    — экземпляр calculator.Proschet (что копируем).
        comment     — комментарий к заказу (необязательный, по умолчанию пустой).
        created_by  — пользователь, создающий заказ (FK на AUTH_USER_MODEL).

    Возвращает:
        (order, product) — кортеж: созданный Order и созданный Product.

    Логика по шагам:
        1. Создаём Order. Клиент берём из просчёта (там он уже есть).
        2. Создаём Product — изделие-копию с замороженной ценой.
        3. Проходим по всем не удалённым печатным компонентам просчёта:
           3a. Копируем PrintComponent в ProductPrintComponent
               (с замороженными sheet_count, runs_count, material_price).
           3b. Копируем VichisliniyaListovModel → ProductVichisliniya.
           3c. Если многостраничный режим был активен — копируем
               VichisliniyaMultipageModel → ProductMultipage.
           3d. Если ламинация есть — копируем Laminate → ProductLaminate.
           3c. Копируем все не удалённые AdditionalWork → ProductAdditionalWork.
        4. Возвращаем (order, product).

    ВАЖНО:
        Вся функция обёрнута в @transaction.atomic: если на любом шаге
        возникнет ошибка, все созданные объекты откатятся, и в БД не
        останется «полузаказа».
    """

    # --- Шаг 1. Создаём заказ ---
    # Клиент НЕобязателен. Если у просчёта он указан — переносим.
    # Если нет — создаём заказ без клиента (пользователь потом сможет
    # указать клиента прямо в карточке заказа).
    order = Order.objects.create(
        client=proschet.client,                    # Клиент из просчёта (может быть None)
        comment=comment or '',                     # Комментарий (может быть пустым)
        created_by=created_by,                     # Кто создал заказ
        # number сгенерируется автоматически в Order.save()
    )

    # --- Шаг 2. Создаём изделие (копию просчёта) ---
    # total_price берём у просчёта на текущий момент — он станет «замороженным».
    # Применяем скидку, если она есть у клиента
    discount = proschet.client.discount if proschet.client and proschet.client.discount else 0
    multiplier = 1 - (float(discount) / 100.0) if discount > 0 else 1.0
    
    # Рассчитываем базовую сумму только по активным элементам (без удалённого мусора)
    active_base_total = _get_active_base_total(proschet)
    frozen_total_price, multiplier = _calculate_final_prices(proschet, base_total=active_base_total)

    product = Product.objects.create(
        order=order,
        source_proschet=proschet,
        source_template=proschet.source_template,
        title=proschet.title,
        circulation=proschet.circulation or 1,
        # Порядковый номер внутри заказа.
        # create_order_from_proschet всегда создаёт НОВЫЙ заказ
        # (см. блок «Шаг 1. Создаём заказ» выше), а у нового заказа
        # ещё нет изделий. Значит, это изделие — первое, position=1.
        # Хардкод «1» здесь корректнее, чем SELECT max(): не нужен
        # лишний запрос к БД на каждый вызов.
        position=1,
        total_price=frozen_total_price,
    )

    # --- Шаг 3. Проходим по всем не удалённым печатным компонентам ---
    # order_by('created_at') — чтобы сохранить исходный порядок.
    for position, comp in enumerate(
        proschet.print_components.filter(is_deleted=False).order_by('created_at'),
        start=1
    ):
        # ===== 3a. Копируем сам печатный компонент =====
        # ВАЖНО: sheet_count, runs_count, material_price в оригинале — это
        # СВОЙСТВА (пересчитываются каждый раз). Здесь мы их «схватываем»
        # и сохраняем в поля — так фиксируется состояние на момент создания.

        # sheet_count получаем через метод get_sheet_count() (учитывает
        # многостраничный режим, если он активен).
        frozen_sheet_count = comp.get_sheet_count()

        # runs_count — это свойство модели, возвращает int.
        frozen_runs_count = comp.runs_count

        # material_price_per_unit — свойство, возвращает Decimal
        # (цена бумаги за лист из справочника на текущий момент).
        frozen_material_price = comp.material_price_per_unit

        # Снимок плотности и толщины бумаги — для расчёта массы/объёма
        # в карточке изделия. Если бумага не выбрана — сохраняем нули.
        frozen_paper_density = Decimal('0.00')
        frozen_paper_thickness = Decimal('0.0000')
        if comp.paper:
            if comp.paper.density is not None:
                frozen_paper_density = Decimal(str(comp.paper.density))
            if comp.paper.paper_thickness is not None:
                frozen_paper_thickness = Decimal(str(comp.paper.paper_thickness))

        product_component = ProductPrintComponent.objects.create(
            product=product,
            position=position,
            number=comp.number or '',
            printer=comp.printer,
            paper=comp.paper,
            print_type=comp.print_type,
            printing_mode=comp.printing_mode,
            color_mode=comp.color_mode,
            price_per_sheet=(comp.price_per_sheet * multiplier).quantize(Decimal('0.01')),
            is_price_calculated=comp.is_price_calculated,
            total_circulation_price=(comp.total_circulation_price * multiplier).quantize(Decimal('0.01')),
            sheet_count=frozen_sheet_count,
            runs_count=frozen_runs_count,
            material_price=frozen_material_price,
            paper_density=frozen_paper_density,
            paper_thickness=frozen_paper_thickness,
        )

        # ===== 3b. Копируем одностраничный расчёт листов =====
        # У PrintComponent может быть ровно один VichisliniyaListovModel
        # (OneToOne, related_name='vichisliniya_listov_data').
        # Если его нет — пропускаем.
        try:
            vich_src = comp.vichisliniya_listov_data
        except VichisliniyaListovModel.DoesNotExist:
            vich_src = None

        if vich_src is not None:
            # Копируем все поля-параметры и все fit_*-поля,
            # включая polosa_count и cuts_count.
            ProductVichisliniya.objects.create(
                product_component=product_component,
                vyleta=vich_src.vichisliniya_listov_vyleta,
                polosa_count=vich_src.vichisliniya_listov_polosa_count,
                color=vich_src.vichisliniya_listov_color,
                item_width=vich_src.vichisliniya_listov_item_width,
                item_height=vich_src.vichisliniya_listov_item_height,
                fit_horizontal=vich_src.vichisliniya_listov_fit_horizontal,
                fit_vertical=vich_src.vichisliniya_listov_fit_vertical,
                fit_total=vich_src.vichisliniya_listov_fit_total,
                fit_landscape_total=vich_src.vichisliniya_listov_fit_landscape_total,
                fit_portrait_total=vich_src.vichisliniya_listov_fit_portrait_total,
                fit_selected_orientation=vich_src.vichisliniya_listov_fit_selected_orientation,
                list_count=vich_src.vichisliniya_listov_list_count,   # ЗАМОРОЖЕНО
                cuts_count=vich_src.vichisliniya_listov_cuts_count,   # ЗАМОРОЖЕНО
            )

        # ===== 3c. Копируем многостраничный расчёт (если он был активен) =====
        # related_name='multipage_data' (OneToOne). Если записи нет — пропускаем.
        # Копируем ТОЛЬКО если is_active=True — потому что именно активный
        # режим определял расчёт цены и количества листов. Если запись была,
        # но режим был выключен — пропускаем.
        try:
            mp_src = comp.multipage_data
        except VichisliniyaMultipageModel.DoesNotExist:
            mp_src = None

        if mp_src is not None and mp_src.is_active:
            ProductMultipage.objects.create(
                product_component=product_component,
                binding=mp_src.binding,
                total_pages=mp_src.total_pages,
                copies=mp_src.copies,
                finished_width=mp_src.finished_width,
                finished_height=mp_src.finished_height,
                vyleta=mp_src.vyleta,
                color=mp_src.color,
                booklet_orientation=mp_src.booklet_orientation,
                fit_horizontal=mp_src.fit_horizontal,
                fit_vertical=mp_src.fit_vertical,
                fit_total=mp_src.fit_total,
                fit_landscape_total=mp_src.fit_landscape_total,
                fit_portrait_total=mp_src.fit_portrait_total,
                fit_selected_orientation=mp_src.fit_selected_orientation,
                sheet_count=mp_src.sheet_count,        # ЗАМОРОЖЕНО
                is_active=True,                        # В снимке всегда True (мы её и брали как активную)
            )

        # ===== 3d. Копируем ламинацию (если есть) =====
        # OneToOne, related_name='lamination'. Если нет — пропускаем.
        try:
            lam_src = comp.lamination
        except Exception:
            # На случай, если связанной записи нет — Laminate.DoesNotExist.
            lam_src = None

        if lam_src is not None:
            # Снимок толщины плёнки — для расчёта массы/объёма.
            frozen_film_thickness = None
            if lam_src.film and lam_src.film.thickness is not None:
                frozen_film_thickness = Decimal(str(lam_src.film.thickness))

            ProductLaminate.objects.create(
                product_component=product_component,
                is_enabled=lam_src.is_enabled,
                side=lam_src.side,
                laminator=lam_src.laminator,
                film=lam_src.film,
                laminator_cost=lam_src.laminator_cost,
                laminator_markup=lam_src.laminator_markup,
                laminator_price=lam_src.laminator_price,
                film_price=lam_src.film_price,
                total_price=(lam_src.total_price * multiplier).quantize(Decimal('0.01')),
                film_thickness=frozen_film_thickness,
            )

        # ===== 3e. Копируем все не удалённые дополнительные работы =====
        for work_src in comp.additional_works.filter(is_deleted=False):
            ProductAdditionalWork.objects.create(
                product_component=product_component,
                work=work_src.work,
                number=work_src.number or '',
                title=work_src.title,
                cost=work_src.cost,
                markup_percent=work_src.markup_percent,
                price=work_src.price,
                quantity=work_src.quantity,
                formula_type=work_src.formula_type,
                lines_count=work_src.lines_count,
                items_per_sheet=work_src.items_per_sheet,
                total_price=(work_src.total_price * multiplier).quantize(Decimal('0.01')),     # ЗАМОРОЖЕНО
                is_deleted=False,
            )

    # --- Шаг 4. Считаем и замораживаем массу/объём/стопки ---
    # Делаем это ПОСЛЕ создания всех компонентов и ламинаций, чтобы
    # общая функция mass_volume видела всю структуру изделия.
    _freeze_mass_volume(product)

    # --- Шаг 5. Возвращаем созданные объекты ---
    # Кортеж (order, product) удобен вызывающему коду: он сразу знает,
    # куда редиректить пользователя и что показать.
    return order, product



# ============================================================================
# ФУНКЦИЯ 2: ДОБАВИТЬ ИЗДЕЛИЕ В СУЩЕСТВУЮЩИЙ ЗАКАЗ
# ============================================================================

@transaction.atomic
def add_product_to_order(proschet, order):
    """
    Создаёт изделие (копию просчёта) и добавляет его в СУЩЕСТВУЮЩИЙ заказ.

    Аргументы:
        proschet — экземпляр calculator.Proschet (что копируем).
        order    — экземпляр Order (куда добавляем).

    Возвращает:
        product — созданный экземпляр Product.

    Логика:
        Полностью повторяет вторую половину create_order_from_proschet
        (создание Product и копирование всех вложенных сущностей),
        но без создания самого Order.

    ВАЖНО:
        Заказ и просчёт должны принадлежать одному клиенту — это
        проверяется на уровне view (кнопка «Добавить в имеющийся»
        покажет только заказы этого клиента). Здесь дополнительной
        проверки не делаем, чтобы сервис оставался переиспользуемым.
    """

    # --- Шаг 1. Создаём изделие ---
    # Скидка — по клиенту ЗАКАЗА, а не клиента просчёта.
    # Логика: изделие добавляется в конкретный заказ конкретного клиента,
    # именно он будет платить → цена должна быть по его скидке.
    #
    # Пример: просчёт создан для Аромако (5%), добавляем в заказ
    # Барко (7%). Скидка должна быть 7% (Барко), а не 5% (Аромако).
    #
    # Если у заказа нет клиента — скидка 0% (явно передаём 0,
    # чтобы отличать от «не передан параметр»).
    order_discount = (
        order.client.discount
        if (order.client and order.client.discount)
        else 0
    )
    # Считаем базовую сумму только по активным элементам
    active_base_total = _get_active_base_total(proschet)
    
    frozen_total_price, multiplier = _calculate_final_prices(
        proschet, discount_percent=order_discount, base_total=active_base_total
    )

    # Вычисляем следующий порядковый номер для нового изделия.
    # Логика:
    #   • смотрим максимальный position среди ТОЛЬКО активных изделий
    #     заказа (is_deleted=False). Удалённые не учитываем — они не
    #     отображаются в списке и не должны «занимать места»;
    #   • если активных изделий нет (только что созданный заказ или
    #     всё удалили) — max() вернёт None, через «or 0» получаем 0,
    #     следующий position = 1;
    #   • иначе следующий position = max + 1, то есть новое изделие
    #     всегда добавляется в КОНЕЦ списка.
    # Это поведение по умолчанию. Замена (api_replace_product_in_order)
    # перезапишет position явно на старое значение — это делает views.py,
    # а не сервис.
    max_existing_position = (
        order.products
        .filter(is_deleted=False)
        .aggregate(Max('position'))['position__max']
    ) or 0
    next_position = max_existing_position + 1

    product = Product.objects.create(
        order=order,
        source_proschet=proschet,
        source_template=proschet.source_template,
        title=proschet.title,
        circulation=proschet.circulation or 1,
        # Порядковый номер — вычислен выше.
        position=next_position,
        total_price=frozen_total_price,
    )

    # --- Шаг 2. Проходим по всем не удалённым печатным компонентам ---
    for position, comp in enumerate(
        proschet.print_components.filter(is_deleted=False).order_by('created_at'),
        start=1
    ):
        # ===== 2a. Копируем сам печатный компонент =====
        # То же самое, что в create_order_from_proschet — берём «снимок»
        # вычисляемых значений на текущий момент.
        frozen_sheet_count = comp.get_sheet_count()
        frozen_runs_count = comp.runs_count
        frozen_material_price = comp.material_price_per_unit

        # Снимок плотности и толщины бумаги — для расчёта массы/объёма
        # в карточке изделия. Если бумага не выбрана — сохраняем нули.
        frozen_paper_density = Decimal('0.00')
        frozen_paper_thickness = Decimal('0.0000')
        if comp.paper:
            if comp.paper.density is not None:
                frozen_paper_density = Decimal(str(comp.paper.density))
            if comp.paper.paper_thickness is not None:
                frozen_paper_thickness = Decimal(str(comp.paper.paper_thickness))

        product_component = ProductPrintComponent.objects.create(
            product=product,
            position=position,
            number=comp.number or '',
            printer=comp.printer,
            paper=comp.paper,
            print_type=comp.print_type,
            printing_mode=comp.printing_mode,
            color_mode=comp.color_mode,
            price_per_sheet=(comp.price_per_sheet * multiplier).quantize(Decimal('0.01')),
            is_price_calculated=comp.is_price_calculated,
            total_circulation_price=(comp.total_circulation_price * multiplier).quantize(Decimal('0.01')),
            sheet_count=frozen_sheet_count,
            runs_count=frozen_runs_count,
            material_price=frozen_material_price,
            paper_density=frozen_paper_density,
            paper_thickness=frozen_paper_thickness,
        )

        # ===== 2b. Одностраничный расчёт листов =====
        try:
            vich_src = comp.vichisliniya_listov_data
        except VichisliniyaListovModel.DoesNotExist:
            vich_src = None

        if vich_src is not None:
            ProductVichisliniya.objects.create(
                product_component=product_component,
                vyleta=vich_src.vichisliniya_listov_vyleta,
                polosa_count=vich_src.vichisliniya_listov_polosa_count,
                color=vich_src.vichisliniya_listov_color,
                item_width=vich_src.vichisliniya_listov_item_width,
                item_height=vich_src.vichisliniya_listov_item_height,
                fit_horizontal=vich_src.vichisliniya_listov_fit_horizontal,
                fit_vertical=vich_src.vichisliniya_listov_fit_vertical,
                fit_total=vich_src.vichisliniya_listov_fit_total,
                fit_landscape_total=vich_src.vichisliniya_listov_fit_landscape_total,
                fit_portrait_total=vich_src.vichisliniya_listov_fit_portrait_total,
                fit_selected_orientation=vich_src.vichisliniya_listov_fit_selected_orientation,
                list_count=vich_src.vichisliniya_listov_list_count,
                cuts_count=vich_src.vichisliniya_listov_cuts_count,
            )

        # ===== 2c. Многостраничный расчёт (только если был активен) =====
        try:
            mp_src = comp.multipage_data
        except VichisliniyaMultipageModel.DoesNotExist:
            mp_src = None

        if mp_src is not None and mp_src.is_active:
            ProductMultipage.objects.create(
                product_component=product_component,
                binding=mp_src.binding,
                total_pages=mp_src.total_pages,
                copies=mp_src.copies,
                finished_width=mp_src.finished_width,
                finished_height=mp_src.finished_height,
                vyleta=mp_src.vyleta,
                color=mp_src.color,
                booklet_orientation=mp_src.booklet_orientation,
                fit_horizontal=mp_src.fit_horizontal,
                fit_vertical=mp_src.fit_vertical,
                fit_total=mp_src.fit_total,
                fit_landscape_total=mp_src.fit_landscape_total,
                fit_portrait_total=mp_src.fit_portrait_total,
                fit_selected_orientation=mp_src.fit_selected_orientation,
                sheet_count=mp_src.sheet_count,
                is_active=True,
            )

        # ===== 2d. Ламинация (если есть) =====
        try:
            lam_src = comp.lamination
        except Exception:
            lam_src = None

        if lam_src is not None:
            # Снимок толщины плёнки — для расчёта массы/объёма.
            frozen_film_thickness = None
            if lam_src.film and lam_src.film.thickness is not None:
                frozen_film_thickness = Decimal(str(lam_src.film.thickness))

            ProductLaminate.objects.create(
                product_component=product_component,
                is_enabled=lam_src.is_enabled,
                side=lam_src.side,
                laminator=lam_src.laminator,
                film=lam_src.film,
                laminator_cost=lam_src.laminator_cost,
                laminator_markup=lam_src.laminator_markup,
                laminator_price=lam_src.laminator_price,
                film_price=lam_src.film_price,
                total_price=(lam_src.total_price * multiplier).quantize(Decimal('0.01')),
                film_thickness=frozen_film_thickness,
            )

        # ===== 2e. Дополнительные работы =====
        for work_src in comp.additional_works.filter(is_deleted=False):
            ProductAdditionalWork.objects.create(
                product_component=product_component,
                work=work_src.work,
                number=work_src.number or '',
                title=work_src.title,
                cost=work_src.cost,
                markup_percent=work_src.markup_percent,
                price=work_src.price,
                quantity=work_src.quantity,
                formula_type=work_src.formula_type,
                lines_count=work_src.lines_count,
                items_per_sheet=work_src.items_per_sheet,
                total_price=(work_src.total_price * multiplier).quantize(Decimal('0.01')),
                is_deleted=False,
            )

    # --- Шаг 3. Считаем и замораживаем массу/объём/стопки ---
    _freeze_mass_volume(product)

    # --- Шаг 4. Возвращаем созданное изделие ---
    return product



# ============================================================================
# ФУНКЦИЯ 3: СОЗДАТЬ НОВЫЙ ПРОСЧЁТ ИЗ ИЗДЕЛИЯ
# ============================================================================

@transaction.atomic
def create_proschet_from_product(product, source_order=None):
    """
    Создаёт новый просчёт из изделия.

    Это ОБРАТНАЯ операция по отношению к create_order_from_proschet:
    берём «замороженное» изделие и «размораживаем» его в свежий
    динамический просчёт, где цена пересчитается на АКТУАЛЬНЫЕ
    справочники.

    Аргументы:
        product      — экземпляр Product (что разворачиваем в просчёт).
        source_order — необязательная ссылка на orders.Order. Если передан,
                       сохраняется в Proschet.source_order. Используется
                       новыми эндпоинтами «умного редиректа»
                       (api_unfreeze_product, api_clone_product), чтобы
                       баннер на /proschety/ знал, к какому заказу
                       возвращаться после сохранения. По умолчанию None —
                       тогда source_order не заполняется (как раньше).

    Возвращает:
        proschet — созданный экземпляр calculator.Proschet.

    Что НЕ копируем из изделия:
        - price_per_sheet, total_circulation_price (на PrintComponent) —
          пересчитываются автоматически в PrintComponent.save();
        - list_count, cuts_count (на Vichisliniya) — пересчитываются
          в VichisliniyaListovModel.save();
        - sheet_count (на Multipage) — пересчитывается
          в VichisliniyaMultipageModel.save();
        - laminator_cost / markup / price / film_price / total_price
          (на Laminate) — пересчитываются через recalculate_price();
        - cost / markup_percent / price / total_price
          (на AdditionalWork) — пересчитываются в save() модели.

    Что копируем из изделия:
        - все входные параметры (принтер, бумага, тип/режим печати,
          размеры, ориентация, плёнка, ламинатор, формулы работ и т.п.);
        - привязки к справочникам (work_id);
        - исходный шаблон (source_template) — для трассировки цепочки;
        - исходный заказ (source_order) — если он передан параметром.
    """

    # --- Шаг 1. Определяем клиента для нового просчёта ---
    #
    # Логика зависит от того, передан ли source_order:
    #
    #   • source_order передан (это делают api_clone_product и
    #     api_unfreeze_product) — берём клиента ИМЕННО ЭТОГО заказа.
    #     Это правильно, потому что:
    #       - при копировании в заказ другого клиента цена
    #         должна сразу считаться по скидке ЭТОГО клиента;
    #       - при редактировании изделия source_order = заказ,
    #         в котором лежит изделие, то есть клиент тот же.
    #
    #   • source_order не передан (старый api_proschet_from_product) —
    #     как раньше, клиент оригинального заказа изделия.
    #     В этом случае новая логика не ломается: изделие уже
    #     лежит в каком-то заказе, и клиент этого заказа —
    #     логичный выбор.
    #
    # client у заказа может быть None — тогда просчёт создастся
    # без клиента (пользователь потом укажет его в калькуляторе).
    if source_order is not None:
        client = source_order.client
    else:
        # Fallback для совместимости: client = клиент заказа, в котором
        # лежит изделие. product.order обязательный FK, поэтому он есть
        # всегда.
        client = product.order.client if product.order else None

    # --- Шаг 2. Создаём корневой просчёт ---
    # Тираж берём из изделия (он был зафиксирован на момент создания).
    # source_template наследуем — если изделие было из шаблона,
    # новый просчёт тоже будет считаться «потомком» этого шаблона.
    proschet = Proschet.objects.create(
        title=product.title,                       # Название копируем
        circulation=product.circulation or 1,      # Тираж копируем
        client=client,                             # Клиент — из заказа изделия
        source_template=product.source_template,   # Цепочка трассировки через шаблон
        # Ссылка на заказ-источник. Передаётся необязательным параметром.
        # Если None — просчёт создаётся без привязки к заказу (как
        # было раньше, через api_proschet_from_product).
        # Если указан — устанавливается, чтобы баннер на /proschety/
        # мог показать «Вы редактируете изделие из Заказа ORD-X».
        source_order=source_order,
    )

    # --- Шаг 3. Перебираем компоненты изделия в исходном порядке ---
    for pos, prod_comp in enumerate(
        product.components.all().order_by('position', 'id'),
        start=1
    ):
        # ===== 3a. Создаём PrintComponent =====
        # ВАЖНО: НЕ копируем price_per_sheet и total_circulation_price.
        # PrintComponent.save() сам рассчитает price_per_sheet, если
        # у компонента есть принтер и есть данные листов.
        # Но на момент создания PrintComponent данных листов ещё нет —
        # поэтому price будет 0. Полный пересчёт сделаем ниже, в шаге 3g.
        component = PrintComponent.objects.create(
            proschet=proschet,
            printer=prod_comp.printer,
            paper=prod_comp.paper,
            print_type=prod_comp.print_type,
            printing_mode=prod_comp.printing_mode,
            color_mode=prod_comp.color_mode,
        )

        # ===== 3b. Одностраничный расчёт листов =====
        # Если у изделия был ProductVichisliniya — восстанавливаем его
        # в VichisliniyaListovModel. Все входные параметры и fit_*-поля
        # копируем, а list_count и cuts_count пересчитаются в save()
        # модели автоматически (там есть переопределённый save()).
        prod_vich = getattr(prod_comp, 'vichisliniya', None)
        if prod_vich is not None:
            VichisliniyaListovModel.objects.create(
                vichisliniya_listov_print_component=component,
                vichisliniya_listov_vyleta=prod_vich.vyleta,
                vichisliniya_listov_polosa_count=prod_vich.polosa_count,
                vichisliniya_listov_color=prod_vich.color,
                vichisliniya_listov_item_width=prod_vich.item_width,
                vichisliniya_listov_item_height=prod_vich.item_height,
                vichisliniya_listov_fit_horizontal=prod_vich.fit_horizontal,
                vichisliniya_listov_fit_vertical=prod_vich.fit_vertical,
                vichisliniya_listov_fit_total=prod_vich.fit_total,
                vichisliniya_listov_fit_landscape_total=prod_vich.fit_landscape_total,
                vichisliniya_listov_fit_portrait_total=prod_vich.fit_portrait_total,
                vichisliniya_listov_fit_selected_orientation=prod_vich.fit_selected_orientation,
                # list_count и cuts_count не передаём — save() посчитает
            )

        # ===== 3c. Многостраничный расчёт (если был) =====
        # Если у изделия есть ProductMultipage — восстанавливаем
        # VichisliniyaMultipageModel. sheet_count пересчитается в save().
        prod_mp = getattr(prod_comp, 'multipage', None)
        if prod_mp is not None:
            VichisliniyaMultipageModel.objects.create(
                print_component=component,
                binding=prod_mp.binding,
                total_pages=prod_mp.total_pages,
                copies=prod_mp.copies,
                finished_width=prod_mp.finished_width,
                finished_height=prod_mp.finished_height,
                vyleta=prod_mp.vyleta,
                color=prod_mp.color,
                booklet_orientation=prod_mp.booklet_orientation,
                fit_horizontal=prod_mp.fit_horizontal,
                fit_vertical=prod_mp.fit_vertical,
                fit_total=prod_mp.fit_total,
                fit_landscape_total=prod_mp.fit_landscape_total,
                fit_portrait_total=prod_mp.fit_portrait_total,
                fit_selected_orientation=prod_mp.fit_selected_orientation,
                is_active=prod_mp.is_active,
                # sheet_count пересчитается в save()
            )

        # ===== 3d. Ламинация =====
        # Восстанавливаем Laminate. Все расчётные поля (laminator_cost,
        # laminator_markup, laminator_price, film_price, total_price)
        # пересчитываются через recalculate_price(sheet_count).
        prod_lam = getattr(prod_comp, 'lamination', None)
        if prod_lam is not None:
            lamination = Laminate.objects.create(
                print_component=component,
                is_enabled=prod_lam.is_enabled,
                side=prod_lam.side,
                laminator=prod_lam.laminator,
                film=prod_lam.film,
                # расчётные поля не передаём — обнулятся в defaults,
                # а потом пересчитаются через recalculate_price() ниже.
            )
            if lamination.is_enabled:
                # Пересчитываем стоимость под актуальные справочники.
                sheet_count = component.get_sheet_count()
                lamination.recalculate_price(sheet_count)
                lamination.save()

        # ===== 3e. Дополнительные работы =====
        # Восстанавливаем AdditionalWork. save() модели сам рассчитает
        # total_price по формулам и актуальным справочникам.
        for prod_work in prod_comp.works.filter(is_deleted=False):
            AdditionalWork.objects.create(
                print_component=component,
                work=prod_work.work,           # Ссылка на справочник
                title=prod_work.title,         # Название (перезапишется из work, если work есть)
                cost=prod_work.cost,           # (перезапишется из work)
                markup_percent=prod_work.markup_percent,   # (перезапишется)
                price=prod_work.price,         # (перезапишется)
                quantity=prod_work.quantity,
                formula_type=prod_work.formula_type,       # (перезапишется)
                lines_count=prod_work.lines_count,         # (перезапишется)
                items_per_sheet=prod_work.items_per_sheet, # (перезапишется)
                # total_price рассчитается в save()
            )

        # ===== 3f. ФИНАЛЬНЫЙ ПЕРЕСЧЁТ ЦЕНЫ КОМПОНЕНТА =====
        # Делаем в самом конце, когда уже есть все вложенные объекты
        # (расчёты листов, ламинация, работы). Теперь get_sheet_count()
        # вернёт правильное значение, и recalculate_price() рассчитает
        # price_per_sheet и total_circulation_price по АКТУАЛЬНЫМ справочникам.
        component.recalculate_price()

    # --- Шаг 4. Возвращаем созданный просчёт ---
    return proschet



# ============================================================================
# ВСПОМОГАТЕЛЬНАЯ ФУНКЦИЯ: ЗАМОРОЗИТЬ МАССУ/ОБЪЁМ/СТОПКИ В ИЗДЕЛИИ
# ============================================================================

def _freeze_mass_volume(product):
    """
    Считает массу, объём и размеры стопок по вложенным снимкам изделия
    и сохраняет результат в поля frozen_* модели Product.

    Использует ОБЩУЮ функцию calculator.utils_mass_volume.calculate_mass_and_volume —
    ту же, что применяется в секции «Масса и объём» калькулятора.
    Так формулы живут в одном месте, а изделие получает «замороженные» числа.

    Аргумент:
        product — экземпляр Product (уже с созданными components/lamination).

    Ничего не возвращает — сохраняет поля product.save().
    """

    # Импортируем здесь, чтобы избежать циклического импорта:
    # utils_mass_volume внутри себя ничего из orders не импортирует,
    # но лучше держать импорт локальным.
    from calculator.utils_mass_volume import calculate_mass_and_volume

    # --- Собираем данные в формате, который ждёт общая функция ---
    # Она ожидает словарь с ключами 'proschet', 'print_components', 'laminations'.
    # Изделие хранит свои данные в собственных моделях-снимках.

    # Компоненты.
    components_data = []
    laminations_data = []

    for comp in product.components.order_by('position', 'id'):
        # Определяем размеры изделия и данные для формулы.
        # Логика та же, что в calculator/views.py::get_proschet_price_data:
        # если у компонента активен многостраничный режим — берём размеры
        # страницы (finished_width/finished_height), иначе — размеры
        # одностраничного изделия (item_width/item_height).
        # ВАЖНО: в снимке наличие записи multipage означает, что при
        # создании изделия многостраничный режим был активен.
        #
        # Также забираем sheet_count и fit_total — они нужны для расчёта
        # «по фактически нарезанной бумаге» (N = sheet_count × fit_total).
        item_width = 0.0
        item_height = 0.0
        sheet_count_for_mass = 0.0
        fit_total_for_mass = 0

        mp = getattr(comp, 'multipage', None)
        if mp is not None:
            item_width = float(mp.finished_width)
            item_height = float(mp.finished_height)
            sheet_count_for_mass = float(mp.sheet_count)
            fit_total_for_mass = int(mp.fit_total or 0)
        else:
            vich = getattr(comp, 'vichisliniya', None)
            if vich is not None:
                item_width = float(vich.item_width)
                item_height = float(vich.item_height)
                sheet_count_for_mass = float(vich.list_count)
                fit_total_for_mass = int(vich.fit_total or 0)

        components_data.append({
            'id': comp.id,
            'number': comp.number or '',
            'printer_name': comp.printer.name if comp.printer else '',
            'paper_density': float(comp.paper_density) if comp.paper_density is not None else 0.0,
            'paper_thickness': float(comp.paper_thickness) if comp.paper_thickness is not None else 0.0,
            'item_width': item_width,
            'item_height': item_height,
            'sheet_count': sheet_count_for_mass,
            'fit_total': fit_total_for_mass,
        })

        # Ламинация — если есть и включена.
        lam = getattr(comp, 'lamination', None)
        if lam is not None:
            laminations_data.append({
                'component_id': comp.id,
                'is_enabled': lam.is_enabled,
                'side': lam.side,
                'film_thickness': float(lam.film_thickness) if lam.film_thickness is not None else None,
                'film_name': lam.film.name if lam.film else '',
            })

    # --- Вызываем общую функцию ---
    result = calculate_mass_and_volume({
        'proschet': {'circulation': product.circulation},
        'print_components': components_data,
        'laminations': laminations_data,
    })

    # --- Сохраняем результат в поля-снимки ---
    product.frozen_total_mass_g = Decimal(str(result['total_mass_g']))
    product.frozen_total_volume_cm3 = Decimal(str(result['total_volume_cm3']))
    product.frozen_stacks = result['stacks']
    product.save(update_fields=['frozen_total_mass_g', 'frozen_total_volume_cm3', 'frozen_stacks'])