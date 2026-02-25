# calculator/views.py

from django.shortcuts import render, redirect, get_object_or_404
from django.http import JsonResponse
from baza_klientov.models import Client  # Импортируем модель клиентов
from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_POST, require_http_methods, require_GET
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.cache import never_cache
from django.contrib import messages
import json

# ИСПРАВЛЕНИЕ: Добавляем недостающие импорты
from decimal import Decimal, InvalidOperation
from .forms import ProschetForm
from .models_list_proschet import Proschet, PrintComponent, AdditionalWork  # ИСПРАВЛЕНО: правильный импорт моделей
from devices.models import Printer
from print_price.models import PrintPrice
# Импортируем модель вычислений листов (из приложения vichisliniya_listov)
from vichisliniya_listov.models import VichisliniyaListovModel

@login_required(login_url='/login/')
@never_cache
def index(request):
    """
    Главная страница калькулятора с упрощенным списком просчётов.
    ОБНОВЛЕНО: Добавлена загрузка клиентов для формы
    """
    
    # Получаем ВСЕ активные просчёты (не удаленные)
    proschets = Proschet.objects.filter(is_deleted=False).order_by('-created_at')
    
    # Загружаем список клиентов для формы
    clients = []
    try:
        from baza_klientov.models import Client
        clients = Client.objects.all().order_by('client_number')
    except ImportError:
        pass  # Если приложение не установлено, оставляем пустой список
    
    # Создаем пустую форму для создания нового просчёта
    form = ProschetForm()
    
    # Подготавливаем контекст для шаблона
    context = {
        'proschets': proschets,  # Список всех активных просчётов
        'form': form,  # Форма для создания нового просчёта
        'clients': clients,  # Список клиентов для выпадающего списка
        'current_user': request.user,  # Текущий пользователь
        'total_count': proschets.count(),  # Общее количество просчётов
        'active_app': 'calculator',
    }
    
    # Если запрос AJAX
    if request.headers.get('x-requested-with') == 'XMLHttpRequest':
        # Подготавливаем данные для JSON-ответа
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
        
        # Возвращаем JSON вместо HTML
        return JsonResponse({
            'success': True,
            'proschets': proschets_data,
            'total_count': proschets.count()
        })
    
    # Обычный запрос - рендерим HTML-страницу
    return render(request, 'calculator/index.html', context)


@login_required
@require_POST
def update_proschet_title(request, proschet_id):
    """
    ОБНОВЛЕНИЕ НАЗВАНИЯ ПРОСЧЁТА ПРИ INLINE-РЕДАКТИРОВАНИИ
    Принимает AJAX запрос с новым названием и обновляет запись в базе данных.
    
    Args:
        request: HTTP запрос от клиента
        proschet_id: ID просчёта для обновления (из URL)
    
    Returns:
        JsonResponse: JSON ответ с результатом операции
    """
    
    print(f"🔄 Запрос на обновление названия просчёта ID={proschet_id}")
    
    try:
        # Получаем просчёт из базы данных
        # Используем filter с is_deleted=False чтобы получить только активные просчёты
        proschet = Proschet.objects.get(id=proschet_id, is_deleted=False)
    except Proschet.DoesNotExist:
        # Если просчёт не найден или удален, возвращаем ошибку 404
        print(f"❌ Просчёт с ID={proschet_id} не найден или удален")
        return JsonResponse({
            'success': False,                        # Флаг неудачи
            'message': 'Просчёт не найден или удален' # Сообщение об ошибке
        }, status=404)                                # HTTP статус 404 Not Found
    
    # Получаем новое значение названия из POST запроса
    # Используем get() с значением по умолчанию '' чтобы избежать KeyError
    new_title = request.POST.get('value', '').strip()
    field_name = request.POST.get('field', 'title')
    
    print(f"📝 Получены данные: поле='{field_name}', значение='{new_title}'")
    
    # Проверяем, что поле действительно является названием
    if field_name != 'title':
        print(f"❌ Поле '{field_name}' не поддерживается для редактирования")
        return JsonResponse({
            'success': False,
            'message': f'Поле "{field_name}" не поддерживается для редактирования'
        }, status=400)  # HTTP статус 400 Bad Request
    
    # ВАЛИДАЦИЯ ДАННЫХ:
    # 1. Проверяем что название не пустое
    if not new_title:
        print("❌ Название не может быть пустым")
        return JsonResponse({
            'success': False,
            'message': 'Название не может быть пустым'
        }, status=400)
    
    # 2. Проверяем минимальную длину названия
    if len(new_title) < 3:
        print(f"❌ Название слишком короткое: {len(new_title)} символов")
        return JsonResponse({
            'success': False,
            'message': 'Название должно содержать минимум 3 символа'
        }, status=400)
    
    # 3. Проверяем максимальную длину названия
    if len(new_title) > 200:
        print(f"❌ Название слишком длинное: {len(new_title)} символов")
        return JsonResponse({
            'success': False,
            'message': 'Название не должно превышать 200 символов'
        }, status=400)
    
    # Сохраняем старое название для логирования
    old_title = proschet.title
    
    # Обновляем название просчёта
    proschet.title = new_title
    
    try:
        # Сохраняем изменения в базе данных
        proschet.save()
        
        print(f"✅ Название успешно обновлено: '{old_title}' → '{new_title}'")
        
        # Возвращаем успешный ответ
        return JsonResponse({
            'success': True,                          # Флаг успеха
            'message': 'Название успешно обновлено',  # Сообщение об успехе
            'new_title': new_title,                   # Новое название для клиента
            'proschet_id': proschet.id,              # ID обновленного просчёта
            'proschet_number': proschet.number       # Номер просчёта для информации
        })
        
    except Exception as e:
        # Обработка исключений при сохранении в базу данных
        print(f"❌ Ошибка при сохранении в базу данных: {str(e)}")
        
        return JsonResponse({
            'success': False,
            'message': f'Ошибка при сохранении: {str(e)}'
        }, status=500)  # HTTP статус 500 Internal Server Error



