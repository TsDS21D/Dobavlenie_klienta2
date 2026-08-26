# calculator/views.py
"""
Представления (views) для приложения calculator.
Содержит все API-эндпоинты для работы с просчётами, печатными компонентами,
дополнительными работами, ламинацией и вычислениями листов.

ИСПРАВЛЕНИЯ ДЛЯ ПОДДЕРЖКИ Ч/Б ПЕЧАТИ (06.04.2026):
- Во всех функциях, связанных с печатными компонентами, добавлен параметр print_type.
- В add_print_component добавлено получение print_type из POST-запроса.
- В update_print_component добавлена обработка поля print_type.
- В get_print_components и recalculate_components_for_circulation возвращается print_type.
- Функция calculate_price_for_printer пока не поддерживает print_type (требует доработки в print_price),
  но в данном файле она не используется для расчёта цен компонентов (используется статический метод модели).

ПОДРОБНЫЕ КОММЕНТАРИИ К КАЖДОЙ СТРОЧКЕ для понимания новичками.
"""

from django.shortcuts import render, redirect, get_object_or_404
from django.http import JsonResponse
from baza_klientov.models import Client
from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_POST, require_http_methods, require_GET
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.cache import never_cache
from django.contrib import messages
import json
import math

# Импорт Decimal для точных финансовых расчётов
from decimal import Decimal, InvalidOperation

# Импорт форм и моделей приложения
from .forms import ProschetForm
from .models_list_proschet import Proschet, PrintComponent, AdditionalWork
from .models_lamination import Laminate
from .forms_lamination import LaminateForm

# Импорт моделей из других приложений
from devices.models import Printer, Laminator
from print_price.models import PrintPrice
from vichisliniya_listov.models import VichisliniyaListovModel
from vichisliniya_listov.multipage_models import VichisliniyaMultipageModel
from spravochnik_dopolnitelnyh_rabot.models import Work
from sklad.models import Material

# Импорт утилит для расчётов
from spravochnik_dopolnitelnyh_rabot.utils import calculate_price_for_work
from print_price.utils import get_cost_and_markup_for_printer_and_copies, calculate_price_for_printer_and_copies
from print_price.utils import get_cost_and_markup_for_laminator_and_copies


# ============================================================================
# ГЛАВНАЯ СТРАНИЦА КАЛЬКУЛЯТОРА
# ============================================================================

@login_required(login_url='/login/')
@never_cache
def index(request):
    """
    Главная страница калькулятора с упрощённым списком просчётов.
    Загружает все активные просчёты и форму для создания нового.
    """
    # Получаем все активные просчёты (не удалённые), сортируем по дате создания (новые сверху)
    proschets = Proschet.objects.filter(is_deleted=False).order_by('-created_at')

    # Загружаем список клиентов для выпадающего списка в форме
    clients = []
    try:
        from baza_klientov.models import Client
        clients = Client.objects.all().order_by('client_number')
    except ImportError:
        pass  # Если приложение baza_klientov не установлено, оставляем пустой список

    # Создаём пустую форму для создания нового просчёта
    form = ProschetForm()

    # Подготавливаем контекст для шаблона
    context = {
        'proschets': proschets,
        'form': form,
        'clients': clients,
        'current_user': request.user,
        'total_count': proschets.count(),
        'active_app': 'calculator',
    }

    # Если это AJAX-запрос, возвращаем JSON вместо HTML
    if request.headers.get('x-requested-with') == 'XMLHttpRequest':
        proschets_data = []
        for proschet in proschets:
            client_info = None
            if proschet.client:
                client_info = {
                    'id': proschet.client.id,
                    'client_number': proschet.client.client_number,
                    'name': proschet.client.name,
                }
            proschets_data.append({
                'id': proschet.id,
                'number': proschet.number,
                'title': proschet.title,
                'client': client_info,
                'created_at': proschet.formatted_created_at,
            })
        return JsonResponse({
            'success': True,
            'proschets': proschets_data,
            'total_count': proschets.count()
        })

    return render(request, 'calculator/index.html', context)


# ============================================================================
# РАБОТА С ПРОСЧЁТАМИ (CRUD)
# ============================================================================

@login_required
@require_POST
def update_proschet_title(request, proschet_id):
    """
    Обновляет название просчёта при inline-редактировании.
    Принимает AJAX-запрос с новым названием.
    """
    print(f"🔄 Запрос на обновление названия просчёта ID={proschet_id}")

    try:
        proschet = Proschet.objects.get(id=proschet_id, is_deleted=False)
    except Proschet.DoesNotExist:
        return JsonResponse({
            'success': False,
            'message': 'Просчёт не найден или удален'
        }, status=404)

    new_title = request.POST.get('value', '').strip()
    field_name = request.POST.get('field', 'title')

    print(f"📝 Получены данные: поле='{field_name}', значение='{new_title}'")

    # Проверяем, что поле действительно является названием
    if field_name != 'title':
        return JsonResponse({
            'success': False,
            'message': f'Поле "{field_name}" не поддерживается для редактирования'
        }, status=400)

    # Валидация названия
    if not new_title:
        return JsonResponse({
            'success': False,
            'message': 'Название не может быть пустым'
        }, status=400)

    if len(new_title) < 3:
        return JsonResponse({
            'success': False,
            'message': 'Название должно содержать минимум 3 символа'
        }, status=400)

    if len(new_title) > 200:
        return JsonResponse({
            'success': False,
            'message': 'Название не должно превышать 200 символов'
        }, status=400)

    old_title = proschet.title
    proschet.title = new_title

    try:
        proschet.save()
        return JsonResponse({
            'success': True,
            'message': 'Название успешно обновлено',
            'new_title': new_title,
            'proschet_id': proschet.id,
            'proschet_number': proschet.number
        })
    except Exception as e:
        return JsonResponse({
            'success': False,
            'message': f'Ошибка при сохранении: {str(e)}'
        }, status=500)


@require_http_methods(["POST"])
def calculate_price_for_printer(request):
    """
    API для расчёта цены за лист на основе принтера и тиража.
    Использует логику из приложения print_price.
    ПРИМЕЧАНИЕ: Этот эндпоинт не учитывает тип печати (print_type).
    Для полноценной поддержки ч/б необходимо расширить его, добавив параметр print_type.
    """
    try:
        data = json.loads(request.body)
        printer_id = data.get('printer_id')
        circulation = data.get('circulation')

        if not printer_id:
            return JsonResponse({'success': False, 'error': 'Не указан ID принтера'})

        if not circulation:
            return JsonResponse({'success': False, 'error': 'Не указан тираж'})

        try:
            circulation_int = int(circulation)
        except ValueError:
            return JsonResponse({'success': False, 'error': 'Тираж должен быть целым числом'})

        try:
            printer = Printer.objects.get(id=printer_id)
        except Printer.DoesNotExist:
            return JsonResponse({'success': False, 'error': f'Принтер с ID {printer_id} не найден'})

        # Фильтруем цены по принтеру (без учёта типа печати – всегда цветная)
        print_prices = PrintPrice.objects.filter(printer=printer).order_by('copies')

        if not print_prices.exists():
            return JsonResponse({
                'success': False,
                'error': f'Для принтера "{printer.name}" нет установленных цен'
            })

        # Поиск точного совпадения
        exact_price = print_prices.filter(copies=circulation_int).first()
        if exact_price:
            return JsonResponse({
                'success': True,
                'calculated_price': str(exact_price.price_per_sheet),
                'interpolation_method': 'exact',
                'message': f'Найдена точная цена для тиража {circulation_int} шт.'
            })

        # Если тираж меньше минимального
        min_price = print_prices.order_by('copies').first()
        if circulation_int < min_price.copies:
            return JsonResponse({
                'success': True,
                'calculated_price': str(min_price.price_per_sheet),
                'interpolation_method': 'min',
                'message': f'Использована минимальная цена (для тиража {min_price.copies} шт.)'
            })

        # Если тираж больше максимального
        max_price = print_prices.order_by('-copies').first()
        if circulation_int > max_price.copies:
            return JsonResponse({
                'success': True,
                'calculated_price': str(max_price.price_per_sheet),
                'interpolation_method': 'max',
                'message': f'Использована максимальная цена (для тиража {max_price.copies} шт.)'
            })

        # Линейная интерполяция между двумя ближайшими точками
        lower_price = print_prices.filter(copies__lte=circulation_int).order_by('-copies').first()
        upper_price = print_prices.filter(copies__gte=circulation_int).order_by('copies').first()

        if lower_price and upper_price and lower_price.copies != upper_price.copies:
            x1 = lower_price.copies
            y1 = lower_price.price_per_sheet
            x2 = upper_price.copies
            y2 = upper_price.price_per_sheet
            calculated_price = y1 + (y2 - y1) * (circulation_int - x1) / (x2 - x1)

            return JsonResponse({
                'success': True,
                'calculated_price': str(calculated_price.quantize(Decimal('0.01'))),
                'interpolation_method': 'linear',
                'lower_bound': {
                    'copies': lower_price.copies,
                    'price': str(lower_price.price_per_sheet)
                },
                'upper_bound': {
                    'copies': upper_price.copies,
                    'price': str(upper_price.price_per_sheet)
                },
                'message': f'Цена рассчитана методом линейной интерполяции между {lower_price.copies} и {upper_price.copies} шт.'
            })

        return JsonResponse({'success': False, 'error': 'Не удалось рассчитать цену'})

    except json.JSONDecodeError:
        return JsonResponse({'success': False, 'error': 'Неверный формат JSON в запросе'})
    except Exception as e:
        return JsonResponse({'success': False, 'error': f'Внутренняя ошибка сервера: {str(e)}'})


