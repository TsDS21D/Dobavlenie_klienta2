# shablony_proschetov/services.py
"""
Сервисный слой приложения "Справочник шаблонов просчётов".

Здесь собраны функции, которые выполняют бизнес-операции над моделями,
но не привязаны к HTTP-запросам.

Основная функция — create_proschet_from_template():
  берёт шаблон ProschetTemplate и создаёт на его основе реальный
  просчёт Proschet со всеми вложенными сущностями:
    - PrintComponent
    - VichisliniyaListovModel и (при необходимости) VichisliniyaMultipageModel
    - Laminate
    - AdditionalWork

Функция обёрнута в @transaction.atomic: если на любом шаге возникнет
ошибка, все уже созданные объекты откатятся и «мусор» в БД не останется.
"""

from decimal import Decimal                                # Точные десятичные вычисления
from django.db import transaction                          # Атомарность операции

# ===== МОДЕЛИ ПРИЛОЖЕНИЯ calculator =====
from calculator.models_list_proschet import (
    Proschet,                                              # Просчёт — корневой объект
    PrintComponent,                                        # Печатный компонент
    AdditionalWork,                                        # Дополнительная работа
)
from calculator.models_lamination import Laminate          # Ламинация

# ===== МОДЕЛИ ПРИЛОЖЕНИЯ vichisliniya_listov =====
from vichisliniya_listov.models import VichisliniyaListovModel       # Одностраничный расчёт
from vichisliniya_listov.multipage_models import VichisliniyaMultipageModel  # Многостраничный расчёт


from .models import (
    ProschetTemplate,
    TemplatePrintComponent,
    TemplateAdditionalWork,
    TemplateLaminate,
    TemplateVichisliniya,
    TemplateMultipage,
)

