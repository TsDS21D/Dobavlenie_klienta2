"""
dictionaries_backup_utils.py

Бэкап СПРАВОЧНИКОВ (вариант C).
Отдельный модуль от backup_utils.py — тот отвечает за «данные» (клиенты,
просчёты, заказы, изделия), этот — за справочники (оборудование, склад,
товары, работы, цены, скрепления, шаблоны).

Восстановление справочников (restore_dictionaries_from_zip) — в шаге B.2.
Здесь только сериализация и сборка ZIP.

ВАЖНО: порядок секций в JSON соответствует порядку восстановления.
"""

import json
import zipfile
import io
from datetime import datetime
from decimal import Decimal

from django.core.serializers.json import DjangoJSONEncoder
from django.contrib.auth.models import User, Group, Permission
from django.db import transaction, connection
from django.utils.dateparse import parse_datetime

# ===== СПРАВОЧНИКИ — ОБОРУДОВАНИЕ И ФОРМАТЫ =====
from sheet_formats.models import SheetFormat
from devices.models import Printer, Laminator

# ===== СПРАВОЧНИКИ — СКЛАД =====
from sklad.models import Category as SkladCategory, Material

# ===== СПРАВОЧНИКИ — ТОВАРЫ =====
from tovary.models import Category as TovarCategory, Tovar

# ===== СПРАВОЧНИКИ — РАБОТЫ =====
from spravochnik_dopolnitelnyh_rabot.models import (
    Work, WorkPrice, WorkCirculationPrice,
)

# ===== СПРАВОЧНИКИ — ЦЕНЫ =====
from print_price.models import PrintPrice, LaminatorPrice

# ===== СПРАВОЧНИКИ — СКРЕПЛЕНИЯ (многостраничное) =====
from vichisliniya_listov.multipage_models import MultipageBinding

# ===== СПРАВОЧНИКИ — ШАБЛОНЫ =====
from shablony_proschetov.models import (
    TemplateCategory,
    ProschetTemplate,
    TemplatePrintComponent,
    TemplateAdditionalWork,
    TemplateLaminate,
    TemplateVichisliniya,
    TemplateMultipage,
)

# ===== СПРАВОЧНИКИ — ВЕБ-КАЛЬКУЛЯТОРЫ =====
from web_calculators.models import (
    WebCalculator,
    WebCalculatorComponent,
    WebCalculatorComponentFilm,
    WebCalculatorComponentPaper,
    WebCalculatorComponentWork,
    WebCalculatorCirculationPreset,
    WebCalculatorQuantityPreset,
    WebCalculatorSizePreset,
)