@login_required
@require_http_methods(["POST"])
def create_proschet(request):
    """
    Создание нового просчёта.
    Принимает только название, остальное генерируется автоматически.
    """
    form = ProschetForm(request.POST)

    if form.is_valid():
        proschet = form.save()

        if request.headers.get('x-requested-with') == 'XMLHttpRequest':
            return JsonResponse({
                'success': True,
                'message': f'Просчёт "{proschet.title}" успешно создан!',
                'proschet': {
                    'id': proschet.id,
                    'number': proschet.number,
                    'title': proschet.title,
                    'created_at': proschet.formatted_created_at,
                }
            })

        messages.success(request, f'Просчёт "{proschet.title}" успешно создан!')
        return redirect('calculator:index')
    else:
        if request.headers.get('x-requested-with') == 'XMLHttpRequest':
            errors = {}
            for field, field_errors in form.errors.items():
                errors[field] = [str(error) for error in field_errors]
            return JsonResponse({
                'success': False,
                'message': 'Ошибка при создании просчёта',
                'errors': errors
            }, status=400)

        messages.error(request, 'Пожалуйста, исправьте ошибки в форме.')
        proschets = Proschet.objects.filter(is_deleted=False).order_by('-created_at')
        return render(request, 'calculator/index.html', {
            'proschets': proschets,
            'form': form
        })


@login_required
@require_http_methods(["POST"])
def bulk_delete_proschets(request):
    """
    Мягкое удаление выбранных просчётов.
    Принимает список ID просчётов для удаления.
    """
    proschet_ids_str = request.POST.get('proschet_ids', '')

    if not proschet_ids_str:
        return JsonResponse({
            'success': False,
            'message': 'Не указаны ID просчётов для удаления'
        }, status=400)

    try:
        proschet_ids = [int(id_str.strip()) for id_str in proschet_ids_str.split(',') if id_str.strip().isdigit()]

        if not proschet_ids:
            return JsonResponse({
                'success': False,
                'message': 'Некорректный список ID просчётов'
            }, status=400)

        proschets = Proschet.objects.filter(id__in=proschet_ids, is_deleted=False)

        deleted_count = 0
        for proschet in proschets:
            proschet.soft_delete()
            deleted_count += 1

        return JsonResponse({
            'success': True,
            'message': f'Удалено {deleted_count} просчётов из {len(proschet_ids)}',
            'deleted_count': deleted_count,
            'total_requested': len(proschet_ids)
        })
    except Exception as e:
        return JsonResponse({
            'success': False,
            'message': f'Ошибка при удалении просчётов: {str(e)}'
        }, status=500)


@login_required
@require_POST
def update_proschet_client(request, proschet_id):
    """
    Обновление клиента в существующем просчёте.
    """
    try:
        proschet = Proschet.objects.get(id=proschet_id, is_deleted=False)
    except Proschet.DoesNotExist:
        return JsonResponse({
            'success': False,
            'message': 'Просчёт не найден или удален'
        }, status=404)

    client_id = request.POST.get('client_id', '')

    try:
        if client_id:
            try:
                from baza_klientov.models import Client
                client = Client.objects.get(id=client_id)
                proschet.client = client
            except Client.DoesNotExist:
                return JsonResponse({
                    'success': False,
                    'message': 'Клиент не найден'
                }, status=404)
        else:
            proschet.client = None

        proschet.save()

        client_data = None
        if proschet.client:
            client_data = {
                'id': proschet.client.id,
                'client_number': proschet.client.client_number,
                'name': proschet.client.name,
                'discount': proschet.client.discount,
                'has_edo': proschet.client.has_edo
            }

        return JsonResponse({
            'success': True,
            'message': 'Клиент успешно обновлен',
            'client': client_data
        })
    except Exception as e:
        return JsonResponse({
            'success': False,
            'message': f'Ошибка при обновлении клиента: {str(e)}'
        }, status=500)


@login_required
def get_proschet(request, proschet_id):
    """
    Получение данных просчёта по ID для AJAX-запроса.
    Возвращает данные клиента, если он есть.
    """
    try:
        proschet = Proschet.objects.get(id=proschet_id, is_deleted=False)
    except Proschet.DoesNotExist:
        return JsonResponse({
            'success': False,
            'message': 'Просчёт не найден'
        }, status=404)

    client_data = None
    if proschet.client:
        client_data = {
            'id': proschet.client.id,
            'client_number': proschet.client.client_number,
            'name': proschet.client.name,
            'discount': proschet.client.discount,
            'has_edo': proschet.client.has_edo
        }

    return JsonResponse({
        'success': True,
        'proschet': {
            'id': proschet.id,
            'number': proschet.number,
            'title': proschet.title,
            'client': client_data,
            'created_at': proschet.formatted_created_at,
            'circulation': proschet.circulation,
            'formatted_circulation': proschet.formatted_circulation
        }
    })


def get_clients(request):
    """Возвращает список клиентов для выпадающего списка."""
    try:
        clients = Client.objects.all().order_by('client_number')
        clients_data = [
            {
                'id': client.id,
                'client_number': client.client_number,
                'name': client.name,
                'discount': client.discount,
                'has_edo': client.has_edo,
            }
            for client in clients
        ]
        return JsonResponse({
            'success': True,
            'clients': clients_data,
            'count': len(clients_data)
        })
    except Exception as e:
        return JsonResponse({
            'success': False,
            'message': f'Ошибка при получении клиентов: {str(e)}'
        }, status=500)


# ============================================================================
# РАБОТА С ПЕЧАТНЫМИ КОМПОНЕНТАМИ (С ПОДДЕРЖКОЙ Ч/Б ПЕЧАТИ)
# ============================================================================