@transaction.atomic
def create_proschet_from_template(template):
    """
    Создаёт реальный просчёт на основе шаблона.

    Аргументы:
        template — экземпляр ProschetTemplate.

    Возвращает:
        созданный экземпляр Proschet.

    Логика по шагам:
    1. Создать сам Proschet (название = имя шаблона, тираж = типовой тираж,
       source_template = ссылка на шаблон).
    2. Для каждого компонента шаблона:
       a) создать PrintComponent (принтер, бумага, тип/режим печати);
       b) создать VichisliniyaListovModel с параметрами расчёта
          и пересчитать размещение на листе под реальный формат принтера;
       c) пересчитать цену печати и общую стоимость компонента;
       d) если у компонента шаблона активен многостраничный режим —
          создать VichisliniyaMultipageModel;
       e) создать Laminate (если есть) и пересчитать её стоимость;
       f) создать все AdditionalWork.
    """
    # --- 1. Корневой просчёт ---
    proschet = Proschet.objects.create(
        title=template.name,                  # название берём из шаблона
        circulation=template.circulation,     # типовой тираж (по умолчанию 100)
        source_template=template,             # ссылка на исходный шаблон
    )

    # --- 2. Перебираем компоненты шаблона в порядке, заданном order ---
    for tpl_comp in template.components.all().order_by('order', 'id'):

        # --- 2a. Печатный компонент ---
        # ВАЖНО: на этом шаге VichisliniyaListovModel ещё нет, поэтому
        # PrintComponent.save() не сможет рассчитать цену (sheet_count=0).
        # Это нормально — цену пересчитаем ниже, после создания расчёта листов.
        component = PrintComponent.objects.create(
            proschet=proschet,
            printer=tpl_comp.printer,
            paper=tpl_comp.paper,
            print_type=tpl_comp.print_type,
            printing_mode=tpl_comp.printing_mode,
        )

        # --- 2b. Одностраничный расчёт листов ---
        # В шаблоне может быть свой Vichisliniya или его может не быть —
        # тогда создаём с параметрами по умолчанию (90×50, зазор 1 мм, 4+0).
        tpl_vich = getattr(tpl_comp, 'vichisliniya', None)

        vich_data = VichisliniyaListovModel(
            vichisliniya_listov_print_component=component,
            vichisliniya_listov_vyleta=tpl_vich.vyleta if tpl_vich else 1,
            vichisliniya_listov_color=tpl_vich.color if tpl_vich else '4+0',
            vichisliniya_listov_item_width=tpl_vich.item_width if tpl_vich else Decimal('90.00'),
            vichisliniya_listov_item_height=tpl_vich.item_height if tpl_vich else Decimal('50.00'),
            vichisliniya_listov_fit_selected_orientation=(
                tpl_vich.fit_selected_orientation if tpl_vich else 'auto'
            ),
        )

        # Если у принтера известен формат листа — считаем размещение изделий.
        if component.printer and component.printer.sheet_format and component.printer.margin_mm is not None:
            vich_data.calculate_fitting(
                component.printer.sheet_format.width_mm,
                component.printer.sheet_format.height_mm,
                component.printer.margin_mm,
            )
        # Считаем количество листов под типовой тираж.
        vich_data.vichisliniya_listov_calculate_list_count(template.circulation)
        vich_data.save()

        # --- 2d. Многостраничный режим (брошюры) ---
        # Создаём VichisliniyaMultipageModel только если он активен в шаблоне.
        tpl_mp = getattr(tpl_comp, 'multipage', None)
        if tpl_mp is not None and tpl_mp.is_active:
            VichisliniyaMultipageModel.objects.create(
                print_component=component,
                binding=tpl_mp.binding,
                total_pages=tpl_mp.total_pages,
                copies=template.circulation,
                finished_width=tpl_mp.finished_width,
                finished_height=tpl_mp.finished_height,
                vyleta=tpl_mp.vyleta,
                color=tpl_mp.color,
                booklet_orientation=tpl_mp.booklet_orientation,
                fit_horizontal=tpl_mp.fit_horizontal,
                fit_vertical=tpl_mp.fit_vertical,
                fit_total=tpl_mp.fit_total,
                fit_landscape_total=tpl_mp.fit_landscape_total,
                fit_portrait_total=tpl_mp.fit_portrait_total,
                fit_selected_orientation=tpl_mp.fit_selected_orientation,
                is_active=True,
            )

        # --- 2e. Ламинация ---
        # В шаблоне ламинация может быть не создана вовсе — тогда пропускаем.
        tpl_lam = getattr(tpl_comp, 'lamination', None)
        if tpl_lam is not None:
            lamination = Laminate.objects.create(
                print_component=component,
                is_enabled=tpl_lam.is_enabled,
                side=tpl_lam.side,
                laminator=tpl_lam.laminator,
                film=tpl_lam.film,
            )
            # Пересчитываем стоимость ламинации под реальное количество листов.
            if lamination.is_enabled:
                sheet_count = component.get_sheet_count()
                lamination.recalculate_price(sheet_count)
                lamination.save()

        # --- 2f. Дополнительные работы ---
        for tpl_work in tpl_comp.works.all():
            AdditionalWork.objects.create(
                print_component=component,
                work=tpl_work.work,
                title=tpl_work.title,
                cost=tpl_work.cost,
                markup_percent=tpl_work.markup_percent,
                price=tpl_work.price,
                quantity=tpl_work.quantity,
                formula_type=tpl_work.formula_type,
                lines_count=tpl_work.lines_count,
                items_per_sheet=tpl_work.items_per_sheet,
            )
            # AdditionalWork.save() сам пересчитает total_price
            # на основе текущего sheet_count и формул.

        # --- 2g. ФИНАЛЬНЫЙ ПЕРЕСЧЁТ ЦЕНЫ КОМПОНЕНТА ---
        # Делаем это В САМОМ КОНЦЕ, когда уже созданы все вложенные объекты:
        # одностраничный расчёт, многостраничный расчёт (если активен),
        # ламинация и работы. Теперь get_sheet_count() вернёт правильное
        # количество листов, соответствующее выбранному режиму,
        # и цена не будет завышенной.
        component.recalculate_price()

    return proschet

# ============================================================================
# ОБРАТНАЯ ОПЕРАЦИЯ: СОХРАНИТЬ ПРОСЧЁТ КАК ШАБЛОН
# ============================================================================

