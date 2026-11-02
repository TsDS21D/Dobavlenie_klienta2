import json
import zipfile
import io
from datetime import datetime
from decimal import Decimal

from django.core.serializers.json import DjangoJSONEncoder

from baza_klientov.models import Client, LegalEntity, ContactPerson
from calculator.models_list_proschet import Proschet, PrintComponent, AdditionalWork
from calculator.models_lamination import Laminate
from vichisliniya_listov.models import VichisliniyaListovModel
from vichisliniya_listov.multipage_models import VichisliniyaMultipageModel
from .models import (Order, Product, ProductPrintComponent, 
                     ProductAdditionalWork, ProductLaminate, 
                     ProductVichisliniya, ProductMultipage)

def serialize_data():
    """
    Собирает абсолютно все данные из базы в один большой словарь (dict).
    Использует DjangoJSONEncoder для корректной сериализации Decimal и datetime.
    """
    data = {
        'version': '1.0',
        'export_date': datetime.now().isoformat(),
        'clients': [],
        'legal_entities': [],
        'contact_persons': [],
        'proschets': [],
        'orders': []
    }

    # 1. КЛИЕНТЫ (включая юрлица и сотрудников)
    for c in Client.objects.all():
        data['clients'].append({
            'id': c.id, 'name': c.name, 'discount': str(c.discount) if c.discount else '0',
            'address': c.address, 'has_edo': c.has_edo, 'is_deleted': c.is_deleted
        })
    for le in LegalEntity.objects.all():
        data['legal_entities'].append({
            'id': le.id, 'client_id': le.client_id, 'name': le.name,
            'is_primary': le.is_primary, 'is_deleted': le.is_deleted
        })
    for cp in ContactPerson.objects.all():
        data['contact_persons'].append({
            'id': cp.id, 'client_id': cp.client_id, 'full_name': cp.full_name,
            'mobile': cp.mobile, 'phone': cp.phone, 'is_primary': cp.is_primary,
            'is_deleted': cp.is_deleted
        })

    # 2. ПРОСЧЁТЫ (и вся их структура)
    for p in Proschet.objects.all():
        p_data = {
            'id': p.id, 'number': p.number, 'title': p.title, 'circulation': p.circulation,
            'client_id': p.client_id, 'comment': p.comment, 'source_order_id': p.source_order_id,
            'source_template_id': p.source_template_id, 'is_deleted': p.is_deleted,
            'print_components': []
        }
        for comp in p.print_components.all():
            comp_data = {
                'id': comp.id, 'number': comp.number, 'printer_id': comp.printer_id,
                'paper_id': comp.paper_id, 'print_type': comp.print_type,
                'printing_mode': comp.printing_mode, 'color_mode': comp.color_mode,
                'price_per_sheet': str(comp.price_per_sheet) if comp.price_per_sheet else '0',
                'is_price_calculated': comp.is_price_calculated,
                'total_circulation_price': str(comp.total_circulation_price) if comp.total_circulation_price else '0',
                'is_deleted': comp.is_deleted,
                'works': [],
                'lamination': None,
                'vichisliniya': None,
                'multipage': None
            }
            for w in comp.additional_works.all():
                comp_data['works'].append({
                    'id': w.id, 'work_id': w.work_id, 'number': w.number, 'title': w.title,
                    'cost': str(w.cost), 'markup_percent': str(w.markup_percent),
                    'price': str(w.price), 'quantity': w.quantity, 'formula_type': w.formula_type,
                    'lines_count': w.lines_count, 'items_per_sheet': w.items_per_sheet,
                    'total_price': str(w.total_price), 'is_deleted': w.is_deleted
                })
            
            try:
                lam = comp.lamination
                comp_data['lamination'] = {
                    'id': lam.id, 'is_enabled': lam.is_enabled, 'side': lam.side,
                    'laminator_id': lam.laminator_id, 'film_id': lam.film_id,
                    'laminator_cost': str(lam.laminator_cost), 'laminator_markup': str(lam.laminator_markup),
                    'laminator_price': str(lam.laminator_price), 'film_price': str(lam.film_price),
                    'total_price': str(lam.total_price)
                }
            except Laminate.DoesNotExist:
                pass

            try:
                v = comp.vichisliniya_listov_data
                comp_data['vichisliniya'] = {
                    'id': v.id, 'vyleta': v.vichisliniya_listov_vyleta,
                    'polosa_count': v.vichisliniya_listov_polosa_count,
                    'color': v.vichisliniya_listov_color, 'item_width': str(v.vichisliniya_listov_item_width),
                    'item_height': str(v.vichisliniya_listov_item_height),
                    'fit_horizontal': v.vichisliniya_listov_fit_horizontal,
                    'fit_vertical': v.vichisliniya_listov_fit_vertical,
                    'fit_total': v.vichisliniya_listov_fit_total,
                    'fit_landscape_total': v.vichisliniya_listov_fit_landscape_total,
                    'fit_portrait_total': v.vichisliniya_listov_fit_portrait_total,
                    'fit_selected_orientation': v.vichisliniya_listov_fit_selected_orientation,
                    'list_count': str(v.vichisliniya_listov_list_count),
                    'cuts_count': v.vichisliniya_listov_cuts_count
                }
            except VichisliniyaListovModel.DoesNotExist:
                pass

            try:
                mp = comp.multipage_data
                comp_data['multipage'] = {
                    'id': mp.id, 'binding_id': mp.binding_id, 'total_pages': mp.total_pages,
                    'copies': mp.copies, 'finished_width': str(mp.finished_width),
                    'finished_height': str(mp.finished_height), 'vyleta': mp.vyleta,
                    'color': mp.color, 'booklet_orientation': mp.booklet_orientation,
                    'fit_horizontal': mp.fit_horizontal, 'fit_vertical': mp.fit_vertical,
                    'fit_total': mp.fit_total, 'fit_landscape_total': mp.fit_landscape_total,
                    'fit_portrait_total': mp.fit_portrait_total,
                    'fit_selected_orientation': mp.fit_selected_orientation,
                    'sheet_count': str(mp.sheet_count), 'is_active': mp.is_active
                }
            except VichisliniyaMultipageModel.DoesNotExist:
                pass

            p_data['print_components'].append(comp_data)
        data['proschets'].append(p_data)

    # 3. ЗАКАЗЫ (и вся их глубокая структура)
    for o in Order.objects.all():
        o_data = {
            'id': o.id, 'number': o.number, 'client_id': o.client_id,
            'legal_entity_id': o.legal_entity_id, 'contact_person_id': o.contact_person_id,
            'status': o.status, 'is_paid': o.is_paid, 'payer_type': o.payer_type,
            'invoice_number': o.invoice_number, 'payment_method': o.payment_method,
            'documents_status': o.documents_status, 'is_delivery': o.is_delivery,
            'delivery_date': o.delivery_date.isoformat() if o.delivery_date else None,
            'delivery_address': o.delivery_address, 'delivery_phone': o.delivery_phone,
            'delivery_status': o.delivery_status, 'is_courier_ordered': o.is_courier_ordered,
            'ready_datetime': o.ready_datetime.isoformat() if o.ready_datetime else None,
            'comment': o.comment, 'created_at': o.created_at.isoformat() if o.created_at else None,
            'is_deleted': o.is_deleted, 'products': []
        }
        for prod in o.products.all():
            prod_data = {
                'id': prod.id, 'source_proschet_id': prod.source_proschet_id,
                'source_template_id': prod.source_template_id, 'title': prod.title,
                'circulation': prod.circulation, 'position': prod.position,
                'total_price': str(prod.total_price),
                'frozen_total_mass_g': str(prod.frozen_total_mass_g),
                'frozen_total_volume_cm3': str(prod.frozen_total_volume_cm3),
                'frozen_stacks': prod.frozen_stacks, 'is_deleted': prod.is_deleted,
                'components': []
            }
            for comp in prod.components.all():
                comp_data = {
                    'id': comp.id, 'position': comp.position, 'number': comp.number,
                    'printer_id': comp.printer_id, 'paper_id': comp.paper_id,
                    'print_type': comp.print_type, 'printing_mode': comp.printing_mode,
                    'color_mode': comp.color_mode, 'price_per_sheet': str(comp.price_per_sheet) if comp.price_per_sheet else None,
                    'is_price_calculated': comp.is_price_calculated,
                    'total_circulation_price': str(comp.total_circulation_price),
                    'sheet_count': str(comp.sheet_count), 'runs_count': comp.runs_count,
                    'material_price': str(comp.material_price),
                    'paper_density': str(comp.paper_density), 'paper_thickness': str(comp.paper_thickness),
                    'works': [], 'lamination': None, 'vichisliniya': None, 'multipage': None
                }
                
                for w in comp.works.all():
                    comp_data['works'].append({
                        'id': w.id, 'work_id': w.work_id, 'number': w.number,
                        'title': w.title, 'cost': str(w.cost), 'markup_percent': str(w.markup_percent),
                        'price': str(w.price), 'quantity': w.quantity, 'formula_type': w.formula_type,
                        'lines_count': w.lines_count, 'items_per_sheet': w.items_per_sheet,
                        'total_price': str(w.total_price), 'is_deleted': w.is_deleted
                    })
                
                try:
                    lam = comp.lamination
                    comp_data['lamination'] = {
                        'id': lam.id, 'is_enabled': lam.is_enabled, 'side': lam.side,
                        'laminator_id': lam.laminator_id, 'film_id': lam.film_id,
                        'laminator_cost': str(lam.laminator_cost), 'laminator_markup': str(lam.laminator_markup),
                        'laminator_price': str(lam.laminator_price), 'film_price': str(lam.film_price),
                        'film_thickness': str(lam.film_thickness) if lam.film_thickness else None,
                        'total_price': str(lam.total_price)
                    }
                except ProductLaminate.DoesNotExist:
                    pass

                try:
                    v = comp.vichisliniya
                    comp_data['vichisliniya'] = {
                        'id': v.id, 'vyleta': v.vyleta, 'polosa_count': v.polosa_count,
                        'color': v.color, 'item_width': str(v.item_width), 'item_height': str(v.item_height),
                        'fit_horizontal': v.fit_horizontal, 'fit_vertical': v.fit_vertical,
                        'fit_total': v.fit_total, 'fit_landscape_total': v.fit_landscape_total,
                        'fit_portrait_total': v.fit_portrait_total,
                        'fit_selected_orientation': v.fit_selected_orientation,
                        'list_count': str(v.list_count), 'cuts_count': v.cuts_count
                    }
                except ProductVichisliniya.DoesNotExist:
                    pass

                try:
                    mp = comp.multipage
                    comp_data['multipage'] = {
                        'id': mp.id, 'binding_id': mp.binding_id, 'total_pages': mp.total_pages,
                        'copies': mp.copies, 'finished_width': str(mp.finished_width),
                        'finished_height': str(mp.finished_height), 'vyleta': mp.vyleta,
                        'color': mp.color, 'booklet_orientation': mp.booklet_orientation,
                        'fit_horizontal': mp.fit_horizontal, 'fit_vertical': mp.fit_vertical,
                        'fit_total': mp.fit_total, 'fit_landscape_total': mp.fit_landscape_total,
                        'fit_portrait_total': mp.fit_portrait_total,
                        'fit_selected_orientation': mp.fit_selected_orientation,
                        'sheet_count': str(mp.sheet_count), 'is_active': mp.is_active
                    }
                except ProductMultipage.DoesNotExist:
                    pass
                
                prod_data['components'].append(comp_data)
            o_data['products'].append(prod_data)
        data['orders'].append(o_data)
        
    return data