def get_print_components(request, proschet_id):
    """
    API для получения компонентов печати для указанного просчёта.
    ИСПРАВЛЕНИЕ: теперь при активном многостраничном режиме количество листов
    пересчитывается на основе текущего тиража просчёта.
    """
    try:
        # Получаем просчёт (нужен для тиража)
        from .models_list_proschet import Proschet
        proschet = get_object_or_404(Proschet, id=proschet_id, is_deleted=False)
        current_circulation = proschet.circulation or 1

        components = PrintComponent.objects.filter(
            proschet_id=proschet_id,
            is_deleted=False
        ).select_related('printer', 'paper')

        # Получаем одностраничные данные
        vich_data_qs = VichisliniyaListovModel.objects.filter(
            vichisliniya_listov_print_component__in=components
        ).values('vichisliniya_listov_print_component_id', 'vichisliniya_listov_list_count')
        vich_data_dict = {
            item['vichisliniya_listov_print_component_id']: item['vichisliniya_listov_list_count']
            for item in vich_data_qs
        }

        # Получаем многостраничные объекты (не только значения, а целые объекты)
        from vichisliniya_listov.multipage_models import VichisliniyaMultipageModel
        multipage_objects = VichisliniyaMultipageModel.objects.filter(
            print_component__in=components
        ).select_related('print_component')
        multipage_dict = {obj.print_component_id: obj for obj in multipage_objects}

        components_data = []
        for component in components:
            multipage_obj = multipage_dict.get(component.id)
            if multipage_obj and multipage_obj.is_active:
                # ===== КЛЮЧЕВОЕ ИСПРАВЛЕНИЕ =====
                # Пересчитываем количество листов с актуальным тиражом просчёта
                multipage_obj.copies = current_circulation
                multipage_obj.calculate_sheet_count()
                # Сохраняем обновлённое значение (не обязательно, но для синхронизации)
                multipage_obj.save(update_fields=['sheet_count', 'copies'])
                sheet_count = multipage_obj.sheet_count
            else:
                # Одностраничный режим
                sheet_count = vich_data_dict.get(component.id, Decimal('0.00'))

            sheet_count_float = float(sheet_count)

            # Расчёт себестоимости и наценки
            cost = Decimal('0.00')
            markup = Decimal('0.00')
            price_per_sheet = Decimal('0.00')
            if component.printer and sheet_count_float > 0:
                copies_int = int(sheet_count_float)
                cost, markup = get_cost_and_markup_for_printer_and_copies(
                    component.printer, copies_int, component.print_type
                )
                price_per_sheet = cost + (cost * markup / Decimal('100'))
                cost = cost.quantize(Decimal('0.01'))
                markup = markup.quantize(Decimal('0.01'))
                price_per_sheet = price_per_sheet.quantize(Decimal('0.01'))

            runs_count = int(sheet_count) * (2 if component.printing_mode == 'duplex' else 1)
            paper_price = component.material_price_per_unit
            total_circulation_price = price_per_sheet * runs_count + paper_price * sheet_count
            total_circulation_price = total_circulation_price.quantize(Decimal('0.01'))
            profit = price_per_sheet - cost
            formatted_sheet_count = f"{sheet_count_float:,.2f}".replace(',', ' ') if sheet_count_float > 0 else "0.00"

            component_data = {
                'id': component.id,
                'number': component.number,
                'printer_name': component.printer.name if component.printer else None,
                'paper_name': component.paper.name if component.paper else None,
                'print_type': component.print_type,
                'print_type_display': component.print_type_display_name,
                'sheet_count': sheet_count_float,
                'formatted_sheet_count_display': formatted_sheet_count,
                'price_per_sheet': str(price_per_sheet),
                'formatted_price_per_sheet': f"{price_per_sheet:.2f} ₽",
                'total_circulation_price': str(total_circulation_price),
                'formatted_total_circulation_price': f"{total_circulation_price:.2f} ₽",
                'has_vich_data': component.id in vich_data_dict,
                'paper_price': float(paper_price),
                'printing_mode': component.printing_mode,
                'printing_mode_display': component.printing_mode_display_name,
                'runs_count': runs_count,
                'cost': str(cost),
                'formatted_cost': f"{cost:.2f} ₽",
                'markup_percent': str(markup),
                'formatted_markup_percent': f"{markup}%",
                'profit_per_unit': str(profit),
                'formatted_profit_per_unit': f"{profit:.2f} ₽",
            }
            components_data.append(component_data)

            # Синхронизируем цены в модели компонента
            component.price_per_sheet = price_per_sheet
            component.total_circulation_price = total_circulation_price
            component.save(update_fields=['price_per_sheet', 'total_circulation_price'])

        return JsonResponse({
            'success': True,
            'components': components_data,
            'count': len(components_data)
        })
    except Exception as e:
        return JsonResponse({
            'success': False,
            'message': f'Ошибка при получении компонентов: {str(e)}'
        }, status=500)


@login_required
def get_printers(request):
    """API для получения списка принтеров для выпадающего списка."""
    try:
        try:
            from devices.models import Printer
        except ImportError:
            return JsonResponse({
                'success': True,
                'printers': [],
                'count': 0,
                'message': 'Приложение devices не установлено'
            })

        printers = Printer.objects.all().order_by('name')
        printers_data = []
        for printer in printers:
            printer_data = {'id': printer.id, 'name': printer.name}
            if hasattr(printer, 'sheet_format'):
                printer_data['sheet_format'] = printer.sheet_format.name if printer.sheet_format else None
            if hasattr(printer, 'margin_mm'):
                printer_data['margin_mm'] = printer.margin_mm
            if hasattr(printer, 'duplex_coefficient'):
                printer_data['duplex_coefficient'] = str(printer.duplex_coefficient)
            printers_data.append(printer_data)

        return JsonResponse({
            'success': True,
            'printers': printers_data,
            'count': len(printers_data)
        })
    except Exception as e:
        print(f"❌ Ошибка в get_printers: {str(e)}")
        return JsonResponse({
            'success': True,
            'printers': [],
            'count': 0,
            'message': f'Ошибка: {str(e)}'
        })


@login_required
def get_papers(request):
    """
    Возвращает список материалов (только бумага, type='paper').
    Использует метод get_price() модели Material.
    """
    try:
        from sklad.models import Material
    except ImportError:
        return JsonResponse({'success': True, 'papers': [], 'count': 0, 'message': 'Приложение sklad не установлено'})

    papers = Material.objects.filter(type='paper').order_by('name')
    papers_data = []
    for paper in papers:
        price = paper.get_price() if hasattr(paper, 'get_price') else Decimal('0.00')
        paper_data = {
            'id': paper.id,
            'name': paper.name,
            'price': str(price.quantize(Decimal('0.01'))),
            'unit': paper.unit,
        }
        if hasattr(paper, 'quantity'):
            paper_data['stock_quantity'] = paper.quantity
        papers_data.append(paper_data)

    return JsonResponse({'success': True, 'papers': papers_data, 'count': len(papers_data)})