@require_http_methods(["POST"])
def calculate_price_for_printer(request):
    """
    API endpoint для расчёта цены за лист на основе принтера и тиража
    Использует логику из приложения print_price
    
    Параметры (в теле POST запроса):
    - printer_id: ID принтера
    - circulation: тираж для расчёта
    
    Возвращает:
    - success: bool
    - calculated_price: Decimal (рассчитанная цена за лист)
    - message: str (сообщение об ошибке или успехе)
    """
    try:
        # Получаем данные из запроса
        data = json.loads(request.body)
        printer_id = data.get('printer_id')
        circulation = data.get('circulation')
        
        # Валидация входных данных
        if not printer_id:
            return JsonResponse({
                'success': False,
                'error': 'Не указан ID принтера'
            })
        
        if not circulation:
            return JsonResponse({
                'success': False,
                'error': 'Не указан тираж'
            })
        
        # Преобразуем тираж в число
        try:
            circulation_int = int(circulation)
        except ValueError:
            return JsonResponse({
                'success': False,
                'error': 'Тираж должен быть целым числом'
            })
        
        # Проверяем, что принтер существует
        try:
            printer = Printer.objects.get(id=printer_id)
        except Printer.DoesNotExist:
            return JsonResponse({
                'success': False,
                'error': f'Принтер с ID {printer_id} не найден'
            })
        
        # Получаем цены для этого принтера из приложения print_price
        print_prices = PrintPrice.objects.filter(printer=printer).order_by('copies')
        
        if not print_prices.exists():
            return JsonResponse({
                'success': False,
                'error': f'Для принтера "{printer.name}" нет установленных цен'
            })
        
        # Логика расчёта цены (упрощённая версия из print_price)
        # 1. Если тираж точно соответствует одной из записей
        exact_price = print_prices.filter(copies=circulation_int).first()
        if exact_price:
            return JsonResponse({
                'success': True,
                'calculated_price': str(exact_price.price_per_sheet),
                'interpolation_method': 'exact',
                'message': f'Найдена точная цена для тиража {circulation_int} шт.'
            })
        
        # 2. Если тираж меньше минимального
        min_price = print_prices.order_by('copies').first()
        if circulation_int < min_price.copies:
            return JsonResponse({
                'success': True,
                'calculated_price': str(min_price.price_per_sheet),
                'interpolation_method': 'min',
                'message': f'Использована минимальная цена (для тиража {min_price.copies} шт.)'
            })
        
        # 3. Если тираж больше максимального
        max_price = print_prices.order_by('-copies').first()
        if circulation_int > max_price.copies:
            return JsonResponse({
                'success': True,
                'calculated_price': str(max_price.price_per_sheet),
                'interpolation_method': 'max',
                'message': f'Использована максимальная цена (для тиража {max_price.copies} шт.)'
            })
        
        # 4. Интерполяция между двумя ближайшими значениями
        # Находим нижнюю и верхнюю границы
        lower_price = print_prices.filter(copies__lte=circulation_int).order_by('-copies').first()
        upper_price = print_prices.filter(copies__gte=circulation_int).order_by('copies').first()
        
        if lower_price and upper_price and lower_price.copies != upper_price.copies:
            # Линейная интерполяция
            x1 = lower_price.copies
            y1 = lower_price.price_per_sheet
            x2 = upper_price.copies
            y2 = upper_price.price_per_sheet
            
            # Формула линейной интерполяции
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
        
        # Если что-то пошло не так
        return JsonResponse({
            'success': False,
            'error': 'Не удалось рассчитать цену'
        })
        
    except json.JSONDecodeError:
        return JsonResponse({
            'success': False,
            'error': 'Неверный формат JSON в запросе'
        })
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': f'Внутренняя ошибка сервера: {str(e)}'
        })



@login_required
@require_http_methods(["POST"])
def create_proschet(request):
    """
    Создание нового просчёта.
    Принимает только название, остальное генерируется автоматически.
    """
    
    # Создаем экземпляр формы с данными из запроса
    form = ProschetForm(request.POST)
    
    # Проверяем валидность формы
    if form.is_valid():
        # Сохраняем просчёт (номер сгенерируется автоматически в методе save())
        proschet = form.save()
        
        # Если запрос AJAX
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
        
        # Обычный POST-запрос
        messages.success(request, f'Просчёт "{proschet.title}" успешно создан!')
        return redirect('calculator:index')
    
    else:
        # Если форма не валидна
        
        # AJAX-запрос с ошибками
        if request.headers.get('x-requested-with') == 'XMLHttpRequest':
            errors = {}
            for field, field_errors in form.errors.items():
                errors[field] = [str(error) for error in field_errors]
            
            return JsonResponse({
                'success': False,
                'message': 'Ошибка при создании просчёта',
                'errors': errors
            }, status=400)
        
        # Обычный запрос с ошибками
        messages.error(request, 'Пожалуйста, исправьте ошибки в форме.')
        
        # Получаем просчёты для контекста
        proschets = Proschet.objects.filter(is_deleted=False).order_by('-created_at')
        
        # Возвращаем страницу с формой и ошибками
        return render(request, 'calculator/index.html', {
            'proschets': proschets,
            'form': form
        })

@login_required
@require_http_methods(["POST"])
def bulk_delete_proschets(request):
    """
    Удаление выбранных просчётов.
    Принимает список ID просчётов для удаления.
    """
    
    # Получаем строку с ID из POST-запроса
    # Ожидаем параметр 'proschet_ids' в формате "1,2,3,4"
    proschet_ids_str = request.POST.get('proschet_ids', '')
    
    if not proschet_ids_str:
        return JsonResponse({
            'success': False,
            'message': 'Не указаны ID просчётов для удаления'
        }, status=400)
    
    try:
        # Преобразуем строку в список чисел
        proschet_ids = [int(id_str.strip()) for id_str in proschet_ids_str.split(',') if id_str.strip().isdigit()]
        
        if not proschet_ids:
            return JsonResponse({
                'success': False,
                'message': 'Некорректный список ID просчётов'
            }, status=400)
        
        # Получаем просчёты по списку ID
        proschets = Proschet.objects.filter(id__in=proschet_ids, is_deleted=False)
        
        # Выполняем мягкое удаление для каждого просчёта
        deleted_count = 0
        for proschet in proschets:
            proschet.soft_delete()
            deleted_count += 1
        
        # Возвращаем результат
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
    ОБНОВЛЕНО: Исправлена работа с клиентами
    """
    try:
        proschet = Proschet.objects.get(id=proschet_id, is_deleted=False)
    except Proschet.DoesNotExist:
        return JsonResponse({
            'success': False,
            'message': 'Просчёт не найден или удален'
        }, status=404)
    
    # Получаем ID клиента из POST запроса
    client_id = request.POST.get('client_id', '')
    
    try:
        if client_id:
            # Если указан ID клиента, получаем клиента
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
            # Если client_id пустой, отсоединяем клиента
            proschet.client = None
        
        # Сохраняем изменения
        proschet.save()
        
        # Подготавливаем данные клиента для ответа
        client_data = None
        if proschet.client:
            client_data = {
                'id': proschet.client.id,
                'client_number': proschet.client.client_number,
                'name': proschet.client.name,
                'discount': proschet.client.discount,
                'has_edo': proschet.client.has_edo
            }
        
        # Возвращаем успешный ответ
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
    Получение данных просчёта по ID для AJAX запроса.
    ОБНОВЛЕНО: Возвращает данные клиента если он есть
    """
    try:
        proschet = Proschet.objects.get(id=proschet_id, is_deleted=False)
    except Proschet.DoesNotExist:
        return JsonResponse({
            'success': False,
            'message': 'Просчёт не найден'
        }, status=404)
    
    # Подготавливаем данные клиента, если он есть
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
            'created_at': proschet.formatted_created_at
        }
    })