@transaction.atomic
def save_proschet_as_template(proschet, name, category, comment='', created_by=None):
    """
    Сохраняет существующий просчёт как шаблон.

    Аргументы:
        proschet  — экземпляр Proschet (что сохраняем).
        name      — название шаблона.
        category  — экземпляр TemplateCategory (куда сохраняем).
        comment   — комментарий (опционально).
        created_by — пользователь (опционально).

    Логика:
    - Если в выбранной категории уже есть шаблон с таким же именем —
      он УДАЛЯЕТСЯ со всеми вложенными сущностями и создаётся заново.
      Так реализовано «обновление через перезапись».
    - Иначе создаётся новый шаблон.

    Возвращает экземпляр ProschetTemplate.
    """
    # 1. Проверяем, есть ли уже шаблон с таким именем в этой категории.
    existing = ProschetTemplate.objects.filter(category=category, name=name).first()
    if existing:
        # Перезаписываем: удаляем старый шаблон (вложенные удалятся каскадом).
        existing.delete()

    # 2. Создаём шаблон.
    template = ProschetTemplate.objects.create(
        name=name,
        category=category,
        comment=comment or '',
        circulation=proschet.circulation or 100,
        source_proschet=proschet,
        created_by=created_by,
    )

    # 3. Перебираем печатные компоненты просчёта и копируем их в шаблон.
    for order, comp in enumerate(proschet.print_components.filter(is_deleted=False).order_by('created_at'), start=1):

        # 3a. Копия компонента.
        tpl_comp = TemplatePrintComponent.objects.create(
            template=template,
            order=order,
            printer=comp.printer,
            paper=comp.paper,
            print_type=comp.print_type,
            printing_mode=comp.printing_mode,
        )

        # 3b. Одностраничные вычисления листов.
        #     Берём только входные параметры — размеры, зазор, ориентацию.
        try:
            vich = comp.vichisliniya_listov_data
        except VichisliniyaListovModel.DoesNotExist:
            vich = None

        if vich is not None:
            TemplateVichisliniya.objects.create(
                template_component=tpl_comp,
                vyleta=vich.vichisliniya_listov_vyleta,
                color=vich.vichisliniya_listov_color,
                item_width=vich.vichisliniya_listov_item_width,
                item_height=vich.vichisliniya_listov_item_height,
                fit_horizontal=vich.vichisliniya_listov_fit_horizontal,
                fit_vertical=vich.vichisliniya_listov_fit_vertical,
                fit_total=vich.vichisliniya_listov_fit_total,
                fit_landscape_total=vich.vichisliniya_listov_fit_landscape_total,
                fit_portrait_total=vich.vichisliniya_listov_fit_portrait_total,
                fit_selected_orientation=vich.vichisliniya_listov_fit_selected_orientation,
                cuts_count=vich.vichisliniya_listov_cuts_count,
            )

        # 3c. Многостраничные вычисления (только если запись существует).
        try:
            mp = comp.multipage_data
        except VichisliniyaMultipageModel.DoesNotExist:
            mp = None

        if mp is not None:
            TemplateMultipage.objects.create(
                template_component=tpl_comp,
                binding=mp.binding,
                total_pages=mp.total_pages,
                copies=mp.copies,
                finished_width=mp.finished_width,
                finished_height=mp.finished_height,
                vyleta=mp.vyleta,
                color=mp.color,
                booklet_orientation=mp.booklet_orientation,
                fit_horizontal=mp.fit_horizontal,
                fit_vertical=mp.fit_vertical,
                fit_total=mp.fit_total,
                fit_landscape_total=mp.fit_landscape_total,
                fit_portrait_total=mp.fit_portrait_total,
                fit_selected_orientation=mp.fit_selected_orientation,
                is_active=mp.is_active,
            )

        # 3d. Ламинация (может отсутствовать).
        try:
            lam = comp.lamination
        except Laminate.DoesNotExist:
            lam = None

        if lam is not None:
            TemplateLaminate.objects.create(
                template_component=tpl_comp,
                is_enabled=lam.is_enabled,
                side=lam.side,
                laminator=lam.laminator,
                film=lam.film,
            )

        # 3e. Дополнительные работы.
        for work in comp.additional_works.filter(is_deleted=False):
            TemplateAdditionalWork.objects.create(
                template_component=tpl_comp,
                work=work.work,
                title=work.title,
                cost=work.cost,
                markup_percent=work.markup_percent,
                price=work.price,
                quantity=work.quantity,
                formula_type=work.formula_type,
                lines_count=work.lines_count,
                items_per_sheet=work.items_per_sheet,
            )

    return template