@login_required
@require_POST
def add_print_component(request):
    """
    Добавление нового печатного компонента.
    Теперь принимает параметр print_type (color/bw).
    """
    try:
        proschet_id = request.POST.get('proschet_id')
        printer_id = request.POST.get('printer_id')
        paper_id = request.POST.get('paper_id')
        # НОВЫЙ ПАРАМЕТР: тип печати
        print_type = request.POST.get('print_type', 'color')
        # Валидация print_type
        if print_type not in ['color', 'bw']:
            print_type = 'color'

        if not proschet_id or not paper_id:
            return JsonResponse({'success': False, 'message': 'Не указаны обязательные поля: просчёт и бумага'}, status=400)

        try:
            proschet = Proschet.objects.get(id=proschet_id, is_deleted=False)
        except Proschet.DoesNotExist:
            return JsonResponse({'success': False, 'message': 'Просчёт не найден'}, status=404)

        printer = None
        if printer_id:
            try:
                from devices.models import Printer
                printer = Printer.objects.get(id=printer_id)
            except (ImportError, Printer.DoesNotExist):
                pass

        try:
            from sklad.models import Material
            paper = Material.objects.get(id=paper_id)
            if paper.type != 'paper':
                return JsonResponse({
                    'success': False,
                    'message': f'Материал "{paper.name}" не является бумагой (тип: {paper.type}). Выберите бумагу.'
                }, status=400)
        except (ImportError, Material.DoesNotExist):
            return JsonResponse({'success': False, 'message': 'Бумага не найдена'}, status=404)

        # Создаём компонент с указанием типа печати
        component = PrintComponent(
            proschet=proschet,
            printer=printer,
            paper=paper,
            print_type=print_type,          # НОВОЕ ПОЛЕ
            price_per_sheet=Decimal('0.00'),
            printing_mode='single'
        )
        component.save()

        # Создаём запись вычислений листов с параметрами по умолчанию
        vich_data = VichisliniyaListovModel(
            vichisliniya_listov_print_component=component,
            vichisliniya_listov_vyleta=1,
            vichisliniya_listov_polosa_count=1,
            vichisliniya_listov_color='4+0',
            vichisliniya_listov_item_width=Decimal('90.00'),
            vichisliniya_listov_item_height=Decimal('50.00'),
            vichisliniya_listov_fit_horizontal=0,
            vichisliniya_listov_fit_vertical=0,
            vichisliniya_listov_fit_total=0,
            vichisliniya_listov_fit_landscape_total=0,
            vichisliniya_listov_fit_portrait_total=0,
            vichisliniya_listov_fit_selected_orientation='auto',
            vichisliniya_listov_list_count=Decimal('0.00')
        )

        if printer and printer.sheet_format and printer.margin_mm is not None:
            sheet_width = printer.sheet_format.width_mm
            sheet_height = printer.sheet_format.height_mm
            margin = printer.margin_mm
            vich_data.calculate_fitting(sheet_width, sheet_height, margin)
        vich_data.save()

        circulation = proschet.circulation or 1
        new_list_count = vich_data.vichisliniya_listov_calculate_list_count(circulation)
        vich_data.vichisliniya_listov_list_count = new_list_count
        vich_data.save()
        sheet_count = new_list_count

        # Пересчитываем цену за лист с учётом типа печати
        if component.printer and sheet_count > 0:
            sheet_count_int = int(float(sheet_count))
            new_price = PrintComponent.calculate_price_for_printer_and_copies(
                component.printer, sheet_count_int, component.print_type
            )
            component.price_per_sheet = new_price
        else:
            component.price_per_sheet = Decimal('0.00')

        component.refresh_total_price()
        component.save(update_fields=['price_per_sheet', 'total_circulation_price'])

        def format_price(p): return f"{float(p):.2f} ₽"
        def format_sheet_count(c): return f"{float(c):,.2f}".replace(',', ' ')
        runs_count = int(sheet_count) * (2 if component.printing_mode == 'duplex' else 1)

        component_data = {
            'id': component.id,
            'number': component.number,
            'printer_name': component.printer.name if component.printer else 'Принтер не выбран',
            'paper_name': component.paper.name if component.paper else 'Бумага не выбрана',
            'print_type': component.print_type,                     # НОВОЕ
            'print_type_display': component.print_type_display_name, # НОВОЕ
            'sheet_count': float(sheet_count),
            'formatted_sheet_count_display': format_sheet_count(sheet_count),
            'price_per_sheet': str(component.price_per_sheet),
            'formatted_price_per_sheet': format_price(component.price_per_sheet),
            'total_circulation_price': str(component.total_circulation_price),
            'formatted_total_circulation_price': format_price(component.total_circulation_price),
            'paper_price': float(component.material_price_per_unit),
            'formatted_paper_price': format_price(component.material_price_per_unit),
            'printing_mode': component.printing_mode,
            'printing_mode_display': component.printing_mode_display_name,
            'runs_count': runs_count,
        }

        return JsonResponse({'success': True, 'message': 'Компонент печати успешно добавлен', 'component': component_data})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JsonResponse({'success': False, 'message': f'Ошибка при добавлении компонента: {str(e)}'}, status=500)


@login_required
@require_POST
def update_print_component(request):
    """
    Обновление печатного компонента (принтер, бумага, цена, режим печати, тип печати).
    Добавлена обработка поля print_type.
    """
    try:
        component_id = request.POST.get('component_id')
        field_name = request.POST.get('field_name')
        field_value = request.POST.get('field_value')

        print(f"🔄 Обновление компонента: ID={component_id}, поле={field_name}, значение={field_value}")

        if not component_id or not field_name:
            return JsonResponse({'success': False, 'message': 'Не указаны обязательные поля'}, status=400)

        try:
            component = PrintComponent.objects.get(id=component_id, is_deleted=False)
        except PrintComponent.DoesNotExist:
            return JsonResponse({'success': False, 'message': 'Компонент не найден'}, status=404)

        vich_data, created = VichisliniyaListovModel.objects.get_or_create(
            vichisliniya_listov_print_component=component,
            defaults={
                'vichisliniya_listov_vyleta': 1,
                'vichisliniya_listov_polosa_count': 1,
                'vichisliniya_listov_color': '4+0',
                'vichisliniya_listov_item_width': Decimal('90.00'),
                'vichisliniya_listov_item_height': Decimal('50.00'),
                'vichisliniya_listov_fit_selected_orientation': 'auto',
            }
        )

        # ===== НОВЫЙ ОБРАБОТЧИК ДЛЯ ПОЛЯ print_type =====
        if field_name == 'print_type':
            if field_value not in ['color', 'bw']:
                return JsonResponse({'success': False, 'message': 'Некорректный тип печати'}, status=400)
            component.print_type = field_value
            # После смены типа печати нужно пересчитать цену за лист
            sheet_count = component.get_sheet_count()
            if component.printer and sheet_count > 0:
                sheet_count_int = int(float(sheet_count))
                new_price = PrintComponent.calculate_price_for_printer_and_copies(
                    component.printer, sheet_count_int, component.print_type
                )
                component.price_per_sheet = new_price
                component.is_price_calculated = True
            else:
                component.price_per_sheet = Decimal('0.00')
                component.is_price_calculated = False
            component.refresh_total_price()

        # Обработка изменения принтера
        elif field_name == 'printer':
            if field_value == '' or field_value == 'null':
                component.printer = None
                component.price_per_sheet = Decimal('0.00')
                vich_data.vichisliniya_listov_fit_landscape_total = 0
                vich_data.vichisliniya_listov_fit_portrait_total = 0
                vich_data.vichisliniya_listov_fit_horizontal = 0
                vich_data.vichisliniya_listov_fit_vertical = 0
                vich_data.vichisliniya_listov_fit_total = 0
                vich_data.save()
                circulation = component.proschet.circulation or 1
                new_list_count = vich_data.vichisliniya_listov_calculate_list_count(circulation)
                vich_data.vichisliniya_listov_list_count = new_list_count
                vich_data.save()
            else:
                try:
                    from devices.models import Printer
                    printer = Printer.objects.get(id=field_value)
                    component.printer = printer
                    if printer.sheet_format and printer.margin_mm is not None:
                        sheet_width = printer.sheet_format.width_mm
                        sheet_height = printer.sheet_format.height_mm
                        margin = printer.margin_mm
                        vich_data.calculate_fitting(sheet_width, sheet_height, margin)
                    else:
                        vich_data.vichisliniya_listov_fit_landscape_total = 0
                        vich_data.vichisliniya_listov_fit_portrait_total = 0
                        vich_data.vichisliniya_listov_fit_horizontal = 0
                        vich_data.vichisliniya_listov_fit_vertical = 0
                        vich_data.vichisliniya_listov_fit_total = 0
                    vich_data.save()
                    circulation = component.proschet.circulation or 1
                    new_list_count = vich_data.vichisliniya_listov_calculate_list_count(circulation)
                    vich_data.vichisliniya_listov_list_count = new_list_count
                    vich_data.save()
                    sheet_count = new_list_count
                    if sheet_count > 0:
                        sheet_count_int = int(float(sheet_count))
                        new_price = PrintComponent.calculate_price_for_printer_and_copies(
                            printer, sheet_count_int, component.print_type
                        )
                        component.price_per_sheet = new_price
                    else:
                        component.price_per_sheet = Decimal('0.00')
                except Exception as e:
                    return JsonResponse({'success': False, 'message': f'Принтер не найден: {str(e)}'}, status=404)

        # Обработка изменения бумаги
        elif field_name == 'paper':
            if not field_value:
                return JsonResponse({'success': False, 'message': 'Бумага обязательна'}, status=400)
            try:
                from sklad.models import Material
                paper = Material.objects.get(id=field_value)
                if paper.type != 'paper':
                    return JsonResponse({
                        'success': False,
                        'message': f'Материал "{paper.name}" не является бумагой (тип: {paper.type}). Выберите бумагу.'
                    }, status=400)
                component.paper = paper
            except Exception as e:
                return JsonResponse({'success': False, 'message': f'Бумага не найдена: {str(e)}'}, status=404)

        # Обработка изменения цены за лист
        elif field_name == 'price_per_sheet':
            try:
                price = Decimal(field_value)
                if price < 0:
                    return JsonResponse({'success': False, 'message': 'Цена не может быть отрицательной'}, status=400)
                component.price_per_sheet = price
            except (ValueError, InvalidOperation):
                return JsonResponse({'success': False, 'message': 'Некорректный формат цены'}, status=400)

        # Обработка изменения режима печати
        elif field_name == 'printing_mode':
            if field_value not in ['single', 'duplex']:
                return JsonResponse({'success': False, 'message': 'Некорректное значение режима печати'}, status=400)
            component.printing_mode = field_value
        else:
            return JsonResponse({'success': False, 'message': f'Поле "{field_name}" не поддерживается'}, status=400)

        component.refresh_total_price()
        component.save()

        print(f"✅ Компонент обновлён и сохранён: ID={component.id}")

        updated_data = {
            'id': component.id,
            'number': component.number,
            'printer_name': component.printer.name if component.printer else 'Принтер не выбран',
            'paper_name': component.paper.name if component.paper else 'Бумага не выбрана',
            'print_type': component.print_type,                     # НОВОЕ
            'print_type_display': component.print_type_display_name, # НОВОЕ
            'sheet_count': float(vich_data.vichisliniya_listov_list_count),
            'formatted_sheet_count_display': f"{float(vich_data.vichisliniya_listov_list_count):,.2f}".replace(',', ' '),
            'price_per_sheet': str(component.price_per_sheet),
            'formatted_price_per_sheet': component.formatted_price_per_sheet,
            'total_circulation_price': str(component.total_circulation_price),
            'formatted_total_circulation_price': component.formatted_total_circulation_price,
            'paper_price': float(component.material_price_per_unit),
            'printing_mode': component.printing_mode,
            'printing_mode_display': component.printing_mode_display_name,
            'runs_count': int(vich_data.vichisliniya_listov_list_count) * (2 if component.printing_mode == 'duplex' else 1),
            'cuts_count': vich_data.vichisliniya_listov_cuts_count,
        }

        return JsonResponse({'success': True, 'message': 'Компонент успешно обновлён', 'updated_data': updated_data})
    except Exception as e:
        print(f"🔥 Критическая ошибка в update_print_component: {str(e)}")
        import traceback
        traceback.print_exc()
        return JsonResponse({'success': False, 'message': f'Внутренняя ошибка: {str(e)}'}, status=500)