def get_clients(request):
    """Получить список клиентов для выпадающего списка"""
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
# ИСПРАВЛЕННАЯ ФУНКЦИЯ: get_print_components
# Теперь возвращает количество листов из приложения vichisliniya_listov,
# а не из поля sheet_count модели PrintComponent.
# ============================================================================
def get_print_components(request, proschet_id):
    """
    API для получения компонентов печати для указанного просчёта.
    ВАЖНО: Количество листов (sheet_count) берётся из связанной записи
    VichisliniyaListovModel (если она существует). Если записи нет,
    возвращается 0.00, что сигнализирует о необходимости настройки вычислений.
    """
    try:
        components = PrintComponent.objects.filter(
            proschet_id=proschet_id,
            is_deleted=False
        ).select_related('printer', 'paper')

        # Получаем данные из приложения vichisliniya_listov
        vich_data_qs = VichisliniyaListovModel.objects.filter(
            vichisliniya_listov_print_component__proschet_id=proschet_id
        ).values('vichisliniya_listov_print_component_id', 'vichisliniya_listov_list_count')

        vich_data_dict = {
            item['vichisliniya_listov_print_component_id']: item['vichisliniya_listov_list_count']
            for item in vich_data_qs
        }

        components_data = []
        for component in components:
            sheet_count = vich_data_dict.get(component.id, Decimal('0.00'))

            try:
                sheet_count_float = float(sheet_count)
                formatted_sheet_count = f"{sheet_count_float:,.2f}".replace(',', ' ')
            except:
                formatted_sheet_count = "0.00"

            component_data = {
                'id': component.id,
                'number': component.number,
                'printer_name': component.printer.name if component.printer else None,
                'paper_name': component.paper.name if component.paper else None,
                'sheet_count': float(sheet_count),
                'formatted_sheet_count_display': formatted_sheet_count,
                'price_per_sheet': str(component.price_per_sheet),
                'formatted_price_per_sheet': component.formatted_price_per_sheet,
                # Используем сохранённое поле total_circulation_price
                'total_circulation_price': str(component.total_circulation_price),
                'formatted_total_circulation_price': component.formatted_total_circulation_price,
                'has_vich_data': component.id in vich_data_dict,
                # Добавляем цену бумаги для клиента (понадобится в JS)
                'paper_price': float(component.material_price_per_unit) if component.paper else 0,
            }
            components_data.append(component_data)

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

# ДОБАВЛЯЕМ НОВЫЕ ФУНКЦИИ ДЛЯ РАБОТЫ С КОМПОНЕНТАМИ ПЕЧАТИ