def create_backup_zip():
    """Создает ZIP архив с JSON файлом внутри."""
    data = serialize_data()
    json_str = json.dumps(data, cls=DjangoJSONEncoder, ensure_ascii=False, indent=2)
    
    # Создаем ZIP в памяти
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
        date_str = datetime.now().strftime('%Y-%m-%d_%H-%M')
        zip_file.writestr(f'orders_backup_{date_str}.json', json_str)
    
    zip_buffer.seek(0)
    return zip_buffer

# ДОБАВЬТЕ ЭТИ ИМПОРТЫ В НАЧАЛО ФАЙЛА (если их там нет)
from django.db import transaction
from django.utils.dateparse import parse_datetime, parse_date
from devices.models import Printer, Laminator
from sklad.models import Material
from spravochnik_dopolnitelnyh_rabot.models import Work
from vichisliniya_listov.multipage_models import MultipageBinding

# ============================================================================
# ФУНКЦИЯ ВОССТАНОВЛЕНИЯ ИЗ ZIP
# ============================================================================

def restore_from_zip(zip_file, mode='merge'):
    """
    Восстанавливает базу данных из ZIP-архива.
    mode: 'merge' (умное слияние) или 'replace' (полная замена).
    """
    # 1. Читаем ZIP-архив и достаем JSON
    with zipfile.ZipFile(zip_file) as z:
        json_files = [n for n in z.namelist() if n.endswith('.json')]
        if not json_files:
            raise ValueError("В архиве не найден JSON-файл")
        
        json_data = z.read(json_files[0]).decode('utf-8')
        data = json.loads(json_data)

    # Вспомогательная функция: безопасно достает ID объекта, проверяя его наличие в БД.
    # Если объекта нет (например, удалили бумагу), вернет None, чтобы не было ошибки ForeignKey.
    def get_safe_id(model, obj_id):
        if not obj_id:
            return None
        return obj_id if model.objects.filter(id=obj_id).exists() else None

    # Вся логика записи оборачивается в транзакцию: если упадет хоть одна строка —
    # база откатится к исходному состоянию, и мы не получим "полубитую" базу.
    with transaction.atomic():
        
        # 2. РЕЖИМ ПОЛНОЙ ЗАМЕНЫ (Hard Delete)
        if mode == 'replace':
            # ФИЗИЧЕСКИ удаляем все текущие заказы и просчёты.
            # Благодаря on_delete=models.CASCADE в моделях, 
            # все связанные изделия (Product) и компоненты удалятся автоматически.
            Order.objects.all().delete()
            Proschet.objects.all().delete()

        # 3. ВОССТАНОВЛЕНИЕ КЛИЕНТОВ И СВЯЗАННЫХ ДАННЫХ
        for c in data.get('clients', []):
            Client.objects.update_or_create(
                id=c['id'],
                defaults={
                    'name': c['name'],
                    'discount': Decimal(c['discount']) if c.get('discount') else Decimal('0'),
                    'address': c.get('address', ''),
                    'has_edo': c.get('has_edo', False),
                    'is_deleted': c.get('is_deleted', False)
                }
            )
            
        for le in data.get('legal_entities', []):
            LegalEntity.objects.update_or_create(
                id=le['id'],
                defaults={
                    'client_id': get_safe_id(Client, le.get('client_id')),
                    'name': le['name'],
                    'is_primary': le.get('is_primary', False),
                    'is_deleted': le.get('is_deleted', False)
                }
            )
            
        for cp in data.get('contact_persons', []):
            ContactPerson.objects.update_or_create(
                id=cp['id'],
                defaults={
                    'client_id': get_safe_id(Client, cp.get('client_id')),
                    'full_name': cp['full_name'],
                    'mobile': cp.get('mobile', ''),
                    'phone': cp.get('phone', ''),
                    'is_primary': cp.get('is_primary', False),
                    'is_deleted': cp.get('is_deleted', False)
                }
            )

        # 4. ВОССТАНОВЛЕНИЕ ПРОСЧЁТОВ
        for p in data.get('proschets', []):
            proschet = Proschet.objects.update_or_create(
                id=p['id'],
                defaults={
                    'number': p.get('number'),
                    'title': p.get('title'),
                    'circulation': p.get('circulation', 1),
                    'client_id': get_safe_id(Client, p.get('client_id')),
                    'comment': p.get('comment', ''),
                    # Пока ставим None, привяжем к заказу позже (если он есть)
                    'source_order_id': None, 
                    'source_template_id': p.get('source_template_id'), # Шаблоны пропускаем, если их нет
                    'is_deleted': p.get('is_deleted', False)
                }
            )[0]
            
            # Компоненты просчёта
            for comp in p.get('print_components', []):
                pc = PrintComponent.objects.update_or_create(
                    id=comp['id'],
                    defaults={
                        'proschet_id': proschet.id,
                        'number': comp.get('number', ''),
                        'printer_id': get_safe_id(Printer, comp.get('printer_id')),
                        'paper_id': get_safe_id(Material, comp.get('paper_id')),
                        'print_type': comp.get('print_type', 'color'),
                        'printing_mode': comp.get('printing_mode', 'single'),
                        'color_mode': comp.get('color_mode', '4+0'),
                        'price_per_sheet': Decimal(comp.get('price_per_sheet', '0')),
                        'is_price_calculated': comp.get('is_price_calculated', False),
                        'total_circulation_price': Decimal(comp.get('total_circulation_price', '0')),
                        'is_deleted': comp.get('is_deleted', False)
                    }
                )[0]
                
                # Работы
                for w in comp.get('works', []):
                    AdditionalWork.objects.update_or_create(
                        id=w['id'],
                        defaults={
                            'print_component_id': pc.id,
                            'work_id': get_safe_id(Work, w.get('work_id')),
                            'number': w.get('number', ''),
                            'title': w.get('title'),
                            'cost': Decimal(w.get('cost', '0')),
                            'markup_percent': Decimal(w.get('markup_percent', '0')),
                            'price': Decimal(w.get('price', '0')),
                            'quantity': w.get('quantity', 1),
                            'formula_type': w.get('formula_type', 1),
                            'lines_count': w.get('lines_count', 1),
                            'items_per_sheet': w.get('items_per_sheet', 1),
                            'total_price': Decimal(w.get('total_price', '0')),
                            'is_deleted': w.get('is_deleted', False)
                        }
                    )
                
                # Ламинация
                if comp.get('lamination'):
                    lam = comp['lamination']
                    Laminate.objects.update_or_create(
                        id=lam['id'],
                        defaults={
                            'print_component_id': pc.id,
                            'is_enabled': lam.get('is_enabled', False),
                            'side': lam.get('side', 'single'),
                            'laminator_id': get_safe_id(Laminator, lam.get('laminator_id')),
                            'film_id': get_safe_id(Material, lam.get('film_id')),
                            'laminator_cost': Decimal(lam.get('laminator_cost', '0')),
                            'laminator_markup': Decimal(lam.get('laminator_markup', '0')),
                            'laminator_price': Decimal(lam.get('laminator_price', '0')),
                            'film_price': Decimal(lam.get('film_price', '0')),
                            'total_price': Decimal(lam.get('total_price', '0'))
                        }
                    )
                    
                # Одностраничный расчёт
                if comp.get('vichisliniya'):
                    v = comp['vichisliniya']
                    VichisliniyaListovModel.objects.update_or_create(
                        id=v['id'],
                        defaults={
                            'vichisliniya_listov_print_component_id': pc.id,
                            'vichisliniya_listov_vyleta': v.get('vyleta', 1),
                            'vichisliniya_listov_polosa_count': v.get('polosa_count', 1),
                            'vichisliniya_listov_color': v.get('color', '4+0'),
                            'vichisliniya_listov_item_width': Decimal(v.get('item_width', '0')),
                            'vichisliniya_listov_item_height': Decimal(v.get('item_height', '0')),
                            'vichisliniya_listov_fit_horizontal': v.get('fit_horizontal', 0),
                            'vichisliniya_listov_fit_vertical': v.get('fit_vertical', 0),
                            'vichisliniya_listov_fit_total': v.get('fit_total', 0),
                            'vichisliniya_listov_fit_landscape_total': v.get('fit_landscape_total', 0),
                            'vichisliniya_listov_fit_portrait_total': v.get('fit_portrait_total', 0),
                            'vichisliniya_listov_fit_selected_orientation': v.get('fit_selected_orientation', 'auto'),
                            'vichisliniya_listov_list_count': Decimal(v.get('list_count', '0')),
                            'vichisliniya_listov_cuts_count': v.get('cuts_count', 0)
                        }
                    )
                    
                # Многостраничный расчёт
                if comp.get('multipage'):
                    mp = comp['multipage']
                    VichisliniyaMultipageModel.objects.update_or_create(
                        id=mp['id'],
                        defaults={
                            'print_component_id': pc.id,
                            'binding_id': get_safe_id(MultipageBinding, mp.get('binding_id')),
                            'total_pages': mp.get('total_pages', 4),
                            'copies': mp.get('copies', 1),
                            'finished_width': Decimal(mp.get('finished_width', '0')),
                            'finished_height': Decimal(mp.get('finished_height', '0')),
                            'vyleta': mp.get('vyleta', 1),
                            'color': mp.get('color', '4+0'),
                            'booklet_orientation': mp.get('booklet_orientation', 'portrait'),
                            'fit_horizontal': mp.get('fit_horizontal', 0),
                            'fit_vertical': mp.get('fit_vertical', 0),
                            'fit_total': mp.get('fit_total', 0),
                            'fit_landscape_total': mp.get('fit_landscape_total', 0),
                            'fit_portrait_total': mp.get('fit_portrait_total', 0),
                            'fit_selected_orientation': mp.get('fit_selected_orientation', 'auto'),
                            'sheet_count': Decimal(mp.get('sheet_count', '0')),
                            'is_active': mp.get('is_active', False)
                        }
                    )

        # 5. ВОССТАНОВЛЕНИЕ ЗАКАЗОВ (и вложенной структуры Product)
        for o in data.get('orders', []):
            order = Order.objects.update_or_create(
                id=o['id'],
                defaults={
                    'number': o.get('number'),
                    'client_id': get_safe_id(Client, o.get('client_id')),
                    'legal_entity_id': get_safe_id(LegalEntity, o.get('legal_entity_id')),
                    'contact_person_id': get_safe_id(ContactPerson, o.get('contact_person_id')),
                    'status': o.get('status', 'accepted'),
                    'is_paid': o.get('is_paid', False),
                    'payer_type': o.get('payer_type', ''),
                    'invoice_number': o.get('invoice_number', ''),
                    'payment_method': o.get('payment_method', ''),
                    'documents_status': o.get('documents_status', 'none'),
                    'is_delivery': o.get('is_delivery', False),
                    'delivery_date': parse_date(o['delivery_date']) if o.get('delivery_date') else None,
                    'delivery_address': o.get('delivery_address', ''),
                    'delivery_phone': o.get('delivery_phone', ''),
                    'delivery_status': o.get('delivery_status', 'pending'),
                    'is_courier_ordered': o.get('is_courier_ordered', False),
                    'ready_datetime': parse_datetime(o['ready_datetime']) if o.get('ready_datetime') else None,
                    'comment': o.get('comment', ''),
                    'created_at': parse_datetime(o['created_at']) if o.get('created_at') else None,
                    'is_deleted': o.get('is_deleted', False)
                }
            )[0]
            
            # Восстанавливаем изделия заказа
            for prod in o.get('products', []):
                product = Product.objects.update_or_create(
                    id=prod['id'],
                    defaults={
                        'order_id': order.id,
                        # Привязываем к просчёту, если он восстановился
                        'source_proschet_id': get_safe_id(Proschet, prod.get('source_proschet_id')),
                        'source_template_id': prod.get('source_template_id'),
                        'title': prod.get('title'),
                        'circulation': prod.get('circulation', 1),
                        'position': prod.get('position', 1),
                        'total_price': Decimal(prod.get('total_price', '0')),
                        'frozen_total_mass_g': Decimal(prod.get('frozen_total_mass_g', '0')),
                        'frozen_total_volume_cm3': Decimal(prod.get('frozen_total_volume_cm3', '0')),
                        'frozen_stacks': prod.get('frozen_stacks', []),
                        'is_deleted': prod.get('is_deleted', False)
                    }
                )[0]
                
                # Компоненты изделия
                for comp in prod.get('components', []):
                    pc_prod = ProductPrintComponent.objects.update_or_create(
                        id=comp['id'],
                        defaults={
                            'product_id': product.id,
                            'position': comp.get('position', 1),
                            'number': comp.get('number', ''),
                            'printer_id': get_safe_id(Printer, comp.get('printer_id')),
                            'paper_id': get_safe_id(Material, comp.get('paper_id')),
                            'print_type': comp.get('print_type', 'color'),
                            'printing_mode': comp.get('printing_mode', 'single'),
                            'color_mode': comp.get('color_mode', '4+0'),
                            'price_per_sheet': Decimal(comp['price_per_sheet']) if comp.get('price_per_sheet') else None,
                            'is_price_calculated': comp.get('is_price_calculated', False),
                            'total_circulation_price': Decimal(comp.get('total_circulation_price', '0')),
                            'sheet_count': Decimal(comp.get('sheet_count', '0')),
                            'runs_count': comp.get('runs_count', 0),
                            'material_price': Decimal(comp.get('material_price', '0')),
                            'paper_density': Decimal(comp.get('paper_density', '0')),
                            'paper_thickness': Decimal(comp.get('paper_thickness', '0'))
                        }
                    )[0]
                    
                    # Работы изделия
                    for w in comp.get('works', []):
                        ProductAdditionalWork.objects.update_or_create(
                            id=w['id'],
                            defaults={
                                'product_component_id': pc_prod.id,
                                'work_id': get_safe_id(Work, w.get('work_id')),
                                'number': w.get('number', ''),
                                'title': w.get('title'),
                                'cost': Decimal(w.get('cost', '0')),
                                'markup_percent': Decimal(w.get('markup_percent', '0')),
                                'price': Decimal(w.get('price', '0')),
                                'quantity': w.get('quantity', 1),
                                'formula_type': w.get('formula_type', 1),
                                'lines_count': w.get('lines_count', 1),
                                'items_per_sheet': w.get('items_per_sheet', 1),
                                'total_price': Decimal(w.get('total_price', '0')),
                                'is_deleted': w.get('is_deleted', False)
                            }
                        )
                    
                    # Ламинация изделия
                    if comp.get('lamination'):
                        lam = comp['lamination']
                        ProductLaminate.objects.update_or_create(
                            id=lam['id'],
                            defaults={
                                'product_component_id': pc_prod.id,
                                'is_enabled': lam.get('is_enabled', False),
                                'side': lam.get('side', 'single'),
                                'laminator_id': get_safe_id(Laminator, lam.get('laminator_id')),
                                'film_id': get_safe_id(Material, lam.get('film_id')),
                                'laminator_cost': Decimal(lam.get('laminator_cost', '0')),
                                'laminator_markup': Decimal(lam.get('laminator_markup', '0')),
                                'laminator_price': Decimal(lam.get('laminator_price', '0')),
                                'film_price': Decimal(lam.get('film_price', '0')),
                                'film_thickness': Decimal(lam['film_thickness']) if lam.get('film_thickness') else None,
                                'total_price': Decimal(lam.get('total_price', '0'))
                            }
                        )
                        
                    # Одностраничный расчёт изделия
                    if comp.get('vichisliniya'):
                        v = comp['vichisliniya']
                        ProductVichisliniya.objects.update_or_create(
                            id=v['id'],
                            defaults={
                                'product_component_id': pc_prod.id,
                                'vyleta': v.get('vyleta', 1),
                                'polosa_count': v.get('polosa_count', 1),
                                'color': v.get('color', '4+0'),
                                'item_width': Decimal(v.get('item_width', '0')),
                                'item_height': Decimal(v.get('item_height', '0')),
                                'fit_horizontal': v.get('fit_horizontal', 0),
                                'fit_vertical': v.get('fit_vertical', 0),
                                'fit_total': v.get('fit_total', 0),
                                'fit_landscape_total': v.get('fit_landscape_total', 0),
                                'fit_portrait_total': v.get('fit_portrait_total', 0),
                                'fit_selected_orientation': v.get('fit_selected_orientation', 'auto'),
                                'list_count': Decimal(v.get('list_count', '0')),
                                'cuts_count': v.get('cuts_count', 0)
                            }
                        )
                        
                    # Многостраничный расчёт изделия
                    if comp.get('multipage'):
                        mp = comp['multipage']
                        ProductMultipage.objects.update_or_create(
                            id=mp['id'],
                            defaults={
                                'product_component_id': pc_prod.id,
                                'binding_id': get_safe_id(MultipageBinding, mp.get('binding_id')),
                                'total_pages': mp.get('total_pages', 4),
                                'copies': mp.get('copies', 1),
                                'finished_width': Decimal(mp.get('finished_width', '0')),
                                'finished_height': Decimal(mp.get('finished_height', '0')),
                                'vyleta': mp.get('vyleta', 1),
                                'color': mp.get('color', '4+0'),
                                'booklet_orientation': mp.get('booklet_orientation', 'portrait'),
                                'fit_horizontal': mp.get('fit_horizontal', 0),
                                'fit_vertical': mp.get('fit_vertical', 0),
                                'fit_total': mp.get('fit_total', 0),
                                'fit_landscape_total': mp.get('fit_landscape_total', 0),
                                'fit_portrait_total': mp.get('fit_portrait_total', 0),
                                'fit_selected_orientation': mp.get('fit_selected_orientation', 'auto'),
                                'sheet_count': Decimal(mp.get('sheet_count', '0')),
                                'is_active': mp.get('is_active', False)
                            }
                        )

        # 6. ВТОРОЙ ПРОХОД: Восстанавливаем связи Просчётов с Заказами (source_order)
        # Это делается после того, как все Заказы гарантированно созданы.
        for p in data.get('proschets', []):
            if p.get('source_order_id'):
                Proschet.objects.filter(id=p['id']).update(
                    source_order_id=get_safe_id(Order, p['source_order_id'])
                )

    return True