@login_required
@require_POST
def delete_print_component(request):
    """Мягкое удаление печатного компонента (устанавливает is_deleted=True)."""
    try:
        component_id = request.POST.get('component_id')
        if not component_id:
            return JsonResponse({'success': False, 'message': 'Не указан ID компонента'}, status=400)
        try:
            component = PrintComponent.objects.get(id=component_id, is_deleted=False)
        except PrintComponent.DoesNotExist:
            return JsonResponse({'success': False, 'message': 'Компонент печати не найден или уже удален'}, status=404)
        component.is_deleted = True
        component.save()
        return JsonResponse({'success': True, 'message': 'Компонент печати успешно удален', 'component_id': component_id})
    except Exception as e:
        return JsonResponse({'success': False, 'message': f'Ошибка при удалении компонента: {str(e)}'}, status=500)


@login_required
@require_GET
def get_proschet(request, proschet_id):
    """Возвращает данные просчёта в формате JSON."""
    try:
        proschet = Proschet.objects.get(id=proschet_id, is_deleted=False)
        proschet_data = {
            'id': proschet.id,
            'number': proschet.number,
            'title': proschet.title,
            'circulation': proschet.circulation,
            'formatted_circulation': proschet.formatted_circulation,
            'created_at': proschet.formatted_created_at,
            'client': None
        }
        if proschet.client:
            proschet_data['client'] = {
                'id': proschet.client.id,
                'name': proschet.client.name,
                'client_number': proschet.client.client_number,
                'discount': proschet.client.discount,
                'has_edo': proschet.client.has_edo
            }
        return JsonResponse({'success': True, 'proschet': proschet_data})
    except Proschet.DoesNotExist:
        return JsonResponse({'success': False, 'message': 'Просчёт не найден'})
    except Exception as e:
        return JsonResponse({'success': False, 'message': f'Ошибка сервера: {str(e)}'})


@login_required
@require_POST
@csrf_exempt
def update_proschet_circulation(request, proschet_id):
    """Обновляет тираж просчёта через AJAX запрос."""
    try:
        proschet = Proschet.objects.get(id=proschet_id, is_deleted=False)
        circulation = request.POST.get('circulation')
        if not circulation:
            return JsonResponse({'success': False, 'message': 'Тираж не указан'})
        try:
            circulation_int = int(circulation)
            if circulation_int <= 0:
                return JsonResponse({'success': False, 'message': 'Тираж должен быть положительным числом'})
            proschet.circulation = circulation_int
            proschet.save()
            return JsonResponse({
                'success': True,
                'message': 'Тираж успешно обновлен',
                'circulation': proschet.circulation,
                'formatted_circulation': proschet.formatted_circulation
            })
        except ValueError:
            return JsonResponse({'success': False, 'message': 'Тираж должен быть целым числом'})
    except Proschet.DoesNotExist:
        return JsonResponse({'success': False, 'message': 'Просчёт не найден'})
    except Exception as e:
        return JsonResponse({'success': False, 'message': f'Ошибка сервера: {str(e)}'})