@login_required
def get_printers(request):
    """
    API для получения списка принтеров для выпадающего списка.
    Возвращает JSON с массивом принтеров.
    """
    try:
        # Пытаемся импортировать модель Printer
        try:
            from devices.models import Printer
        except ImportError:
            # Если приложение не установлено, возвращаем пустой список
            return JsonResponse({
                'success': True,
                'printers': [],
                'count': 0,
                'message': 'Приложение devices не установлено'
            })
        
        # Получаем все принтеры (без фильтрации по is_active, так как поле может не существовать)
        printers = Printer.objects.all().order_by('name')
        
        # Формируем данные для ответа
        printers_data = []
        for printer in printers:
            printer_data = {
                'id': printer.id,
                'name': printer.name,
            }
            
            # Добавляем дополнительные поля, если они существуют
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
        # В случае любой ошибки возвращаем пустой список
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
    API для получения списка материалов (бумаги) для выпадающего списка.
    Возвращает JSON с массивом материалов.
    """
    try:
        # Пытаемся импортировать модель Material
        try:
            from sklad.models import Material
        except ImportError:
            # Если приложение не установлено, возвращаем пустой список
            return JsonResponse({
                'success': True,
                'papers': [],
                'count': 0,
                'message': 'Приложение sklad не установлено'
            })
        
        # Получаем все материалы (без фильтрации по is_deleted, так как поле может не существовать)
        papers = Material.objects.all().order_by('name')
        
        # Формируем данные для ответа
        papers_data = []
        for paper in papers:
            paper_data = {
                'id': paper.id,
                'name': paper.name,
            }
            
            # Добавляем дополнительные поля, если они существуют
            if hasattr(paper, 'price'):
                paper_data['price'] = str(paper.price) if paper.price else '0.00'
            if hasattr(paper, 'unit'):
                paper_data['unit'] = paper.unit
            if hasattr(paper, 'stock_quantity'):
                paper_data['stock_quantity'] = paper.stock_quantity
            
            papers_data.append(paper_data)
        
        return JsonResponse({
            'success': True,
            'papers': papers_data,
            'count': len(papers_data)
        })
        
    except Exception as e:
        # В случае любой ошибки возвращаем пустой список
        print(f"❌ Ошибка в get_papers: {str(e)}")
        return JsonResponse({
            'success': True,
            'papers': [],
            'count': 0,
            'message': f'Ошибка: {str(e)}'
        })

@login_required
@require_POST
def add_print_component(request):
    """
    API для добавления нового компонента печати.
    ТЕПЕРЬ:
    - Создаётся запись VichisliniyaListovModel с параметрами по умолчанию.
    - Если выбран принтер, вызывается calculate_fitting() для расчёта размещения.
    - Рассчитывается количество листов на основе тиража просчёта.
    - Пересчитывается цена за лист (интерполяция) и общая стоимость компонента.
    - Возвращаются все данные для отображения в таблице.
    """
    try:
        # Получаем данные из POST-запроса
        proschet_id = request.POST.get('proschet_id')
        printer_id = request.POST.get('printer_id')
        paper_id = request.POST.get('paper_id')

        # Проверка обязательных полей
        if not proschet_id or not paper_id:
            return JsonResponse({
                'success': False,
                'message': 'Не указаны обязательные поля: просчёт и бумага'
            }, status=400)

        # Получаем просчёт
        try:
            proschet = Proschet.objects.get(id=proschet_id, is_deleted=False)
        except Proschet.DoesNotExist:
            return JsonResponse({
                'success': False,
                'message': 'Просчёт не найден'
            }, status=404)

        # Получаем принтер (если указан)
        printer = None
        if printer_id:
            try:
                from devices.models import Printer
                printer = Printer.objects.get(id=printer_id)
            except (ImportError, Printer.DoesNotExist):
                # Если принтер не найден, просто оставляем None
                pass

        # Получаем бумагу
        try:
            from sklad.models import Material
            paper = Material.objects.get(id=paper_id)
        except (ImportError, Material.DoesNotExist):
            return JsonResponse({
                'success': False,
                'message': 'Бумага не найдена'
            }, status=404)

        # ===== 1. СОЗДАЁМ КОМПОНЕНТ ПЕЧАТИ =====
        component = PrintComponent(
            proschet=proschet,
            printer=printer,
            paper=paper,
            price_per_sheet=Decimal('0.00')  # временно, потом пересчитаем
        )
        component.save()

        # ===== 2. СОЗДАЁМ ЗАПИСЬ ВЫЧИСЛЕНИЙ ЛИСТОВ С ПАРАМЕТРАМИ ПО УМОЛЧАНИЮ =====
        from vichisliniya_listov.models import VichisliniyaListovModel
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

        # ===== 3. ЕСЛИ ЕСТЬ ПРИНТЕР, РАССЧИТЫВАЕМ РАЗМЕЩЕНИЕ =====
        if printer and printer.sheet_format and printer.margin_mm is not None:
            sheet_width = printer.sheet_format.width_mm
            sheet_height = printer.sheet_format.height_mm
            margin = printer.margin_mm
            vich_data.calculate_fitting(sheet_width, sheet_height, margin)
        # Если принтера нет, fit_* остаются нулевыми – это корректно

        # Сохраняем vich_data (после возможного вызова calculate_fitting)
        vich_data.save()

        # ===== 4. РАССЧИТЫВАЕМ КОЛИЧЕСТВО ЛИСТОВ НА ОСНОВЕ ТИРАЖА =====
        circulation = proschet.circulation or 1  # если тираж не задан, берём 1 (чтобы избежать деления на ноль)
        new_list_count = vich_data.vichisliniya_listov_calculate_list_count(circulation)
        vich_data.vichisliniya_listov_list_count = new_list_count
        vich_data.save()
        sheet_count = new_list_count

        # ===== 5. ЕСЛИ ЕСТЬ ПРИНТЕР И ЛИСТЫ > 0, РАССЧИТЫВАЕМ ЦЕНУ ЗА ЛИСТ =====
        if component.printer and sheet_count > 0:
            sheet_count_int = int(float(sheet_count))
            new_price = component.calculate_price_for_printer_and_copies(component.printer, sheet_count_int)
            component.price_per_sheet = new_price
        else:
            component.price_per_sheet = Decimal('0.00')

        # ===== 6. ПЕРЕСЧИТЫВАЕМ ОБЩУЮ СТОИМОСТЬ КОМПОНЕНТА =====
        component.refresh_total_price()
        component.save(update_fields=['price_per_sheet', 'total_circulation_price'])

        # ===== 7. ФОРМИРУЕМ ДАННЫЕ ДЛЯ ОТВЕТА =====
        def format_price(p):
            return f"{float(p):.2f} ₽"

        def format_sheet_count(c):
            return f"{float(c):,.2f}".replace(',', ' ')

        component_data = {
            'id': component.id,
            'number': component.number,
            'printer_name': component.printer.name if component.printer else 'Принтер не выбран',
            'paper_name': component.paper.name if component.paper else 'Бумага не выбрана',
            'sheet_count': float(sheet_count),
            'formatted_sheet_count_display': format_sheet_count(sheet_count),
            'price_per_sheet': str(component.price_per_sheet),
            'formatted_price_per_sheet': format_price(component.price_per_sheet),
            'total_circulation_price': str(component.total_circulation_price),
            'formatted_total_circulation_price': format_price(component.total_circulation_price),
            'paper_price': float(component.material_price_per_unit),
            'formatted_paper_price': format_price(component.material_price_per_unit),
        }

        return JsonResponse({
            'success': True,
            'message': 'Компонент печати успешно добавлен',
            'component': component_data
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return JsonResponse({
            'success': False,
            'message': f'Ошибка при добавлении компонента: {str(e)}'
        }, status=500)

@login_required
@require_POST
def update_print_component(request):
    """
    API для обновления компонента печати.
    ОБНОВЛЕНО:
    - При изменении принтера теперь пересчитывается размещение изделий на листе
      (метод calculate_fitting) и обновляется количество листов.
    - После любого изменения пересчитывается общая стоимость компонента.
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

        # Получаем или создаём запись вычислений листов для этого компонента
        from vichisliniya_listov.models import VichisliniyaListovModel
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

        # Обработка изменения полей
        if field_name == 'printer':
            if field_value == '' or field_value == 'null':
                # Принтер снимается – сбрасываем все расчёты размещения
                component.printer = None
                component.price_per_sheet = Decimal('0.00')
                # Обнуляем fit_* поля
                vich_data.vichisliniya_listov_fit_landscape_total = 0
                vich_data.vichisliniya_listov_fit_portrait_total = 0
                vich_data.vichisliniya_listov_fit_horizontal = 0
                vich_data.vichisliniya_listov_fit_vertical = 0
                vich_data.vichisliniya_listov_fit_total = 0
                vich_data.save()
                # Пересчитываем количество листов (станет 0)
                circulation = component.proschet.circulation or 1
                new_list_count = vich_data.vichisliniya_listov_calculate_list_count(circulation)
                vich_data.vichisliniya_listov_list_count = new_list_count
                vich_data.save()
            else:
                try:
                    from devices.models import Printer
                    printer = Printer.objects.get(id=field_value)
                    component.printer = printer

                    # Если есть данные о листе, пересчитываем размещение
                    if printer.sheet_format and printer.margin_mm is not None:
                        sheet_width = printer.sheet_format.width_mm
                        sheet_height = printer.sheet_format.height_mm
                        margin = printer.margin_mm
                        vich_data.calculate_fitting(sheet_width, sheet_height, margin)
                    else:
                        # Нет данных о листе – размещение невозможно, fit_total = 0
                        vich_data.vichisliniya_listov_fit_landscape_total = 0
                        vich_data.vichisliniya_listov_fit_portrait_total = 0
                        vich_data.vichisliniya_listov_fit_horizontal = 0
                        vich_data.vichisliniya_listov_fit_vertical = 0
                        vich_data.vichisliniya_listov_fit_total = 0
                    vich_data.save()

                    # Пересчитываем количество листов
                    circulation = component.proschet.circulation or 1
                    new_list_count = vich_data.vichisliniya_listov_calculate_list_count(circulation)
                    vich_data.vichisliniya_listov_list_count = new_list_count
                    vich_data.save()
                    sheet_count = new_list_count

                    # Пересчитываем цену за лист
                    if sheet_count > 0:
                        sheet_count_int = int(float(sheet_count))
                        new_price = component.calculate_price_for_printer_and_copies(printer, sheet_count_int)
                        component.price_per_sheet = new_price
                    else:
                        component.price_per_sheet = Decimal('0.00')

                except Exception as e:
                    print(f"❌ Ошибка при поиске принтера: {e}")
                    return JsonResponse({'success': False, 'message': f'Принтер не найден: {str(e)}'}, status=404)

        elif field_name == 'paper':
            if not field_value:
                return JsonResponse({'success': False, 'message': 'Бумага обязательна'}, status=400)
            try:
                from sklad.models import Material
                paper = Material.objects.get(id=field_value)
                component.paper = paper
            except Exception as e:
                return JsonResponse({'success': False, 'message': f'Бумага не найдена: {str(e)}'}, status=404)

        elif field_name == 'sheet_count':
            try:
                sheet_count = int(field_value)
                if sheet_count < 1:
                    return JsonResponse({'success': False, 'message': 'Количество листов должно быть положительным'}, status=400)
                component.sheet_count = sheet_count
            except ValueError:
                return JsonResponse({'success': False, 'message': 'Количество листов должно быть целым числом'}, status=400)

        elif field_name == 'price_per_sheet':
            try:
                price = Decimal(field_value)
                if price < 0:
                    return JsonResponse({'success': False, 'message': 'Цена не может быть отрицательной'}, status=400)
                component.price_per_sheet = price
            except (ValueError, InvalidOperation):
                return JsonResponse({'success': False, 'message': 'Некорректный формат цены'}, status=400)

        else:
            return JsonResponse({'success': False, 'message': f'Поле "{field_name}" не поддерживается'}, status=400)

        # ===== ВАЖНО: после изменения полей пересчитываем общую стоимость =====
        component.refresh_total_price()  # обновляет поле total_circulation_price
        component.save()  # сохраняем все изменения, включая total

        print(f"✅ Компонент обновлён: ID={component.id}, номер={component.number}")

        updated_data = {
            'id': component.id,
            'number': component.number,
            'printer_name': component.printer.name if component.printer else 'Принтер не выбран',
            'paper_name': component.paper.name if component.paper else 'Бумага не выбрана',
            'sheet_count': float(vich_data.vichisliniya_listov_list_count) if vich_data else component.sheet_count,
            'formatted_sheet_count_display': f"{float(vich_data.vichisliniya_listov_list_count):,.2f}".replace(',', ' ') if vich_data else "0.00",
            'price_per_sheet': str(component.price_per_sheet),
            'formatted_price_per_sheet': component.formatted_price_per_sheet,
            'total_circulation_price': str(component.total_circulation_price),
            'formatted_total_circulation_price': component.formatted_total_circulation_price,
            'paper_price': float(component.material_price_per_unit),
        }

        return JsonResponse({
            'success': True,
            'message': 'Компонент успешно обновлён',
            'updated_data': updated_data
        })

    except Exception as e:
        print(f"🔥 Критическая ошибка в update_print_component: {str(e)}")
        import traceback
        traceback.print_exc()
        return JsonResponse({'success': False, 'message': f'Внутренняя ошибка: {str(e)}'}, status=500)
    