def serialize_dictionaries():
    """
    Собирает все справочники в один большой словарь (dict).
    Использует DjangoJSONEncoder при дампе в JSON (см. create_dictionaries_backup_zip).
    MPTT-поля (lft/rght/tree_id/level) сохраняются «как есть» — при восстановлении
    они будут проигнорированы и заменены результатом .objects.rebuild().
    """
    data = {
        'version': '1.0',
        'export_date': datetime.now().isoformat(),
        'dictionaries': {
            # Пользователи и группы — в начале, потому что при restore они
            # восстанавливаются ПЕРВЫМИ: на них ссылаются Order.created_by_id,
            # ProschetTemplate.created_by_id, а также M2M-связи.
            'users': [],
            'groups': [],
            'sheet_formats': [],
            'devices_printers': [],
            'devices_laminators': [],
            'sklad_categories': [],
            'sklad_materials': [],
            'tovary_categories': [],
            'tovary_tovary': [],
            'works': [],
            'work_prices': [],
            'work_circulation_prices': [],
            'print_prices': [],
            'laminator_prices': [],
            'multipage_bindings': [],
            'template_categories': [],
            'proschet_templates': [],
            'template_print_components': [],
            'template_additional_works': [],
            'template_laminates': [],
            'template_vichisliniya': [],
            'template_multipage': [],
            # ВЕБ-КАЛЬКУЛЯТОРЫ
            'web_calculators': [],
            'web_calc_components': [],
            'web_calc_size_presets': [],
            'web_calc_circulation_presets': [],
            'web_calc_quantity_presets': [],
            'web_calc_component_papers': [],
            'web_calc_component_films': [],
            'web_calc_component_works': [],
        }
    }

    d = data['dictionaries']

    # 1. ФОРМАТЫ ЛИСТОВ
    for f in SheetFormat.objects.all():
        d['sheet_formats'].append({
            'id': f.id,
            'name': f.name,
            'width_mm': f.width_mm,
            'height_mm': f.height_mm,
        })

    # 2. ПРИНТЕРЫ
    for p in Printer.objects.all():
        d['devices_printers'].append({
            'id': p.id,
            'name': p.name,
            'sheet_format_id': p.sheet_format_id,
            'margin_mm': p.margin_mm,
            'duplex_coefficient': float(p.duplex_coefficient),
            'devices_interpolation_method': p.devices_interpolation_method,
            'created_at': p.created_at.isoformat() if p.created_at else None,
            'updated_at': p.updated_at.isoformat() if p.updated_at else None,
        })

    # 3. ЛАМИНАТОРЫ
    for l in Laminator.objects.all():
        d['devices_laminators'].append({
            'id': l.id,
            'name': l.name,
            'sheet_format_id': l.sheet_format_id,
            'margin_mm': l.margin_mm,
            'duplex_coefficient': float(l.duplex_coefficient),
            'laminator_interpolation_method': l.laminator_interpolation_method,
            'created_at': l.created_at.isoformat() if l.created_at else None,
            'updated_at': l.updated_at.isoformat() if l.updated_at else None,
        })

    # 4. СКЛАД — КАТЕГОРИИ (MPTT)
    # Порядок: сначала по tree_id/lft — чтобы в JSON дерево шло логично.
    for cat in SkladCategory.objects.all().order_by('tree_id', 'lft'):
        d['sklad_categories'].append({
            'id': cat.id,
            'name': cat.name,
            'type': cat.type,
            'parent_id': cat.parent_id,
            'description': cat.description,
            'created_at': cat.created_at.isoformat() if cat.created_at else None,
            'updated_at': cat.updated_at.isoformat() if cat.updated_at else None,
            # MPTT (при restore игнорируются + rebuild)
            'lft': cat.lft,
            'rght': cat.rght,
            'tree_id': cat.tree_id,
            'level': cat.level,
        })

    # 5. СКЛАД — МАТЕРИАЛЫ (бумага + плёнка)
    for m in Material.objects.all():
        d['sklad_materials'].append({
            'id': m.id,
            'name': m.name,
            'category_id': m.category_id,
            'type': m.type,
            'unit': m.unit,
            'cost': str(m.cost) if m.cost is not None else None,
            'markup_percent': str(m.markup_percent) if m.markup_percent is not None else None,
            'density': m.density,
            'paper_thickness': str(m.paper_thickness) if m.paper_thickness is not None else None,
            'thickness': m.thickness,
            'quantity': m.quantity,
            'min_quantity': m.min_quantity,
            'characteristics': m.characteristics,
            'notes': m.notes,
            'is_active': m.is_active,
            'position': m.position,
            'created_at': m.created_at.isoformat() if m.created_at else None,
            'updated_at': m.updated_at.isoformat() if m.updated_at else None,
        })

    # 6. ТОВАРЫ — КАТЕГОРИИ (MPTT)
    for cat in TovarCategory.objects.all().order_by('tree_id', 'lft'):
        d['tovary_categories'].append({
            'id': cat.id,
            'name': cat.name,
            'parent_id': cat.parent_id,
            'is_deleted': cat.is_deleted,
            'created_at': cat.created_at.isoformat() if cat.created_at else None,
            'updated_at': cat.updated_at.isoformat() if cat.updated_at else None,
            'lft': cat.lft,
            'rght': cat.rght,
            'tree_id': cat.tree_id,
            'level': cat.level,
        })

    # 7. ТОВАРЫ
    for t in Tovar.objects.all():
        d['tovary_tovary'].append({
            'id': t.id,
            'name': t.name,
            'category_id': t.category_id,
            'category_old': t.category_old,
            'article': t.article,
            'price': str(t.price),
            'unit': t.unit,
            'is_deleted': t.is_deleted,
            'created_at': t.created_at.isoformat() if t.created_at else None,
            'updated_at': t.updated_at.isoformat() if t.updated_at else None,
        })

    # 8. РАБОТЫ (справочник)
    for w in Work.objects.all():
        d['works'].append({
            'id': w.id,
            'name': w.name,
            'cost': str(w.cost),
            'markup_percent': str(w.markup_percent),
            'price': str(w.price),
            'formula_type': w.formula_type,
            'interpolation_method': w.interpolation_method,
            'k_lines': str(w.k_lines),
            'default_lines_count': w.default_lines_count,
            'default_items_per_sheet': w.default_items_per_sheet,
            'created_at': w.created_at.isoformat() if w.created_at else None,
            'updated_at': w.updated_at.isoformat() if w.updated_at else None,
        })

    # 9. РАБОТЫ — ОПОРНЫЕ ЦЕНЫ ПО ЛИСТАМ
    for wp in WorkPrice.objects.all():
        d['work_prices'].append({
            'id': wp.id,
            'work_id': wp.work_id,
            'sheets': wp.sheets,
            'price': str(wp.price),
            'created_at': wp.created_at.isoformat() if wp.created_at else None,
            'updated_at': wp.updated_at.isoformat() if wp.updated_at else None,
        })

    # 10. РАБОТЫ — ОПОРНЫЕ ЦЕНЫ ПО ТИРАЖУ
    for wcp in WorkCirculationPrice.objects.all():
        d['work_circulation_prices'].append({
            'id': wcp.id,
            'work_id': wcp.work_id,
            'circulation': wcp.circulation,
            'price': str(wcp.price),
            'created_at': wcp.created_at.isoformat() if wcp.created_at else None,
            'updated_at': wcp.updated_at.isoformat() if wcp.updated_at else None,
        })

    # 11. ЦЕНЫ ПЕЧАТИ (принтеры × тираж × тип печати)
    for pp in PrintPrice.objects.all():
        d['print_prices'].append({
            'id': pp.id,
            'print_type': pp.print_type,
            'printer_id': pp.printer_id,
            'copies': pp.copies,
            'cost': str(pp.cost),
            'markup_percent': str(pp.markup_percent),
            'price_per_sheet': str(pp.price_per_sheet),
            'created_at': pp.created_at.isoformat() if pp.created_at else None,
            'updated_at': pp.updated_at.isoformat() if pp.updated_at else None,
        })

    # 12. ЦЕНЫ ЛАМИНИРОВАНИЯ (ламинаторы × тираж)
    for lp in LaminatorPrice.objects.all():
        d['laminator_prices'].append({
            'id': lp.id,
            'laminator_id': lp.laminator_id,
            'copies': lp.copies,
            'cost': str(lp.cost),
            'markup_percent': str(lp.markup_percent),
            'price_per_sheet': str(lp.price_per_sheet),
            'created_at': lp.created_at.isoformat() if lp.created_at else None,
            'updated_at': lp.updated_at.isoformat() if lp.updated_at else None,
        })

    # 13. СПОСОБЫ СКРЕПЛЕНИЯ (многостраничное)
    for b in MultipageBinding.objects.all():
        d['multipage_bindings'].append({
            'id': b.id,
            'name': b.name,
            'page_multiple': b.page_multiple,
            'paper_coefficient': str(b.paper_coefficient),
            'description': b.description,
            'order': b.order,
            'default_work_id': b.default_work_id,
        })

    # 14. ШАБЛОНЫ — КАТЕГОРИИ (MPTT)
    for cat in TemplateCategory.objects.all().order_by('tree_id', 'lft'):
        d['template_categories'].append({
            'id': cat.id,
            'name': cat.name,
            'parent_id': cat.parent_id,
            'description': cat.description,
            'order': cat.order,
            'created_at': cat.created_at.isoformat() if cat.created_at else None,
            'updated_at': cat.updated_at.isoformat() if cat.updated_at else None,
            'lft': cat.lft,
            'rght': cat.rght,
            'tree_id': cat.tree_id,
            'level': cat.level,
        })

    # 15. ШАБЛОНЫ — ПРОСЧЁТЫ
    for tpl in ProschetTemplate.objects.all():
        d['proschet_templates'].append({
            'id': tpl.id,
            'name': tpl.name,
            'category_id': tpl.category_id,
            'comment': tpl.comment,
            'circulation': tpl.circulation,
            'source_proschet_id': tpl.source_proschet_id,
            'created_by_id': tpl.created_by_id,
            'position': tpl.position,
            'created_at': tpl.created_at.isoformat() if tpl.created_at else None,
            'updated_at': tpl.updated_at.isoformat() if tpl.updated_at else None,
        })

    # 16. ШАБЛОНЫ — КОМПОНЕНТЫ ПЕЧАТИ
    for tpc in TemplatePrintComponent.objects.all():
        d['template_print_components'].append({
            'id': tpc.id,
            'template_id': tpc.template_id,
            'order': tpc.order,
            'printer_id': tpc.printer_id,
            'paper_id': tpc.paper_id,
            'print_type': tpc.print_type,
            'printing_mode': tpc.printing_mode,
        })

    # 17. ШАБЛОНЫ — ДОП. РАБОТЫ
    for taw in TemplateAdditionalWork.objects.all():
        d['template_additional_works'].append({
            'id': taw.id,
            'template_component_id': taw.template_component_id,
            'work_id': taw.work_id,
            'title': taw.title,
            'cost': str(taw.cost),
            'markup_percent': str(taw.markup_percent),
            'price': str(taw.price),
            'quantity': taw.quantity,
            'formula_type': taw.formula_type,
            'lines_count': taw.lines_count,
            'items_per_sheet': taw.items_per_sheet,
        })

    # 18. ШАБЛОНЫ — ЛАМИНАЦИЯ
    for tlam in TemplateLaminate.objects.all():
        d['template_laminates'].append({
            'id': tlam.id,
            'template_component_id': tlam.template_component_id,
            'is_enabled': tlam.is_enabled,
            'side': tlam.side,
            'laminator_id': tlam.laminator_id,
            'film_id': tlam.film_id,
        })

    # 19. ШАБЛОНЫ — ОДНОСТРАНИЧНЫЕ РАСЧЁТЫ
    for tv in TemplateVichisliniya.objects.all():
        d['template_vichisliniya'].append({
            'id': tv.id,
            'template_component_id': tv.template_component_id,
            'vyleta': tv.vyleta,
            'color': tv.color,
            'item_width': str(tv.item_width),
            'item_height': str(tv.item_height),
            'fit_horizontal': tv.fit_horizontal,
            'fit_vertical': tv.fit_vertical,
            'fit_total': tv.fit_total,
            'fit_landscape_total': tv.fit_landscape_total,
            'fit_portrait_total': tv.fit_portrait_total,
            'fit_selected_orientation': tv.fit_selected_orientation,
            'cuts_count': tv.cuts_count,
        })

    # 20. ШАБЛОНЫ — МНОГОСТРАНИЧНЫЕ РАСЧЁТЫ
    for tmp in TemplateMultipage.objects.all():
        d['template_multipage'].append({
            'id': tmp.id,
            'template_component_id': tmp.template_component_id,
            'binding_id': tmp.binding_id,
            'total_pages': tmp.total_pages,
            'copies': tmp.copies,
            'finished_width': str(tmp.finished_width),
            'finished_height': str(tmp.finished_height),
            'vyleta': tmp.vyleta,
            'color': tmp.color,
            'booklet_orientation': tmp.booklet_orientation,
            'fit_horizontal': tmp.fit_horizontal,
            'fit_vertical': tmp.fit_vertical,
            'fit_total': tmp.fit_total,
            'fit_landscape_total': tmp.fit_landscape_total,
            'fit_portrait_total': tmp.fit_portrait_total,
            'fit_selected_orientation': tmp.fit_selected_orientation,
            'is_active': tmp.is_active,
        })

    # 21. ГРУППЫ ПОЛЬЗОВАТЕЛЕЙ
    # M2M group.permissions сериализуем как список id. При restore (B.2)
    # каждый permission_id прогоняется через get_safe_id(Permission, ...):
    # если permission с таким id есть в целевой БД — связь восстановится,
    # иначе — пропустится (permissions управляются Django через migrate,
    # копировать их как объекты не нужно и опасно).
    for grp in Group.objects.all().order_by('id'):
        d['groups'].append({
            'id': grp.id,
            'name': grp.name,
            'permission_ids': list(grp.permissions.values_list('id', flat=True)),
        })

    # 22. ПОЛЬЗОВАТЕЛИ
    # Сохраняем ВСЕ поля auth.User, включая password (уже хэш — пишем напрямую,
    # без set_password, чтобы не менять хэш). M2M user.groups и
    # user.user_permissions — списками id, при restore через get_safe_id.
    # last_login может быть None — сохраняем как есть.
    for u in User.objects.all().order_by('id'):
        d['users'].append({
            'id': u.id,
            'username': u.username,
            'password': u.password,                                # хэш, не plaintext
            'first_name': u.first_name,
            'last_name': u.last_name,
            'email': u.email,
            'is_staff': u.is_staff,
            'is_active': u.is_active,
            'is_superuser': u.is_superuser,
            'date_joined': u.date_joined.isoformat() if u.date_joined else None,
            'last_login': u.last_login.isoformat() if u.last_login else None,
            'group_ids': list(u.groups.values_list('id', flat=True)),
            'user_permission_ids': list(u.user_permissions.values_list('id', flat=True)),
        })

    # 23. ВЕБ-КАЛЬКУЛЯТОРЫ
    for wc in WebCalculator.objects.all():
        d['web_calculators'].append({
            'id': wc.id,
            'name': wc.name,
            'slug': wc.slug,
            'product_type': wc.product_type,
            'min_circulation': wc.min_circulation,
            'max_circulation': wc.max_circulation,
            'default_circulation': wc.default_circulation,
            'circulation_step': wc.circulation_step,
            'is_active': wc.is_active,
            'comment': wc.comment,
            'order': wc.order,
            'created_at': wc.created_at.isoformat() if wc.created_at else None,
            'updated_at': wc.updated_at.isoformat() if wc.updated_at else None,
        })

    for wc_comp in WebCalculatorComponent.objects.all():
        d['web_calc_components'].append({
            'id': wc_comp.id,
            'calculator_id': wc_comp.calculator_id,
            'name': wc_comp.name,
            'order': wc_comp.order,
            'printer_id': wc_comp.printer_id,
            'allow_color_single': wc_comp.allow_color_single,
            'allow_color_duplex': wc_comp.allow_color_duplex,
            'allow_bw_single': wc_comp.allow_bw_single,
            'allow_bw_duplex': wc_comp.allow_bw_duplex,
            'lamination_enabled': wc_comp.lamination_enabled,
            'laminator_id': wc_comp.laminator_id,
            'allow_lamination_single': wc_comp.allow_lamination_single,
            'allow_lamination_duplex': wc_comp.allow_lamination_duplex,
            'min_width_mm': str(wc_comp.min_width_mm),
            'max_width_mm': str(wc_comp.max_width_mm),
            'min_height_mm': str(wc_comp.min_height_mm),
            'max_height_mm': str(wc_comp.max_height_mm),
            'vyleta_mm': wc_comp.vyleta_mm,
            'binding_id': wc_comp.binding_id,
            'allow_booklet_portrait': wc_comp.allow_booklet_portrait,
            'allow_booklet_landscape': wc_comp.allow_booklet_landscape,
            'min_pages': wc_comp.min_pages,
            'max_pages': wc_comp.max_pages,
            'default_lamination_side': wc_comp.default_lamination_side,
            'default_print_combo': wc_comp.default_print_combo,             # <-- добавили
            'default_paper_id': wc_comp.default_paper_id,                   # <-- добавили
            'default_size_preset_id': wc_comp.default_size_preset_id,       # <-- добавили
        })

    for p in WebCalculatorSizePreset.objects.all():
        d['web_calc_size_presets'].append({
            'id': p.id,
            'component_id': p.component_id,
            'width_mm': str(p.width_mm),
            'height_mm': str(p.height_mm),
            'label': p.label,
            'order': p.order,
        })

    for p in WebCalculatorCirculationPreset.objects.all():
        d['web_calc_circulation_presets'].append({
            'id': p.id,
            'calculator_id': p.calculator_id,
            'value': p.value,
            'order': p.order,
        })

    for p in WebCalculatorQuantityPreset.objects.all():
        d['web_calc_quantity_presets'].append({
            'id': p.id,
            'calculator_id': p.calculator_id,
            'value': p.value,
            'order': p.order,
        })

    for p in WebCalculatorComponentPaper.objects.all():
        d['web_calc_component_papers'].append({
            'id': p.id,
            'component_id': p.component_id,
            'material_id': p.material_id,
            'customer_name': p.customer_name,
            'order': p.order,
        })

    for p in WebCalculatorComponentFilm.objects.all():
        d['web_calc_component_films'].append({
            'id': p.id,
            'component_id': p.component_id,
            'material_id': p.material_id,
            'customer_name': p.customer_name,
            'order': p.order,
        })

    for p in WebCalculatorComponentWork.objects.all():
        d['web_calc_component_works'].append({
            'id': p.id,
            'component_id': p.component_id,
            'work_id': p.work_id,
            'trigger': p.trigger,
            'preview_effect': p.preview_effect,
            'show_quantity': p.show_quantity,
            'order': p.order,
        })

    return data