@login_required
@require_http_methods(["POST"])
@csrf_exempt
def recalculate_components_for_circulation(request, proschet_id):
    """
    Пересчитывает цены для всех компонентов печати при изменении тиража просчёта.
    Учитывает тип печати каждого компонента и активный режим (одностраничный/многостраничный).
    """
    print(f"🔄 Запрос на пересчёт компонентов для просчёта ID={proschet_id}")

    try:
        proschet = Proschet.objects.get(id=proschet_id, is_deleted=False)
    except Proschet.DoesNotExist:
        return JsonResponse({'success': False, 'message': 'Просчёт не найден'}, status=404)

    new_circulation_str = request.POST.get('circulation', '').strip()
    if not new_circulation_str:
        return JsonResponse({'success': False, 'message': 'Не указан новый тираж'}, status=400)

    try:
        new_circulation = int(new_circulation_str)
        if new_circulation <= 0:
            return JsonResponse({'success': False, 'message': 'Тираж должен быть положительным'}, status=400)
    except ValueError:
        return JsonResponse({'success': False, 'message': 'Тираж должен быть целым числом'}, status=400)

    proschet.circulation = new_circulation
    proschet.save()
    print(f"✅ Тираж просчёта обновлён: {new_circulation} шт.")

    components = PrintComponent.objects.filter(proschet=proschet, is_deleted=False)

    # ===== ЗАГРУЖАЕМ МНОГОСТРАНИЧНЫЕ ДАННЫЕ =====
    multipage_qs = VichisliniyaMultipageModel.objects.filter(
        print_component__in=components
    ).values('print_component_id', 'sheet_count', 'is_active')
    multipage_dict = {item['print_component_id']: item for item in multipage_qs}

    updated_components = []
    total_price_sum = Decimal('0.00')

    for component in components:
        multipage_info = multipage_dict.get(component.id)

        if multipage_info and multipage_info['is_active']:
            # ===== МНОГОСТРАНИЧНЫЙ РЕЖИМ =====
            try:
                multipage_obj = VichisliniyaMultipageModel.objects.get(print_component=component)
                # Обновляем тираж (copies) и пересчитываем количество листов
                multipage_obj.copies = new_circulation
                multipage_obj.calculate_sheet_count()
                multipage_obj.save()
                sheet_count = multipage_obj.sheet_count
            except VichisliniyaMultipageModel.DoesNotExist:
                sheet_count = Decimal('0.00')
        else:
            # ===== ОДНОСТРАНИЧНЫЙ РЕЖИМ =====
            vich_data, created = VichisliniyaListovModel.objects.get_or_create(
                vichisliniya_listov_print_component=component,
                defaults={
                    'vichisliniya_listov_vyleta': 1,
                    'vichisliniya_listov_polosa_count': 1,
                    'vichisliniya_listov_color': '4+0',
                    'vichisliniya_listov_list_count': 0.00,
                }
            )
            new_list_count = vich_data.vichisliniya_listov_calculate_list_count(new_circulation)
            vich_data.vichisliniya_listov_list_count = new_list_count
            vich_data.save()
            sheet_count = new_list_count

        sheet_count_float = float(sheet_count)

        # Расчёт цены за лист (учитывает print_type компонента)
        if component.printer and sheet_count_float > 0:
            copies_int = int(sheet_count_float)
            cost, markup = get_cost_and_markup_for_printer_and_copies(
                component.printer, copies_int, component.print_type
            )
            component.price_per_sheet = cost + (cost * markup / Decimal('100'))
            component.price_per_sheet = component.price_per_sheet.quantize(Decimal('0.01'))
        else:
            component.price_per_sheet = Decimal('0.00')
            cost = Decimal('0.00')
            markup = Decimal('0.00')

        component.refresh_total_price()
        component.save(update_fields=['price_per_sheet', 'total_circulation_price'])
        total_price_sum += component.total_circulation_price

        profit = component.price_per_sheet - cost
        runs_count = int(sheet_count_float) * (2 if component.printing_mode == 'duplex' else 1)

        component_data = {
            'id': component.id,
            'number': component.number,
            'printer_name': component.printer.name if component.printer else 'Принтер не выбран',
            'paper_name': component.paper.name if component.paper else 'Бумага не выбрана',
            'print_type': component.print_type,
            'print_type_display': component.print_type_display_name,
            'sheet_count': sheet_count_float,
            'formatted_sheet_count_display': f"{sheet_count_float:,.2f}".replace(',', ' '),
            'price_per_sheet': str(component.price_per_sheet),
            'formatted_price_per_sheet': component.formatted_price_per_sheet,
            'total_circulation_price': str(component.total_circulation_price),
            'formatted_total_circulation_price': component.formatted_total_circulation_price,
            'paper_price': float(component.material_price_per_unit),
            'printing_mode': component.printing_mode,
            'printing_mode_display': component.printing_mode_display_name,
            'runs_count': runs_count,
            'cost': str(cost),
            'formatted_cost': f"{cost:.2f} ₽",
            'markup_percent': str(markup),
            'formatted_markup_percent': f"{markup}%",
            'profit_per_unit': str(profit),
            'formatted_profit_per_unit': f"{profit:.2f} ₽",
        }
        updated_components.append(component_data)

    print(f"✅ Массовый пересчёт завершён. Обновлено {len(updated_components)} компонентов")
    return JsonResponse({
        'success': True,
        'message': f'Цены и количество листов компонентов пересчитаны для тиража {new_circulation} шт.',
        'components': updated_components,
        'circulation': new_circulation,
        'formatted_circulation': f"{new_circulation:,}".replace(',', ' '),
        'updated_count': len(updated_components),
        'total_price': float(total_price_sum),
    })


# ============================================================================
# РАБОТА С ДОПОЛНИТЕЛЬНЫМИ РАБОТАМИ (без изменений для ч/б)
# ============================================================================

@login_required
@require_GET
def get_additional_works(request, component_id):
    component = get_object_or_404(PrintComponent, id=component_id, is_deleted=False)
    works = AdditionalWork.objects.filter(print_component=component, is_deleted=False).order_by('created_at')

    try:
        vich_obj = VichisliniyaListovModel.objects.get(
            vichisliniya_listov_print_component=component
        )
        vich_data = {
            'item_width': float(vich_obj.vichisliniya_listov_item_width),
            'item_height': float(vich_obj.vichisliniya_listov_item_height),
            'list_count': vich_obj.vichisliniya_listov_list_count,
            'fit_total': vich_obj.vichisliniya_listov_fit_total,
            'cuts_count': vich_obj.vichisliniya_listov_cuts_count,
        }
        sheet_count_decimal = vich_obj.vichisliniya_listov_list_count
        cuts_count = vich_obj.vichisliniya_listov_cuts_count
    except VichisliniyaListovModel.DoesNotExist:
        vich_data = {
            'item_width': 0.0,
            'item_height': 0.0,
            'list_count': Decimal('0'),
            'fit_total': 0,
            'cuts_count': 0,
        }
        sheet_count_decimal = Decimal('0')
        cuts_count = 0

    proschet = component.proschet
    circulation = proschet.circulation if proschet and proschet.circulation else 1

    for work in works:
        work.recalculate_price(sheet_count_decimal, cuts_count, circulation)
        work.save(update_fields=['total_price'])

    works_data = [work.to_dict() for work in works]

    component_info = {
        'id': component.id,
        'number': component.number,
        'sheet_count': str(component.get_sheet_count()) if component.get_sheet_count() else '0',
        'printer_name': component.printer.name if component.printer else None,
    }

    proschet_info = {
        'id': proschet.id,
        'number': proschet.number,
        'circulation': proschet.circulation,
    }

    return JsonResponse({
        'success': True,
        'works': works_data,
        'component_info': component_info,
        'proschet_info': proschet_info,
        'vich_data': vich_data,
    })


@login_required
@require_POST
def add_additional_work(request):
    try:
        print_component_id = request.POST.get('print_component_id')
        work_id = request.POST.get('work_id')
        title = request.POST.get('title', '').strip()
        price = request.POST.get('price')
        quantity = request.POST.get('quantity', 1)

        if not print_component_id:
            return JsonResponse({'success': False, 'message': 'Не указан компонент'})

        component = get_object_or_404(PrintComponent, id=print_component_id)

        try:
            price = Decimal(price) if price else None
        except:
            return JsonResponse({'success': False, 'message': 'Некорректная цена'})

        try:
            quantity = int(quantity)
            if quantity < 1:
                quantity = 1
        except:
            quantity = 1

        work = AdditionalWork(
            print_component=component,
            title=title,
            price=price or Decimal('0.00'),
            quantity=quantity,
        )

        if work_id:
            try:
                source_work = Work.objects.get(id=work_id)
                work.work = source_work
                work.formula_type = source_work.formula_type
                work.lines_count = source_work.default_lines_count
                work.items_per_sheet = source_work.default_items_per_sheet
                work.cost = source_work.cost
                work.markup_percent = source_work.markup_percent
                work.price = source_work.price
            except Work.DoesNotExist:
                pass

        work.save()

        return JsonResponse({
            'success': True,
            'work': work.to_dict(),
            'message': 'Работа успешно добавлена'
        })
    except Exception as e:
        return JsonResponse({'success': False, 'message': str(e)})