@login_required
@require_POST
def delete_print_component(request):
    """
    API для удаления компонента печати (мягкое удаление).
    Принимает POST запрос с ID компонента.
    """
    try:
        # Получаем ID компонента из запроса
        component_id = request.POST.get('component_id')
        
        if not component_id:
            return JsonResponse({
                'success': False,
                'message': 'Не указан ID компонента'
            }, status=400)
        
        # Получаем компонент
        try:
            component = PrintComponent.objects.get(id=component_id, is_deleted=False)
        except PrintComponent.DoesNotExist:
            return JsonResponse({
                'success': False,
                'message': 'Компонент печати не найден или уже удален'
            }, status=404)
        
        # Выполняем мягкое удаление
        component.is_deleted = True
        component.save()
        
        return JsonResponse({
            'success': True,
            'message': 'Компонент печати успешно удален',
            'component_id': component_id
        })
        
    except Exception as e:
        return JsonResponse({
            'success': False,
            'message': f'Ошибка при удалении компонента: {str(e)}'
        }, status=500)
    

@login_required
@require_GET
def get_proschet(request, proschet_id):
    """
    Возвращает данные просчёта в формате JSON.
    Используется для обновления секций "Клиент" и "Изделие".
    """
    try:
        proschet = Proschet.objects.get(id=proschet_id, is_deleted=False)
        
        # Подготавливаем данные для JSON
        proschet_data = {
            'id': proschet.id,
            'number': proschet.number,
            'title': proschet.title,
            'circulation': proschet.circulation,
            'formatted_circulation': proschet.formatted_circulation,
            'created_at': proschet.formatted_created_at,
            'client': None
        }
        
        # Если есть клиент, добавляем его данные
        if proschet.client:
            proschet_data['client'] = {
                'id': proschet.client.id,
                'name': proschet.client.name,
                'client_number': proschet.client.client_number,
                'discount': proschet.client.discount,
                'has_edo': proschet.client.has_edo
            }
        
        return JsonResponse({
            'success': True,
            'proschet': proschet_data
        })
        
    except Proschet.DoesNotExist:
        return JsonResponse({
            'success': False,
            'message': 'Просчёт не найден'
        })
    except Exception as e:
        return JsonResponse({
            'success': False,
            'message': f'Ошибка сервера: {str(e)}'
        })