def create_dictionaries_backup_zip():
    """Создаёт ZIP-архив с JSON-файлом справочников."""
    data = serialize_dictionaries()
    json_str = json.dumps(data, cls=DjangoJSONEncoder, ensure_ascii=False, indent=2)

    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
        date_str = datetime.now().strftime('%Y-%m-%d_%H-%M')
        zip_file.writestr(f'dictionaries_backup_{date_str}.json', json_str)

    zip_buffer.seek(0)
    return zip_buffer


# ============================================================================
# ВОССТАНОВЛЕНИЕ СПРАВОЧНИКОВ (только mode='merge')
# ============================================================================
#
# Режим 'replace' здесь СОЗНАТЕЛЬНО не реализован. Причина — реляционная
# модель: на справочники ссылаются данные через FK с on_delete=PROTECT
# (Printer, Laminator) и SET_NULL. Любая попытка очистить справочник
# (TRUNCATE CASCADE или DELETE) либо уронит данные, либо упадёт на PROTECT.
# Полная замена справочников возможна только ОДНОВРЕМЕННО с данными —
# это делает отдельный эндпоинт api_restore_full_replace (шаг B.4).

def restore_dictionaries_from_zip(zip_file, mode='merge'):
    """
    Восстанавливает справочники из ZIP-архива (созданного
    create_dictionaries_backup_zip).

    mode: 'merge' — умное слияние по id (update_or_create).
          'replace' — ЗАПРЕЩЁН. Бросает ValueError; для полной замены
          используйте api_restore_full_replace (пара «данные+справочники»).

    Вся логика — в одной транзакции. Если что-то падает — БД откатывается.
    """
    if mode != 'merge':
        raise ValueError(
            "Полная замена справочников отдельно запрещена (FK-зависимости "
            "данных). Используйте «Полную замену пары» (данные+справочники)."
        )

    # 1. Читаем ZIP и достаём JSON.
    with zipfile.ZipFile(zip_file) as z:
        json_files = [n for n in z.namelist() if n.endswith('.json')]
        if not json_files:
            raise ValueError("В архиве не найден JSON-файл")
        json_data = z.read(json_files[0]).decode('utf-8')
        data = json.loads(json_data)

    if data.get('version') != '1.0':
        raise ValueError(f"Неподдерживаемая версия архива: {data.get('version')}")

    d = data.get('dictionaries', {})

    def get_safe_id(model, obj_id):
        if not obj_id:
            return None
        return obj_id if model.objects.filter(id=obj_id).exists() else None

    with transaction.atomic():

        # --- 1. ГРУППЫ (до users — user.groups ссылается на них) ---
        # permission_ids применим в самом конце (M2M), после того как
        # восстановлены все permissions-совместимые записи.
        for grp_data in d.get('groups', []):
            Group.objects.update_or_create(
                id=grp_data['id'],
                defaults={'name': grp_data['name']},
            )

        # --- 2. ПОЛЬЗОВАТЕЛИ ---
        # password — уже хэш. НЕ вызываем set_password, пишем как есть.
        # date_joined/last_login — не auto_now, можно передать в defaults.
        for u_data in d.get('users', []):
            User.objects.update_or_create(
                id=u_data['id'],
                defaults={
                    'username': u_data['username'],
                    'password': u_data['password'],
                    'first_name': u_data.get('first_name', ''),
                    'last_name': u_data.get('last_name', ''),
                    'email': u_data.get('email', ''),
                    'is_staff': u_data.get('is_staff', False),
                    'is_active': u_data.get('is_active', True),
                    'is_superuser': u_data.get('is_superuser', False),
                    'date_joined': parse_datetime(u_data['date_joined']) if u_data.get('date_joined') else datetime.now(),
                    'last_login': parse_datetime(u_data['last_login']) if u_data.get('last_login') else None,
                },
            )

        # --- 3. ФОРМАТЫ ЛИСТОВ ---
        for f in d.get('sheet_formats', []):
            SheetFormat.objects.update_or_create(
                id=f['id'],
                defaults={
                    'name': f['name'],
                    'width_mm': f['width_mm'],
                    'height_mm': f['height_mm'],
                },
            )

        # --- 4. ПРИНТЕРЫ ---
        for p in d.get('devices_printers', []):
            pr_obj = Printer.objects.update_or_create(
                id=p['id'],
                defaults={
                    'name': p['name'],
                    'sheet_format_id': get_safe_id(SheetFormat, p.get('sheet_format_id')),
                    'margin_mm': p.get('margin_mm', 5),
                    'duplex_coefficient': p.get('duplex_coefficient', 2.0),
                    'devices_interpolation_method': p.get('devices_interpolation_method', 'linear'),
                },
            )[0]
            time_updates = {}
            if p.get('created_at'):
                time_updates['created_at'] = parse_datetime(p['created_at'])
            if p.get('updated_at'):
                time_updates['updated_at'] = parse_datetime(p['updated_at'])
            if time_updates:
                Printer.objects.filter(id=pr_obj.id).update(**time_updates)

        # --- 5. ЛАМИНАТОРЫ ---
        for l in d.get('devices_laminators', []):
            lam_obj = Laminator.objects.update_or_create(
                id=l['id'],
                defaults={
                    'name': l['name'],
                    'sheet_format_id': get_safe_id(SheetFormat, l.get('sheet_format_id')),
                    'margin_mm': l.get('margin_mm', 5),
                    'duplex_coefficient': l.get('duplex_coefficient', 2.0),
                    'laminator_interpolation_method': l.get('laminator_interpolation_method', 'linear'),
                },
            )[0]
            time_updates = {}
            if l.get('created_at'):
                time_updates['created_at'] = parse_datetime(l['created_at'])
            if l.get('updated_at'):
                time_updates['updated_at'] = parse_datetime(l['updated_at'])
            if time_updates:
                Laminator.objects.filter(id=lam_obj.id).update(**time_updates)

        # --- 6. СКЛАД: КАТЕГОРИИ (MPTT) ---
        # Первый проход: без parent_id (создаём узлы как корневые).
        for cat in d.get('sklad_categories', []):
            SkladCategory.objects.update_or_create(
                id=cat['id'],
                defaults={
                    'name': cat['name'],
                    'type': cat.get('type', 'paper'),
                    'description': cat.get('description'),
                },
            )
        # Второй проход: проставляем parent_id через .update() — MPTT
        # перестроит lft/rght/tree_id/level в rebuild() ниже.
        for cat in d.get('sklad_categories', []):
            if cat.get('parent_id'):
                SkladCategory.objects.filter(id=cat['id']).update(
                    parent_id=cat['parent_id']
                )
        # Исторические даты для категорий.
        for cat in d.get('sklad_categories', []):
            time_updates = {}
            if cat.get('created_at'):
                time_updates['created_at'] = parse_datetime(cat['created_at'])
            if cat.get('updated_at'):
                time_updates['updated_at'] = parse_datetime(cat['updated_at'])
            if time_updates:
                SkladCategory.objects.filter(id=cat['id']).update(**time_updates)

        # --- 7. СКЛАД: МАТЕРИАЛЫ ---
        for m in d.get('sklad_materials', []):
            mat_obj = Material.objects.update_or_create(
                id=m['id'],
                defaults={
                    'name': m['name'],
                    'category_id': get_safe_id(SkladCategory, m.get('category_id')),
                    'type': m.get('type', 'paper'),
                    'unit': m.get('unit', 'лист'),
                    'cost': Decimal(m['cost']) if m.get('cost') is not None else None,
                    'markup_percent': Decimal(m['markup_percent']) if m.get('markup_percent') is not None else None,
                    'density': m.get('density'),
                    'paper_thickness': Decimal(m['paper_thickness']) if m.get('paper_thickness') is not None else None,
                    'thickness': m.get('thickness'),
                    'quantity': m.get('quantity', 0),
                    'min_quantity': m.get('min_quantity', 10),
                    'characteristics': m.get('characteristics') or {},
                    'notes': m.get('notes'),
                    'is_active': m.get('is_active', True),
                    'position': m.get('position', 0), 
                },
            )[0]
            time_updates = {}
            if m.get('created_at'):
                time_updates['created_at'] = parse_datetime(m['created_at'])
            if m.get('updated_at'):
                time_updates['updated_at'] = parse_datetime(m['updated_at'])
            if time_updates:
                Material.objects.filter(id=mat_obj.id).update(**time_updates)

        # --- 8. ТОВАРЫ: КАТЕГОРИИ (MPTT) ---
        for cat in d.get('tovary_categories', []):
            TovarCategory.objects.update_or_create(
                id=cat['id'],
                defaults={
                    'name': cat['name'],
                    'is_deleted': cat.get('is_deleted', False),
                },
            )
        for cat in d.get('tovary_categories', []):
            if cat.get('parent_id'):
                TovarCategory.objects.filter(id=cat['id']).update(
                    parent_id=cat['parent_id']
                )
        for cat in d.get('tovary_categories', []):
            time_updates = {}
            if cat.get('created_at'):
                time_updates['created_at'] = parse_datetime(cat['created_at'])
            if cat.get('updated_at'):
                time_updates['updated_at'] = parse_datetime(cat['updated_at'])
            if time_updates:
                TovarCategory.objects.filter(id=cat['id']).update(**time_updates)

        # --- 9. ТОВАРЫ ---
        for t in d.get('tovary_tovary', []):
            tv_obj = Tovar.objects.update_or_create(
                id=t['id'],
                defaults={
                    'name': t['name'],
                    'category_id': get_safe_id(TovarCategory, t.get('category_id')),
                    'category_old': t.get('category_old', ''),
                    'article': t.get('article', ''),
                    'price': Decimal(t.get('price', '0')),
                    'unit': t.get('unit', 'шт.'),
                    'is_deleted': t.get('is_deleted', False),
                },
            )[0]
            time_updates = {}
            if t.get('created_at'):
                time_updates['created_at'] = parse_datetime(t['created_at'])
            if t.get('updated_at'):
                time_updates['updated_at'] = parse_datetime(t['updated_at'])
            if time_updates:
                Tovar.objects.filter(id=tv_obj.id).update(**time_updates)

        # --- 10. РАБОТЫ ---
        # ВНИМАНИЕ: Work.save() пересчитывает price = cost + cost*markup/100.
        # Значение price из JSON фактически игнорируется — оно детерминировано
        # из cost+markup. Это соответствует логике модели.
        for w in d.get('works', []):
            w_obj = Work.objects.update_or_create(
                id=w['id'],
                defaults={
                    'name': w['name'],
                    'cost': Decimal(w.get('cost', '0')),
                    'markup_percent': Decimal(w.get('markup_percent', '0')),
                    'price': Decimal(w.get('price', '0')),
                    'formula_type': w.get('formula_type', 1),
                    'interpolation_method': w.get('interpolation_method', 'linear'),
                    'k_lines': Decimal(w.get('k_lines', '2.0')),
                    'default_lines_count': w.get('default_lines_count', 1),
                    'default_items_per_sheet': w.get('default_items_per_sheet', 1),
                },
            )[0]
            time_updates = {}
            if w.get('created_at'):
                time_updates['created_at'] = parse_datetime(w['created_at'])
            if w.get('updated_at'):
                time_updates['updated_at'] = parse_datetime(w['updated_at'])
            if time_updates:
                Work.objects.filter(id=w_obj.id).update(**time_updates)

        # --- 11. РАБОТЫ: ЦЕНЫ ПО ЛИСТАМ ---
        for wp in d.get('work_prices', []):
            wp_obj = WorkPrice.objects.update_or_create(
                id=wp['id'],
                defaults={
                    'work_id': get_safe_id(Work, wp.get('work_id')),
                    'sheets': wp['sheets'],
                    'price': Decimal(wp.get('price', '0')),
                },
            )[0]
            time_updates = {}
            if wp.get('created_at'):
                time_updates['created_at'] = parse_datetime(wp['created_at'])
            if wp.get('updated_at'):
                time_updates['updated_at'] = parse_datetime(wp['updated_at'])
            if time_updates:
                WorkPrice.objects.filter(id=wp_obj.id).update(**time_updates)

        # --- 12. РАБОТЫ: ЦЕНЫ ПО ТИРАЖУ ---
        for wcp in d.get('work_circulation_prices', []):
            wcp_obj = WorkCirculationPrice.objects.update_or_create(
                id=wcp['id'],
                defaults={
                    'work_id': get_safe_id(Work, wcp.get('work_id')),
                    'circulation': wcp['circulation'],
                    'price': Decimal(wcp.get('price', '0')),
                },
            )[0]
            time_updates = {}
            if wcp.get('created_at'):
                time_updates['created_at'] = parse_datetime(wcp['created_at'])
            if wcp.get('updated_at'):
                time_updates['updated_at'] = parse_datetime(wcp['updated_at'])
            if time_updates:
                WorkCirculationPrice.objects.filter(id=wcp_obj.id).update(**time_updates)

        # --- 13. ЦЕНЫ ПЕЧАТИ ---
        # ВНИМАНИЕ: PrintPrice.save() пересчитывает price_per_sheet.
        for pp in d.get('print_prices', []):
            pp_obj = PrintPrice.objects.update_or_create(
                id=pp['id'],
                defaults={
                    'print_type': pp.get('print_type', 'color'),
                    'printer_id': get_safe_id(Printer, pp.get('printer_id')),
                    'copies': pp['copies'],
                    'cost': Decimal(pp.get('cost', '0')),
                    'markup_percent': Decimal(pp.get('markup_percent', '0')),
                    'price_per_sheet': Decimal(pp.get('price_per_sheet', '0')),
                },
            )[0]
            time_updates = {}
            if pp.get('created_at'):
                time_updates['created_at'] = parse_datetime(pp['created_at'])
            if pp.get('updated_at'):
                time_updates['updated_at'] = parse_datetime(pp['updated_at'])
            if time_updates:
                PrintPrice.objects.filter(id=pp_obj.id).update(**time_updates)

        # --- 14. ЦЕНЫ ЛАМИНИРОВАНИЯ ---
        for lp in d.get('laminator_prices', []):
            lp_obj = LaminatorPrice.objects.update_or_create(
                id=lp['id'],
                defaults={
                    'laminator_id': get_safe_id(Laminator, lp.get('laminator_id')),
                    'copies': lp['copies'],
                    'cost': Decimal(lp.get('cost', '0')),
                    'markup_percent': Decimal(lp.get('markup_percent', '0')),
                    'price_per_sheet': Decimal(lp.get('price_per_sheet', '0')),
                },
            )[0]
            time_updates = {}
            if lp.get('created_at'):
                time_updates['created_at'] = parse_datetime(lp['created_at'])
            if lp.get('updated_at'):
                time_updates['updated_at'] = parse_datetime(lp['updated_at'])
            if time_updates:
                LaminatorPrice.objects.filter(id=lp_obj.id).update(**time_updates)

        # --- 15. СПОСОБЫ СКРЕПЛЕНИЯ ---
        for b in d.get('multipage_bindings', []):
            MultipageBinding.objects.update_or_create(
                id=b['id'],
                defaults={
                    'name': b['name'],
                    'page_multiple': b.get('page_multiple', 1),
                    'paper_coefficient': Decimal(b.get('paper_coefficient', '1.0')),
                    'description': b.get('description', ''),
                    'order': b.get('order', 0),
                    'default_work_id': get_safe_id(Work, b.get('default_work_id')),
                },
            )

        # --- 16. ШАБЛОНЫ: КАТЕГОРИИ (MPTT) ---
        for cat in d.get('template_categories', []):
            TemplateCategory.objects.update_or_create(
                id=cat['id'],
                defaults={
                    'name': cat['name'],
                    'description': cat.get('description', ''),
                    'order': cat.get('order', 0),
                },
            )
        for cat in d.get('template_categories', []):
            if cat.get('parent_id'):
                TemplateCategory.objects.filter(id=cat['id']).update(
                    parent_id=cat['parent_id']
                )
        for cat in d.get('template_categories', []):
            time_updates = {}
            if cat.get('created_at'):
                time_updates['created_at'] = parse_datetime(cat['created_at'])
            if cat.get('updated_at'):
                time_updates['updated_at'] = parse_datetime(cat['updated_at'])
            if time_updates:
                TemplateCategory.objects.filter(id=cat['id']).update(**time_updates)

        # --- 17. ШАБЛОНЫ: ПРОСЧЁТЫ ---
        # source_proschet_id = None: справочники восстанавливаются ДО данных,
        # просчётов в БД ещё нет. Обновим после restore_from_zip (B.4).
        for tpl in d.get('proschet_templates', []):
            tpl_obj = ProschetTemplate.objects.update_or_create(
                id=tpl['id'],
                defaults={
                    'name': tpl['name'],
                    'category_id': get_safe_id(TemplateCategory, tpl.get('category_id')),
                    'comment': tpl.get('comment', ''),
                    'circulation': tpl.get('circulation', 100),
                    'source_proschet_id': None,
                    'created_by_id': get_safe_id(User, tpl.get('created_by_id')),
                    'position': tpl.get('position', 0),
                },
            )[0]
            time_updates = {}
            if tpl.get('created_at'):
                time_updates['created_at'] = parse_datetime(tpl['created_at'])
            if tpl.get('updated_at'):
                time_updates['updated_at'] = parse_datetime(tpl['updated_at'])
            if time_updates:
                ProschetTemplate.objects.filter(id=tpl_obj.id).update(**time_updates)

        # --- 18. ШАБЛОНЫ: КОМПОНЕНТЫ ПЕЧАТИ ---
        for tpc in d.get('template_print_components', []):
            TemplatePrintComponent.objects.update_or_create(
                id=tpc['id'],
                defaults={
                    'template_id': get_safe_id(ProschetTemplate, tpc.get('template_id')),
                    'order': tpc.get('order', 0),
                    'printer_id': get_safe_id(Printer, tpc.get('printer_id')),
                    'paper_id': get_safe_id(Material, tpc.get('paper_id')),
                    'print_type': tpc.get('print_type', 'color'),
                    'printing_mode': tpc.get('printing_mode', 'single'),
                },
            )

        # --- 19. ШАБЛОНЫ: ДОП. РАБОТЫ ---
        # TemplateAdditionalWork.save() копирует поля из Work — price тоже
        # пересчитывается. Это согласуется с моделью.
        for taw in d.get('template_additional_works', []):
            TemplateAdditionalWork.objects.update_or_create(
                id=taw['id'],
                defaults={
                    'template_component_id': get_safe_id(TemplatePrintComponent, taw.get('template_component_id')),
                    'work_id': get_safe_id(Work, taw.get('work_id')),
                    'title': taw.get('title', ''),
                    'cost': Decimal(taw.get('cost', '0')),
                    'markup_percent': Decimal(taw.get('markup_percent', '0')),
                    'price': Decimal(taw.get('price', '0')),
                    'quantity': taw.get('quantity', 1),
                    'formula_type': taw.get('formula_type', 1),
                    'lines_count': taw.get('lines_count', 1),
                    'items_per_sheet': taw.get('items_per_sheet', 1),
                },
            )

        # --- 20. ШАБЛОНЫ: ЛАМИНАЦИЯ ---
        for tlam in d.get('template_laminates', []):
            TemplateLaminate.objects.update_or_create(
                id=tlam['id'],
                defaults={
                    'template_component_id': get_safe_id(TemplatePrintComponent, tlam.get('template_component_id')),
                    'is_enabled': tlam.get('is_enabled', False),
                    'side': tlam.get('side', 'single'),
                    'laminator_id': get_safe_id(Laminator, tlam.get('laminator_id')),
                    'film_id': get_safe_id(Material, tlam.get('film_id')),
                },
            )

        # --- 21. ШАБЛОНЫ: ОДНОСТРАНИЧНЫЕ РАСЧЁТЫ ---
        for tv in d.get('template_vichisliniya', []):
            TemplateVichisliniya.objects.update_or_create(
                id=tv['id'],
                defaults={
                    'template_component_id': get_safe_id(TemplatePrintComponent, tv.get('template_component_id')),
                    'vyleta': tv.get('vyleta', 1),
                    'color': tv.get('color', '4+0'),
                    'item_width': Decimal(tv.get('item_width', '0')),
                    'item_height': Decimal(tv.get('item_height', '0')),
                    'fit_horizontal': tv.get('fit_horizontal', 0),
                    'fit_vertical': tv.get('fit_vertical', 0),
                    'fit_total': tv.get('fit_total', 0),
                    'fit_landscape_total': tv.get('fit_landscape_total', 0),
                    'fit_portrait_total': tv.get('fit_portrait_total', 0),
                    'fit_selected_orientation': tv.get('fit_selected_orientation', 'auto'),
                    'cuts_count': tv.get('cuts_count', 0),
                },
            )

        # --- 22. ШАБЛОНЫ: МНОГОСТРАНИЧНЫЕ РАСЧЁТЫ ---
        for tmp in d.get('template_multipage', []):
            TemplateMultipage.objects.update_or_create(
                id=tmp['id'],
                defaults={
                    'template_component_id': get_safe_id(TemplatePrintComponent, tmp.get('template_component_id')),
                    'binding_id': get_safe_id(MultipageBinding, tmp.get('binding_id')),
                    'total_pages': tmp.get('total_pages', 4),
                    'copies': tmp.get('copies', 1),
                    'finished_width': Decimal(tmp.get('finished_width', '0')),
                    'finished_height': Decimal(tmp.get('finished_height', '0')),
                    'vyleta': tmp.get('vyleta', 1),
                    'color': tmp.get('color', '4+0'),
                    'booklet_orientation': tmp.get('booklet_orientation', 'portrait'),
                    'fit_horizontal': tmp.get('fit_horizontal', 0),
                    'fit_vertical': tmp.get('fit_vertical', 0),
                    'fit_total': tmp.get('fit_total', 0),
                    'fit_landscape_total': tmp.get('fit_landscape_total', 0),
                    'fit_portrait_total': tmp.get('fit_portrait_total', 0),
                    'fit_selected_orientation': tmp.get('fit_selected_orientation', 'auto'),
                    'is_active': tmp.get('is_active', False),
                },
            )

        # --- 23. M2M: ГРУППЫ ↔ PERMISSIONS ---
        # get_safe_id(Permission, pid): если permission с таким id есть в
        # целевой БД (а он есть, если кодовая база совпадает) — связь
        # восстановится. Если нет — пропустим (не падаем).
        for grp_data in d.get('groups', []):
            try:
                grp_obj = Group.objects.get(id=grp_data['id'])
            except Group.DoesNotExist:
                continue
            perm_ids = [
                get_safe_id(Permission, pid)
                for pid in grp_data.get('permission_ids', [])
            ]
            perm_ids = [pid for pid in perm_ids if pid]
            grp_obj.permissions.set(perm_ids)

        # --- 24. M2M: ПОЛЬЗОВАТЕЛИ ↔ ГРУППЫ / PERMISSIONS ---
        for u_data in d.get('users', []):
            try:
                u_obj = User.objects.get(id=u_data['id'])
            except User.DoesNotExist:
                continue
            grp_ids = [
                get_safe_id(Group, gid)
                for gid in u_data.get('group_ids', [])
            ]
            grp_ids = [gid for gid in grp_ids if gid]
            u_obj.groups.set(grp_ids)

            up_ids = [
                get_safe_id(Permission, pid)
                for pid in u_data.get('user_permission_ids', [])
            ]
            up_ids = [pid for pid in up_ids if pid]
            u_obj.user_permissions.set(up_ids)

        # --- 23. ВЕБ-КАЛЬКУЛЯТОРЫ ---
        for wc in d.get('web_calculators', []):
            wc_obj = WebCalculator.objects.update_or_create(
                id=wc['id'],
                defaults={
                    'name': wc['name'],
                    'slug': wc['slug'],
                    'product_type': wc.get('product_type', 'single'),
                    'min_circulation': wc.get('min_circulation', 1),
                    'max_circulation': wc.get('max_circulation', 1000),
                    'default_circulation': wc.get('default_circulation', 100),
                    'circulation_step': wc.get('circulation_step', 50),
                    'is_active': wc.get('is_active', True),
                    'comment': wc.get('comment', ''),
                    'order': wc.get('order', 0),
                }
            )[0]
            time_updates = {}
            if wc.get('created_at'):
                time_updates['created_at'] = parse_datetime(wc['created_at'])
            if wc.get('updated_at'):
                time_updates['updated_at'] = parse_datetime(wc['updated_at'])
            if time_updates:
                WebCalculator.objects.filter(id=wc_obj.id).update(**time_updates)

        # --- 24. ПРЕСЕТЫ ТИРАЖА И КОЛИЧЕСТВА ---
        for p in d.get('web_calc_circulation_presets', []):
            WebCalculatorCirculationPreset.objects.update_or_create(
                id=p['id'],
                defaults={
                    'calculator_id': get_safe_id(WebCalculator, p.get('calculator_id')),
                    'value': p['value'],
                    'order': p.get('order', 0),
                }
            )
        for p in d.get('web_calc_quantity_presets', []):
            WebCalculatorQuantityPreset.objects.update_or_create(
                id=p['id'],
                defaults={
                    'calculator_id': get_safe_id(WebCalculator, p.get('calculator_id')),
                    'value': p['value'],
                    'order': p.get('order', 0),
                }
            )

        # --- 25. КОМПОНЕНТЫ ВЕБ-КАЛЬКУЛЯТОРОВ ---
        for comp in d.get('web_calc_components', []):
            WebCalculatorComponent.objects.update_or_create(
                id=comp['id'],
                defaults={
                    'calculator_id': get_safe_id(WebCalculator, comp.get('calculator_id')),
                    'name': comp.get('name', 'Основной'),
                    'order': comp.get('order', 1),
                    'printer_id': get_safe_id(Printer, comp.get('printer_id')),
                    'allow_color_single': comp.get('allow_color_single', False),
                    'allow_color_duplex': comp.get('allow_color_duplex', False),
                    'allow_bw_single': comp.get('allow_bw_single', False),
                    'allow_bw_duplex': comp.get('allow_bw_duplex', False),
                    'lamination_enabled': comp.get('lamination_enabled', False),
                    'laminator_id': get_safe_id(Laminator, comp.get('laminator_id')),
                    'allow_lamination_single': comp.get('allow_lamination_single', False),
                    'allow_lamination_duplex': comp.get('allow_lamination_duplex', False),
                    'min_width_mm': Decimal(comp.get('min_width_mm', '60')),
                    'max_width_mm': Decimal(comp.get('max_width_mm', '120')),
                    'min_height_mm': Decimal(comp.get('min_height_mm', '40')),
                    'max_height_mm': Decimal(comp.get('max_height_mm', '120')),
                    'vyleta_mm': comp.get('vyleta_mm', 4),
                    'binding_id': get_safe_id(MultipageBinding, comp.get('binding_id')),
                    'allow_booklet_portrait': comp.get('allow_booklet_portrait', True),
                    'allow_booklet_landscape': comp.get('allow_booklet_landscape', False),
                    'min_pages': comp.get('min_pages', 4),
                    'max_pages': comp.get('max_pages', 64),
                    'default_lamination_side': comp.get('default_lamination_side', 'single'),
                    'default_print_combo': comp.get('default_print_combo', 'color_single'),      # <-- добавили
                    'default_paper_id': None,  # <--- ВРЕМЕННО СТАВИМ None
                    'default_size_preset_id': None,  # <--- ВРЕМЕННО СТАВИМ None
                }
            )

        # --- 26. ПРЕСЕТЫ РАЗМЕРОВ ---
        for p in d.get('web_calc_size_presets', []):
            WebCalculatorSizePreset.objects.update_or_create(
                id=p['id'],
                defaults={
                    'component_id': get_safe_id(WebCalculatorComponent, p.get('component_id')),
                    'width_mm': Decimal(p.get('width_mm', '0')),
                    'height_mm': Decimal(p.get('height_mm', '0')),
                    'label': p.get('label', ''),
                    'order': p.get('order', 0),
                }
            )

        # --- 27. ДОСТУПНЫЕ МАТЕРИАЛЫ И РАБОТЫ ВЕБ-КАЛЬКУЛЯТОРА ---
        for p in d.get('web_calc_component_papers', []):
            WebCalculatorComponentPaper.objects.update_or_create(
                id=p['id'],
                defaults={
                    'component_id': get_safe_id(WebCalculatorComponent, p.get('component_id')),
                    'material_id': get_safe_id(Material, p.get('material_id')),
                    'customer_name': p.get('customer_name', ''),
                    'order': p.get('order', 0),
                }
            )
        for p in d.get('web_calc_component_films', []):
            WebCalculatorComponentFilm.objects.update_or_create(
                id=p['id'],
                defaults={
                    'component_id': get_safe_id(WebCalculatorComponent, p.get('component_id')),
                    'material_id': get_safe_id(Material, p.get('material_id')),
                    'customer_name': p.get('customer_name', ''),
                    'order': p.get('order', 0),
                }
            )
        for p in d.get('web_calc_component_works', []):
            WebCalculatorComponentWork.objects.update_or_create(
                id=p['id'],
                defaults={
                    'component_id': get_safe_id(WebCalculatorComponent, p.get('component_id')),
                    'work_id': get_safe_id(Work, p.get('work_id')),
                    'trigger': p.get('trigger', 'optional'),
                    'preview_effect': p.get('preview_effect', 'none'),
                    'show_quantity': p.get('show_quantity', False),
                    'order': p.get('order', 0),
                }
            )

        # --- 28. REBUILD MPTT-ДЕРЕВЬЕВ ---
        # Надёжный способ гарантировать целостность: MPTT сам пересчитает
        # lft/rght/tree_id/level по parent_id. Сохранённые в JSON MPTT-поля
        # намеренно игнорируются (см. serialize_dictionaries).
        SkladCategory.objects.rebuild()
        TovarCategory.objects.rebuild()
        TemplateCategory.objects.rebuild()
        # --- ФИНАЛЬНЫЙ ПРОХОД: Обновление дефолтных связей Веб-калькуляторов ---
        for comp in d.get('web_calc_components', []):
            defaults = {}
            if comp.get('default_paper_id'):
                defaults['default_paper_id'] = get_safe_id(WebCalculatorComponentPaper, comp['default_paper_id'])
            if comp.get('default_size_preset_id'):
                defaults['default_size_preset_id'] = get_safe_id(WebCalculatorSizePreset, comp['default_size_preset_id'])
            
            if defaults:
                WebCalculatorComponent.objects.filter(id=comp['id']).update(**defaults)

    return True