@login_required
@require_POST
def update_additional_work(request):
    try:
        work_id = request.POST.get('work_id')
        field_name = request.POST.get('field_name')
        field_value = request.POST.get('field_value')

        if not work_id or not field_name:
            return JsonResponse({'success': False, 'message': 'Недостаточно данных'})

        work = get_object_or_404(AdditionalWork, id=work_id)

        allowed_fields = ['title', 'price', 'quantity', 'formula_type', 'lines_count', 'items_per_sheet']
        if field_name not in allowed_fields:
            return JsonResponse({'success': False, 'message': f'Поле "{field_name}" нельзя редактировать'})

        if field_name in ['price']:
            try:
                field_value = Decimal(field_value)
                if field_value < 0:
                    raise ValueError
            except:
                return JsonResponse({'success': False, 'message': 'Некорректное значение цены'})
        elif field_name in ['quantity', 'formula_type', 'lines_count', 'items_per_sheet']:
            try:
                field_value = int(field_value)
                if field_name != 'formula_type' and field_value < 1:
                    field_value = 1
                if field_name == 'formula_type' and field_value not in [1,2,3,4,5,6]:
                    return JsonResponse({'success': False, 'message': 'Некорректный тип формулы'})
            except:
                return JsonResponse({'success': False, 'message': 'Некорректное целое число'})
        elif field_name == 'title':
            field_value = field_value.strip()
            if not field_value:
                return JsonResponse({'success': False, 'message': 'Название не может быть пустым'})

        setattr(work, field_name, field_value)
        work.save()

        return JsonResponse({
            'success': True,
            'work': work.to_dict(),
            'message': 'Данные обновлены'
        })
    except Exception as e:
        return JsonResponse({'success': False, 'message': str(e)})


@login_required
@require_POST
def delete_additional_work(request):
    try:
        work_id = request.POST.get('work_id')
        work = get_object_or_404(AdditionalWork, id=work_id)
        work.is_deleted = True
        work.save()
        return JsonResponse({'success': True, 'message': 'Работа удалена'})
    except Exception as e:
        return JsonResponse({'success': False, 'message': str(e)})


@login_required
@require_GET
def get_spravochnik_works(request):
    works = Work.objects.all().order_by('name')
    works_data = [{
        'id': w.id,
        'name': w.name,
        'price': str(w.price),
        'formula_type': w.formula_type,
        'formula_display': w.get_formula_type_display(),
        'default_lines_count': w.default_lines_count,
        'default_items_per_sheet': w.default_items_per_sheet,
    } for w in works]
    return JsonResponse({'success': True, 'works': works_data})


# ============================================================================
# РАБОТА С ЛАМИНАЦИЕЙ (без изменений для ч/б)
# ============================================================================

@login_required
@require_GET
def get_lamination_data(request, component_id):
    component = get_object_or_404(PrintComponent, id=component_id, is_deleted=False)
    lamination, created = Laminate.objects.get_or_create(print_component=component)
    try:
        vich_data = VichisliniyaListovModel.objects.get(
            vichisliniya_listov_print_component=component
        )
        sheet_count = vich_data.vichisliniya_listov_list_count
    except VichisliniyaListovModel.DoesNotExist:
        sheet_count = Decimal('0.00')
    lamination.recalculate_price(sheet_count)
    lamination.save()
    return JsonResponse({
        'success': True,
        'lamination': lamination.to_dict()
    })


@login_required
@require_POST
def update_lamination(request):
    try:
        data = json.loads(request.body)
        component_id = data.get('print_component_id')
        field_name = data.get('field_name')
        field_value = data.get('field_value')

        if not component_id or not field_name:
            return JsonResponse({'success': False, 'error': 'Не указаны обязательные поля'}, status=400)

        component = get_object_or_404(PrintComponent, id=component_id, is_deleted=False)
        lamination, created = Laminate.objects.get_or_create(print_component=component)

        if field_name == 'is_enabled':
            if isinstance(field_value, str):
                lamination.is_enabled = field_value.lower() in ('true', '1', 'yes', 'да')
            else:
                lamination.is_enabled = bool(field_value)
        elif field_name == 'laminator':
            if field_value and field_value != 'null' and field_value != '':
                try:
                    laminator = Laminator.objects.get(id=field_value)
                    lamination.laminator = laminator
                except Laminator.DoesNotExist:
                    return JsonResponse({'success': False, 'error': 'Ламинатор не найден'}, status=400)
            else:
                lamination.laminator = None
        elif field_name == 'film':
            if field_value and field_value != 'null' and field_value != '':
                try:
                    film = Material.objects.get(id=field_value, type='film')
                    lamination.film = film
                except Material.DoesNotExist:
                    return JsonResponse({'success': False, 'error': 'Плёнка не найдена'}, status=400)
            else:
                lamination.film = None
        elif field_name == 'side':
            if field_value not in ['single', 'duplex']:
                return JsonResponse({'success': False, 'error': 'Некорректное значение стороны'}, status=400)
            lamination.side = field_value
        else:
            return JsonResponse({'success': False, 'error': f'Недопустимое поле: {field_name}'}, status=400)

        try:
            vich_data = VichisliniyaListovModel.objects.get(
                vichisliniya_listov_print_component=component
            )
            sheet_count = vich_data.vichisliniya_listov_list_count
        except VichisliniyaListovModel.DoesNotExist:
            sheet_count = Decimal('0.00')

        lamination.recalculate_price(sheet_count)
        lamination.save()

        return JsonResponse({
            'success': True,
            'lamination': lamination.to_dict()
        })
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=500)


# ============================================================================
# РАБОТА С ЦЕНОЙ (ИТОГОВАЯ СТОИМОСТЬ) – с учётом print_type
# ============================================================================