@login_required
@require_POST
@csrf_exempt  # ДОБАВЛЕНО: декоратор csrf_exempt
def update_proschet_circulation(request, proschet_id):
    """
    Обновляет тираж просчёта через AJAX запрос.
    """
    try:
        # Получаем просчёт
        proschet = Proschet.objects.get(id=proschet_id, is_deleted=False)
        
        # Получаем новое значение тиража из POST данных
        circulation = request.POST.get('circulation')
        
        if not circulation:
            return JsonResponse({
                'success': False,
                'message': 'Тираж не указан'
            })
        
        # Обновляем тираж
        try:
            # Преобразуем в целое число
            circulation_int = int(circulation)
            
            # Проверяем, что тираж положительный
            if circulation_int <= 0:
                return JsonResponse({
                    'success': False,
                    'message': 'Тираж должен быть положительным числом'
                })
            
            # Обновляем значение
            proschet.circulation = circulation_int
            proschet.save()
            
            return JsonResponse({
                'success': True,
                'message': 'Тираж успешно обновлен',
                'circulation': proschet.circulation,
                'formatted_circulation': proschet.formatted_circulation
            })
            
        except ValueError:
            return JsonResponse({
                'success': False,
                'message': 'Тираж должен быть целым числом'
            })
            
    except Proschet.DoesNotExist:
        return JsonResponse({
            'success': False,
            'message': 'Просчёт не найден'
        })
    except Exception as e:
        return JsonResponse({
            'success': False,
            'message': f'Ошибка сервера: {str(e)}'
        })
    


@login_required
@require_http_methods(["POST"])
@csrf_exempt
def recalculate_components_for_circulation(request, proschet_id):
    """
    Пересчитывает цены для всех компонентов печати при изменении тиража просчёта.
    ВАЖНО: теперь также пересчитывается количество листов в модели VichisliniyaListovModel
    для каждого компонента, используя сохранённые параметры (вылеты, полосы, цветность).
    Возвращает обновлённые данные компонентов.
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

    # Обновляем тираж в просчёте
    proschet.circulation = new_circulation
    proschet.save()
    print(f"✅ Тираж просчёта обновлён: {new_circulation} шт.")

    # Получаем все компоненты печати для этого просчёта
    components = PrintComponent.objects.filter(proschet=proschet, is_deleted=False)

    updated_components = []
    total_price_sum = Decimal('0.00')

    for component in components:
        # ===== 1. ПОЛУЧАЕМ ИЛИ СОЗДАЁМ ЗАПИСЬ ВЫЧИСЛЕНИЙ ЛИСТОВ =====
        vich_data, created = VichisliniyaListovModel.objects.get_or_create(
            vichisliniya_listov_print_component=component,
            defaults={
                'vichisliniya_listov_vyleta': 1,
                'vichisliniya_listov_polosa_count': 1,
                'vichisliniya_listov_color': '4+0',
                'vichisliniya_listov_list_count': 0.00,
            }
        )

        # ===== 2. ПЕРЕСЧИТЫВАЕМ КОЛИЧЕСТВО ЛИСТОВ С НОВЫМ ТИРАЖОМ =====
        # Метод модели возвращает вычисленное значение, но не сохраняет его автоматически
        new_list_count = vich_data.vichisliniya_listov_calculate_list_count(new_circulation)
        vich_data.vichisliniya_listov_list_count = new_list_count
        vich_data.save()  # сохраняем новое значение в БД
        sheet_count = new_list_count

        # ===== 3. ПЕРЕСЧИТЫВАЕМ ЦЕНУ ЗА ЛИСТ, ЕСЛИ ЕСТЬ ПРИНТЕР =====
        if component.printer and sheet_count > 0:
            try:
                from print_price.models import PrintPrice
                # Используем метод модели для расчёта цены (интерполяция)
                component.price_per_sheet = component.calculate_price_for_printer_and_copies(
                    component.printer, int(float(sheet_count))
                )
            except Exception as e:
                print(f"⚠️ Ошибка при пересчёте цены для компонента {component.id}: {e}")
                # оставляем старую цену

        # ===== 4. ПЕРЕСЧИТЫВАЕМ ОБЩУЮ СТОИМОСТЬ КОМПОНЕНТА =====
        # Метод refresh_total_price() использует актуальное количество листов из vich_data
        component.refresh_total_price()
        component.save(update_fields=['price_per_sheet', 'total_circulation_price'])

        # ===== 5. НАКАПЛИВАЕМ ОБЩУЮ СТОИМОСТЬ =====
        total_price_sum += component.total_circulation_price

        # ===== 6. ФОРМИРУЕМ ДАННЫЕ ДЛЯ ОТВЕТА =====
        component_data = {
            'id': component.id,
            'number': component.number,
            'printer_name': component.printer.name if component.printer else 'Принтер не выбран',
            'paper_name': component.paper.name if component.paper else 'Бумага не выбрана',
            'sheet_count': float(sheet_count),
            'formatted_sheet_count_display': f"{float(sheet_count):,.2f}".replace(',', ' '),
            'price_per_sheet': str(component.price_per_sheet),
            'formatted_price_per_sheet': component.formatted_price_per_sheet,
            'total_circulation_price': str(component.total_circulation_price),
            'formatted_total_circulation_price': component.formatted_total_circulation_price,
            'paper_price': float(component.material_price_per_unit),
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


@login_required
@require_GET
def get_additional_works(request, proschet_id):
    """
    API для получения дополнительных работ для указанного просчёта.
    Возвращает JSON с массивом работ.
    """
    try:
        # Проверяем существование просчёта
        proschet = Proschet.objects.get(id=proschet_id, is_deleted=False)
        
        # Получаем все дополнительные работы для указанного просчёта
        works = AdditionalWork.objects.filter(
            proschet_id=proschet_id,
            is_deleted=False
        ).order_by('created_at')
        
        # Формируем данные для ответа
        works_data = []
        for work in works:
            work_data = {
                'id': work.id,
                'number': work.number,
                'title': work.title,
                'price': str(work.price),
                'formatted_price': f"{work.price:.2f} ₽",
                'created_at': work.created_at.strftime("%d.%m.%Y %H:%M") if work.created_at else "",
            }
            works_data.append(work_data)
        
        return JsonResponse({
            'success': True,
            'works': works_data,
            'count': len(works_data)
        })
        
    except Proschet.DoesNotExist:
        return JsonResponse({
            'success': False,
            'message': 'Просчёт не найден или удален'
        }, status=404)
    except Exception as e:
        return JsonResponse({
            'success': False,
            'message': f'Ошибка при получении работ: {str(e)}'
        }, status=500)

@login_required
@require_POST
def add_additional_work(request):
    """
    API для добавления новой дополнительной работы.
    Принимает POST запрос с данными новой работы.
    """
    try:
        # Получаем данные из запроса
        proschet_id = request.POST.get('proschet_id')
        title = request.POST.get('title')
        price = request.POST.get('price')
        
        # Проверяем обязательные поля
        if not all([proschet_id, title, price]):
            return JsonResponse({
                'success': False,
                'message': 'Не все обязательные поля заполнены'
            }, status=400)
        
        # Проверяем существование просчёта
        try:
            proschet = Proschet.objects.get(id=proschet_id, is_deleted=False)
        except Proschet.DoesNotExist:
            return JsonResponse({
                'success': False,
                'message': 'Просчёт не найден или удален'
            }, status=404)
        
        # Проверяем валидность цены
        try:
            price_decimal = Decimal(price)
            if price_decimal < 0:
                return JsonResponse({
                    'success': False,
                    'message': 'Цена не может быть отрицательной'
                }, status=400)
        except (ValueError, InvalidOperation):
            return JsonResponse({
                'success': False,
                'message': 'Некорректный формат цены'
            }, status=400)
        
        # Проверяем длину названия
        if len(title) > 200:
            return JsonResponse({
                'success': False,
                'message': 'Название не должно превышать 200 символов'
            }, status=400)
        
        # Создаем новую дополнительную работу
        work = AdditionalWork(
            proschet=proschet,
            title=title,
            price=price_decimal
        )
        
        # Сохраняем работу (номер сгенерируется автоматически в методе save())
        work.save()
        
        # Формируем данные для ответа
        work_data = {
            'id': work.id,
            'number': work.number,
            'title': work.title,
            'price': str(work.price),
            'formatted_price': f"{work.price:.2f} ₽",
            'created_at': work.created_at.strftime("%d.%m.%Y %H:%M") if work.created_at else "",
        }
        
        return JsonResponse({
            'success': True,
            'message': 'Дополнительная работа успешно добавлена',
            'work': work_data
        })
        
    except Exception as e:
        return JsonResponse({
            'success': False,
            'message': f'Ошибка при добавлении работы: {str(e)}'
        }, status=500)

@login_required
@require_POST
def update_additional_work(request):
    """
    API для обновления дополнительной работы.
    Поддерживает редактирование названия (title) и цены (price).
    """
    try:
        # Получаем данные из запроса
        work_id = request.POST.get('work_id')
        field_name = request.POST.get('field_name')
        field_value = request.POST.get('field_value')
        
        # Проверяем обязательные поля
        if not work_id or not field_name:
            return JsonResponse({
                'success': False,
                'message': 'Не указаны обязательные поля'
            }, status=400)
        
        # Получаем работу
        try:
            work = AdditionalWork.objects.get(id=work_id, is_deleted=False)
        except AdditionalWork.DoesNotExist:
            return JsonResponse({
                'success': False,
                'message': 'Дополнительная работа не найдена'
            }, status=404)
        
        # Обновляем поле в зависимости от field_name
        if field_name == 'title':
            # Валидация названия
            title = field_value.strip()
            if not title:
                return JsonResponse({
                    'success': False,
                    'message': 'Название не может быть пустым'
                }, status=400)
            
            if len(title) > 200:
                return JsonResponse({
                    'success': False,
                    'message': 'Название не должно превышать 200 символов'
                }, status=400)
            
            work.title = title
            
        elif field_name == 'price':
            # Валидация цены
            try:
                price = Decimal(field_value)
                if price < 0:
                    return JsonResponse({
                        'success': False,
                        'message': 'Цена не может быть отрицательной'
                    }, status=400)
                
                if price > Decimal('9999999.99'):
                    return JsonResponse({
                        'success': False,
                        'message': 'Цена слишком большая'
                    }, status=400)
                
                work.price = price
                
            except (ValueError, InvalidOperation):
                return JsonResponse({
                    'success': False,
                    'message': 'Некорректный формат цены'
                }, status=400)
                
        else:
            return JsonResponse({
                'success': False,
                'message': f'Поле "{field_name}" не поддерживается для редактирования'
            }, status=400)
        
        # Сохраняем изменения
        work.save()
        
        # Формируем обновленные данные для ответа
        updated_data = {
            'id': work.id,
            'number': work.number,
            'title': work.title,
            'price': str(work.price),
            'formatted_price': f"{work.price:.2f} ₽",
        }
        
        return JsonResponse({
            'success': True,
            'message': 'Дополнительная работа успешно обновлена',
            'updated_data': updated_data
        })
        
    except Exception as e:
        return JsonResponse({
            'success': False,
            'message': f'Внутренняя ошибка сервера: {str(e)}'
        }, status=500)

@login_required
@require_POST
def delete_additional_work(request):
    """
    API для удаления дополнительной работы (мягкое удаление).
    Принимает POST запрос с ID работы.
    """
    try:
        # Получаем ID работы из запроса
        work_id = request.POST.get('work_id')
        
        if not work_id:
            return JsonResponse({
                'success': False,
                'message': 'Не указан ID работы'
            }, status=400)
        
        # Получаем работу
        try:
            work = AdditionalWork.objects.get(id=work_id, is_deleted=False)
        except AdditionalWork.DoesNotExist:
            return JsonResponse({
                'success': False,
                'message': 'Дополнительная работа не найдена или уже удалена'
            }, status=404)
        
        # Выполняем мягкое удаление
        work.is_deleted = True
        work.save()
        
        return JsonResponse({
            'success': True,
            'message': 'Дополнительная работа успешно удалена',
            'work_id': work_id
        })
        
    except Exception as e:
        return JsonResponse({
            'success': False,
            'message': f'Ошибка при удалении работы: {str(e)}'
        }, status=500)
    
@require_GET
def get_proschet_price_data(request, proschet_id):
    """
    Получение данных о просчёте для расчета цены.
    """
    try:
        proschet = Proschet.objects.get(id=proschet_id, is_deleted=False)

        print_components = PrintComponent.objects.filter(
            proschet=proschet, is_deleted=False
        ).select_related('printer', 'paper')

        additional_works = AdditionalWork.objects.filter(
            proschet=proschet, is_deleted=False
        )

        data = {
            'success': True,
            'proschet': {
                'id': proschet.id,
                'number': proschet.number,
                'title': proschet.title,
                'circulation': proschet.circulation,
            },
            'print_components': [
                {
                    'id': component.id,
                    'number': component.number,
                    'printer': {
                        'id': component.printer.id if component.printer else None,
                        'name': component.printer.name if component.printer else None,
                    } if component.printer else None,
                    'paper': {
                        'id': component.paper.id if component.paper else None,
                        'name': component.paper.name if component.paper else None,
                    } if component.paper else None,
                    'price_per_sheet': str(component.price_per_sheet) if component.price_per_sheet else '0.00',
                    'total_circulation_price': str(component.total_circulation_price),  # используем поле
                    'formatted_total_circulation_price': component.formatted_total_circulation_price,
                }
                for component in print_components
            ],
            'additional_works': [
                {
                    'id': work.id,
                    'number': work.number,
                    'title': work.title,
                    'price': str(work.price),
                    'formatted_price': f"{work.price:.2f} ₽",
                }
                for work in additional_works
            ],
            'summary': {
                'print_components_total': str(sum(component.total_circulation_price for component in print_components)),
                'additional_works_total': str(sum(work.price for work in additional_works)),
                'total_price': str(proschet.total_price),
            }
        }
        return JsonResponse(data)

    except Proschet.DoesNotExist:
        return JsonResponse({'success': False, 'message': 'Просчёт не найден'}, status=404)
    except Exception as e:
        return JsonResponse({'success': False, 'message': f'Ошибка сервера: {str(e)}'}, status=500)

# ============================================================================
# ИСПРАВЛЕННАЯ ФУНКЦИЯ: update_component_price
# Теперь использует количество листов из vichisliniya_listov для расчёта стоимости,
# а не полагается на переданное клиентом значение.
# ============================================================================
@require_POST
@csrf_exempt
def update_component_price(request):
    """
    API для обновления стоимости печатного компонента на основе нового количества листов.
    ВОЗВРАЩАЕТ:
        - success: bool
        - component: объект компонента с полями:
            * id
            * number
            * printer_name
            * paper_name
            * paper_price
            * formatted_paper_price
            * sheet_count
            * sheet_count_display
            * price_per_sheet
            * formatted_price_per_sheet
            * total_circulation_price   # ← ИСПРАВЛЕНО: раньше было total_price
            * formatted_total_circulation_price
        - total_price: общая стоимость всех компонентов просчёта
        - calculation_details: детали расчёта
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

        # Пересчёт цены за лист, если есть принтер
        if component.printer and sheet_count_decimal > 0:
            try:
                from print_price.models import PrintPrice
                print_prices = PrintPrice.objects.filter(printer=component.printer).order_by('copies')
                if print_prices.exists():
                    sheet_count_int = int(float(sheet_count_decimal))
                    new_price = component.calculate_price_for_printer_and_copies(
                        component.printer, sheet_count_int
                    )
                    component.price_per_sheet = new_price
            except Exception as e:
                print(f"⚠️ Ошибка при пересчёте цены: {e}")
                # оставляем старую цену

        # Сохраняем цену (обновляем поле price_per_sheet)
        component.save(update_fields=['price_per_sheet'])

        # ===== ВАЖНО: пересчитываем общую стоимость компонента и сохраняем её =====
        component.refresh_total_price()  # использует sheet_count_decimal и обновлённую цену
        component.save(update_fields=['total_circulation_price'])

        # Общая стоимость всех компонентов просчёта (для информации)
        total_price = Decimal('0.00')
        try:
            proschet_components = PrintComponent.objects.filter(
                proschet_id=proschet_id, is_deleted=False
            )
            for comp in proschet_components:
                # Используем сохранённое поле
                total_price += comp.total_circulation_price
        except Exception as e:
            print(f"⚠️ Ошибка при расчёте общей стоимости: {e}")
            total_price = component.total_circulation_price  # fallback

        def format_price(p): return f"{float(p):.2f} ₽"
        def format_sheet_count(c): return f"{float(c):,.2f}".replace(',', ' ')

        # Возвращаем данные компонента. ВАЖНО: используем единое имя total_circulation_price
        return JsonResponse({
            'success': True,
            'message': f'Стоимость пересчитана',
            'component': {
                'id': component.id,
                'number': component.number,
                'printer_name': component.printer.name if component.printer else 'Принтер не выбран',
                'paper_name': component.paper.name if component.paper else 'Бумага не выбрана',
                'paper_price': float(component.material_price_per_unit),
                'formatted_paper_price': format_price(component.material_price_per_unit),
                'sheet_count': float(sheet_count_decimal),
                'sheet_count_display': format_sheet_count(sheet_count_decimal),
                'price_per_sheet': float(component.price_per_sheet),
                'formatted_price_per_sheet': format_price(component.price_per_sheet),
                # ИСПРАВЛЕНО: теперь total_circulation_price, а не total_price
                'total_circulation_price': float(component.total_circulation_price),
                'formatted_total_circulation_price': format_price(component.total_circulation_price),
            },
            'total_price': float(total_price),
            'calculation_details': {
                'based_on': 'client_provided_sheet_count',
                'sheet_count_used': float(sheet_count_decimal),
                'price_recalculated': True,
                'paper_included': bool(component.paper)
            }
        })

    except json.JSONDecodeError:
        return JsonResponse({'success': False, 'message': 'Ошибка разбора JSON'}, status=400)
    except Exception as e:
        import traceback
        print(traceback.format_exc())
        return JsonResponse({'success': False, 'message': f'Внутренняя ошибка: {str(e)}'}, status=500)