@login_required
@require_GET
def get_proschet_price_data(request, proschet_id):
    """
    Получение данных о просчёте для расчёта цены.
    Возвращает печатные компоненты, дополнительные работы, ламинации и итоговые суммы.
    В компонентах теперь есть print_type.
    """
    try:
        proschet = Proschet.objects.get(id=proschet_id, is_deleted=False)
        components = PrintComponent.objects.filter(
            proschet=proschet,
            is_deleted=False
        ).select_related('printer', 'paper')

        vich_data_qs = VichisliniyaListovModel.objects.filter(
            vichisliniya_listov_print_component__in=components
        ).values(
            'vichisliniya_listov_print_component_id',
            'vichisliniya_listov_list_count',
            'vichisliniya_listov_item_width',
            'vichisliniya_listov_item_height'
        )
        vich_dict = {
            item['vichisliniya_listov_print_component_id']: {
                'list_count': item['vichisliniya_listov_list_count'],
                'item_width': item['vichisliniya_listov_item_width'],
                'item_height': item['vichisliniya_listov_item_height'],
            }
            for item in vich_data_qs
        }

        components_data = []
        laminations_data = []

        for comp in components:
            sheet_count = vich_dict.get(comp.id, {}).get('list_count', Decimal('0.00'))
            sheet_count_float = float(sheet_count)

            cost = Decimal('0.00')
            markup = Decimal('0.00')
            price_per_sheet = Decimal('0.00')

            if comp.printer and sheet_count_float > 0:
                copies_int = int(sheet_count_float)
                cost, markup = get_cost_and_markup_for_printer_and_copies(
                    comp.printer, copies_int, comp.print_type
                )
                price_per_sheet = cost + (cost * markup / Decimal('100'))
                cost = cost.quantize(Decimal('0.01'))
                markup = markup.quantize(Decimal('0.01'))
                price_per_sheet = price_per_sheet.quantize(Decimal('0.01'))
            else:
                cost = Decimal('0.00')
                markup = Decimal('0.00')
                price_per_sheet = Decimal('0.00')

            profit_per_unit = price_per_sheet - cost
            runs_count = int(sheet_count_float) * (2 if comp.printing_mode == 'duplex' else 1)
            paper_price = comp.material_price_per_unit

            comp.price_per_sheet = price_per_sheet
            comp.refresh_total_price()
            comp.save(update_fields=['price_per_sheet', 'total_circulation_price'])

            paper_density = None
            if comp.paper and comp.paper.density:
                paper_density = comp.paper.density
            paper_thickness = None
            if comp.paper and comp.paper.paper_thickness:
                paper_thickness = float(comp.paper.paper_thickness)
            item_width = float(vich_dict.get(comp.id, {}).get('item_width', Decimal('0')))
            item_height = float(vich_dict.get(comp.id, {}).get('item_height', Decimal('0')))

            components_data.append({
                'id': comp.id,
                'number': comp.number,
                'printer_name': comp.printer.name if comp.printer else None,
                'paper_name': comp.paper.name if comp.paper else None,
                'print_type': comp.print_type,                     # НОВОЕ
                'print_type_display': comp.print_type_display_name,
                'sheet_count': sheet_count_float,
                'formatted_sheet_count_display': f"{sheet_count_float:,.2f}".replace(',', ' ') if sheet_count_float > 0 else "0.00",
                'price_per_sheet': float(price_per_sheet),
                'total_circulation_price': float(comp.total_circulation_price),
                'cost': float(cost),
                'markup_percent': float(markup),
                'profit_per_unit': float(profit_per_unit),
                'runs_count': runs_count,
                'paper_price': float(paper_price),
                'printing_mode': comp.printing_mode,
                'printing_mode_display': comp.printing_mode_display_name,
                'paper_density': paper_density,
                'paper_thickness': paper_thickness,
                'item_width': item_width,
                'item_height': item_height,
            })

            lam, created = Laminate.objects.get_or_create(print_component=comp)
            lam.recalculate_price(sheet_count)
            lam.save()

            film_thickness = None
            if lam.film and lam.film.thickness:
                film_thickness = lam.film.thickness

            laminations_data.append({
                'component_id': comp.id,
                'is_enabled': lam.is_enabled,
                'laminator_id': lam.laminator.id if lam.laminator else None,
                'laminator_name': lam.laminator.name if lam.laminator else None,
                'film_id': lam.film.id if lam.film else None,
                'film_name': lam.film.name if lam.film else None,
                'laminator_cost': float(lam.laminator_cost),
                'laminator_cost_display': f"{lam.laminator_cost:.2f} руб.",
                'laminator_markup': float(lam.laminator_markup),
                'laminator_markup_display': f"{lam.laminator_markup}%",
                'laminator_price': float(lam.laminator_price),
                'laminator_price_display': f"{lam.laminator_price:.2f} руб./лист",
                'film_price': float(lam.film_price),
                'film_price_display': f"{lam.film_price:.2f} руб./лист",
                'total_price': float(lam.total_price),
                'total_price_display': f"{lam.total_price:.2f} ₽",
                'sheet_count': float(sheet_count),
                'sheet_count_display': f"{float(sheet_count):,.2f}".replace(',', ' ') if sheet_count > 0 else "0.00",
                'side': lam.side,
                'side_display': lam.get_side_display(),
                'film_thickness': film_thickness,
            })

        all_works = []
        total_works_sum = Decimal('0.00')
        for comp in components:
            works_qs = comp.additional_works.filter(is_deleted=False)
            for work in works_qs:
                work_dict = work.to_dict()
                work_dict['component_id'] = comp.id
                all_works.append(work_dict)
                total_works_sum += work.total_price

        total_print_price = sum(comp.total_circulation_price for comp in components)
        total_price = total_print_price + total_works_sum

        return JsonResponse({
            'success': True,
            'proschet': {
                'id': proschet.id,
                'number': proschet.number,
                'title': proschet.title,
                'circulation': proschet.circulation,
            },
            'print_components': components_data,
            'additional_works': all_works,
            'laminations': laminations_data,
            'summary': {
                'print_components_total': str(total_print_price),
                'formatted_print_components_total': f"{total_print_price:.2f} ₽",
                'additional_works_total': str(total_works_sum),
                'formatted_additional_works_total': f"{total_works_sum:.2f} ₽",
                'total_price': str(total_price),
                'formatted_total_price': f"{total_price:.2f} ₽",
            }
        })
    except Proschet.DoesNotExist:
        return JsonResponse({'success': False, 'message': 'Просчёт не найден'}, status=404)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JsonResponse({'success': False, 'message': f'Ошибка сервера: {str(e)}'}, status=500)


@require_POST
@csrf_exempt
def update_component_price(request):
    """
    API для обновления стоимости печатного компонента на основе нового количества листов.
    Использует интерполяцию себестоимости и наценки с учётом типа печати.
    """
    try:
        data = json.loads(request.body)
        component_id = data.get('component_id')
        sheet_count_from_request = data.get('sheet_count')
        proschet_id = data.get('proschet_id')

        if not component_id or not proschet_id or sheet_count_from_request is None:
            return JsonResponse({
                'success': False,
                'message': 'Не указан ID компонента, просчёта или количество листов'
            }, status=400)

        try:
            component = PrintComponent.objects.get(
                id=component_id,
                proschet_id=proschet_id,
                is_deleted=False
            )
        except PrintComponent.DoesNotExist:
            return JsonResponse({'success': False, 'message': f'Компонент с ID {component_id} не найден'}, status=404)

        sheet_count_decimal = Decimal(str(sheet_count_from_request))

        if component.printer and sheet_count_decimal > 0:
            copies_int = int(sheet_count_decimal)
            # Передаём print_type компонента
            cost, markup = get_cost_and_markup_for_printer_and_copies(
                component.printer, copies_int, component.print_type
            )
            new_price = cost + (cost * markup / Decimal('100'))
            component.price_per_sheet = new_price.quantize(Decimal('0.01'))
        else:
            component.price_per_sheet = Decimal('0.00')
            cost = Decimal('0.00')
            markup = Decimal('0.00')

        component.save(update_fields=['price_per_sheet'])
        component.refresh_total_price()
        component.save(update_fields=['total_circulation_price'])

        total_price = Decimal('0.00')
        try:
            proschet_components = PrintComponent.objects.filter(
                proschet_id=proschet_id, is_deleted=False
            )
            for comp in proschet_components:
                total_price += comp.total_circulation_price
        except Exception as e:
            print(f"⚠️ Ошибка при расчёте общей стоимости: {e}")
            total_price = component.total_circulation_price

        def format_price(p): return f"{float(p):.2f} ₽"
        def format_sheet_count(c): return f"{float(c):,.2f}".replace(',', ' ')

        runs_count = int(sheet_count_decimal) * (2 if component.printing_mode == 'duplex' else 1)
        profit = component.price_per_sheet - cost

        return JsonResponse({
            'success': True,
            'message': f'Стоимость пересчитана',
            'component': {
                'id': component.id,
                'number': component.number,
                'printer_name': component.printer.name if component.printer else 'Принтер не выбран',
                'paper_name': component.paper.name if component.paper else 'Бумага не выбрана',
                'print_type': component.print_type,
                'print_type_display': component.print_type_display_name,
                'paper_price': float(component.material_price_per_unit),
                'formatted_paper_price': format_price(component.material_price_per_unit),
                'sheet_count': float(sheet_count_decimal),
                'sheet_count_display': format_sheet_count(sheet_count_decimal),
                'price_per_sheet': float(component.price_per_sheet),
                'formatted_price_per_sheet': format_price(component.price_per_sheet),
                'total_circulation_price': float(component.total_circulation_price),
                'formatted_total_circulation_price': format_price(component.total_circulation_price),
                'printing_mode': component.printing_mode,
                'printing_mode_display': component.printing_mode_display_name,
                'runs_count': runs_count,
                'cost': float(cost),
                'formatted_cost': format_price(cost),
                'markup_percent': float(markup),
                'formatted_markup_percent': f"{markup}%",
                'profit_per_unit': float(profit),
                'formatted_profit_per_unit': format_price(profit),
            },
            'total_price': float(total_price),
            'calculation_details': {
                'based_on': 'client_provided_sheet_count',
                'sheet_count_used': float(sheet_count_decimal),
                'price_recalculated': True,
                'paper_included': bool(component.paper),
                'printing_mode': component.printing_mode,
            }
        })
    except json.JSONDecodeError:
        return JsonResponse({'success': False, 'message': 'Ошибка разбора JSON'}, status=400)
    except Exception as e:
        import traceback
        print(traceback.format_exc())
        return JsonResponse({'success': False, 'message': f'Внутренняя ошибка: {str(e)}'}, status=500)