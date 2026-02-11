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
    

def get_print_components(request, proschet_id):
    """API для получения компонентов печати для указанного просчёта"""
    try:
        # Получаем все компоненты печати для указанного просчёта
        components = PrintComponent.objects.filter(
            proschet_id=proschet_id,
            is_deleted=False
        ).select_related('printer', 'paper')
        
        # Формируем данные для ответа
        components_data = []
        for component in components:
            component_data = {
                'id': component.id,
                'number': component.number,
                'printer_name': component.printer.name if component.printer else None,
                'paper_name': component.paper.name if component.paper else None,
                'sheet_count': component.sheet_count,
                'price_per_sheet': str(component.price_per_sheet),
                'formatted_price_per_sheet': component.formatted_price_per_sheet,
                'total_circulation_price': str(component.total_circulation_price),
                'formatted_total_circulation_price': component.formatted_total_circulation_price,
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
    Принимает POST запрос с данными нового компонента.
    """
    try:
        # Получаем данные из запроса
        proschet_id = request.POST.get('proschet_id')
        printer_id = request.POST.get('printer_id')
        paper_id = request.POST.get('paper_id')
        sheet_count = request.POST.get('sheet_count')
        price_per_sheet = request.POST.get('price_per_sheet')
        
        # Проверяем обязательные поля
        if not all([proschet_id, paper_id, sheet_count, price_per_sheet]):
            return JsonResponse({
                'success': False,
                'message': 'Не все обязательные поля заполнены'
            }, status=400)
        
        # Получаем связанные объекты
        try:
            proschet = Proschet.objects.get(id=proschet_id, is_deleted=False)
        except Proschet.DoesNotExist:
            return JsonResponse({
                'success': False,
                'message': 'Просчёт не найден или удален'
            }, status=404)
        
        # Получаем принтер (если указан)
        printer = None
        if printer_id:
            try:
                from devices.models import Printer
                printer = Printer.objects.get(id=printer_id)
            except (ImportError, Printer.DoesNotExist):
                # Если принтер не найден, оставляем пустым
                printer = None
        
        # Получаем бумагу
        try:
            from sklad.models import Material
            paper = Material.objects.get(id=paper_id)
        except (ImportError, Material.DoesNotExist):
            return JsonResponse({
                'success': False,
                'message': 'Материал (бумага) не найден'
            }, status=404)
        
        # Создаем новый компонент печати
        component = PrintComponent(
            proschet=proschet,
            printer=printer,
            paper=paper,
            sheet_count=int(sheet_count),
            price_per_sheet=Decimal(price_per_sheet)  # ИСПРАВЛЕНО: Используем Decimal
        )
        
        # Сохраняем компонент (номер сгенерируется автоматически)
        component.save()
        
        # Формируем данные для ответа
        component_data = {
            'id': component.id,
            'number': component.number,
            'printer_name': component.printer.name if component.printer else 'Принтер не выбран',
            'paper_name': component.paper.name if component.paper else 'Бумага не выбрана',
            'sheet_count': component.sheet_count,
            'price_per_sheet': str(component.price_per_sheet),
            'formatted_price_per_sheet': component.formatted_price_per_sheet,
            'total_circulation_price': str(component.total_circulation_price),
            'formatted_total_circulation_price': component.formatted_total_circulation_price,
        }
        
        return JsonResponse({
            'success': True,
            'message': 'Компонент печати успешно добавлен',
            'component': component_data
        })
        
    except ValueError as e:
        # Ошибка преобразования типов (например, неверный формат числа)
        return JsonResponse({
            'success': False,
            'message': f'Ошибка в формате данных: {str(e)}'
        }, status=400)
        
    except Exception as e:
        return JsonResponse({
            'success': False,
            'message': f'Ошибка при добавлении компонента: {str(e)}'
        }, status=500)

@login_required
@require_POST
def update_print_component(request):
    """
    API для обновления компонента печати.
    Упрощенная версия для отладки.
    """
    try:
        # Получаем данные из запроса
        component_id = request.POST.get('component_id')
        field_name = request.POST.get('field_name')
        field_value = request.POST.get('field_value')
        
        print(f"🔄 Обновление компонента: ID={component_id}, поле={field_name}, значение={field_value}")
        
        # Проверяем обязательные поля
        if not component_id or not field_name:
            return JsonResponse({
                'success': False,
                'message': 'Не указаны обязательные поля'
            }, status=400)
        
        # Получаем компонент
        try:
            component = PrintComponent.objects.get(id=component_id, is_deleted=False)
        except PrintComponent.DoesNotExist:
            return JsonResponse({
                'success': False,
                'message': 'Компонент печати не найден'
            }, status=404)
        
        # Обновляем поле в зависимости от field_name
        if field_name == 'printer':
            # Если значение пустое, отсоединяем принтер
            if field_value == '' or field_value == 'null':
                component.printer = None
            else:
                try:
                    # Импортируем здесь, чтобы избежать ошибок импорта
                    from devices.models import Printer
                    printer = Printer.objects.get(id=field_value)
                    component.printer = printer
                except Exception as e:
                    print(f"❌ Ошибка при поиске принтера: {e}")
                    return JsonResponse({
                        'success': False,
                        'message': f'Принтер не найден: {str(e)}'
                    }, status=404)
                    
        elif field_name == 'paper':
            # Бумага обязательна
            if not field_value:
                return JsonResponse({
                    'success': False,
                    'message': 'Бумага обязательна для компонента печати'
                }, status=400)
            
            try:
                # Импортируем здесь, чтобы избежать ошибок импорта
                from sklad.models import Material
                paper = Material.objects.get(id=field_value)
                component.paper = paper
            except Exception as e:
                print(f"❌ Ошибка при поиске бумаги: {e}")
                return JsonResponse({
                    'success': False,
                    'message': f'Бумага не найдена: {str(e)}'
                }, status=404)
                
        elif field_name == 'sheet_count':
            try:
                sheet_count = int(field_value)
                if sheet_count < 1:
                    return JsonResponse({
                        'success': False,
                        'message': 'Количество листов должно быть положительным числом'
                    }, status=400)
                component.sheet_count = sheet_count
            except ValueError as e:
                return JsonResponse({
                    'success': False,
                    'message': f'Количество листов должно быть целым числом: {str(e)}'
                }, status=400)
                
        elif field_name == 'price_per_sheet':
            try:
                price = Decimal(field_value)
                if price < 0:
                    return JsonResponse({
                        'success': False,
                        'message': 'Цена за лист не может быть отрицательной'
                    }, status=400)
                component.price_per_sheet = price
            except (ValueError, InvalidOperation) as e:
                return JsonResponse({
                    'success': False,
                    'message': f'Некорректный формат цены: {str(e)}'
                }, status=400)
                
        else:
            return JsonResponse({
                'success': False,
                'message': f'Поле "{field_name}" не поддерживается для редактирования'
            }, status=400)
        
        # Сохраняем изменения
        component.save()
        
        print(f"✅ Компонент обновлен: ID={component.id}, номер={component.number}")
        
        # Формируем обновленные данные для ответа
        updated_data = {
            'id': component.id,
            'number': component.number,
            'printer_name': component.printer.name if component.printer else 'Принтер не выбран',
            'paper_name': component.paper.name if component.paper else 'Бумага не выбрана',
            'sheet_count': component.sheet_count,
            'price_per_sheet': str(component.price_per_sheet),
            'formatted_price_per_sheet': component.formatted_price_per_sheet,
            'total_circulation_price': str(component.total_circulation_price),
            'formatted_total_circulation_price': component.formatted_total_circulation_price,
        }
        
        return JsonResponse({
            'success': True,
            'message': 'Компонент печати успешно обновлен',
            'updated_data': updated_data
        })
        
    except Exception as e:
        print(f"🔥 Критическая ошибка в update_print_component: {str(e)}")
        import traceback
        traceback.print_exc()
        
        return JsonResponse({
            'success': False,
            'message': f'Внутренняя ошибка сервера: {str(e)}'
        }, status=500)

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
    Возвращает обновлённые данные компонентов.
    
    Args:
        request: HTTP запрос с новым тиражом
        proschet_id: ID просчёта, для которого нужно пересчитать компоненты
        
    Returns:
        JsonResponse: Обновлённые данные компонентов или сообщение об ошибке
    """
    print(f"🔄 Запрос на пересчёт компонентов для просчёта ID={proschet_id}")
    
    try:
        # 1. Получаем просчёт из базы данных
        proschet = Proschet.objects.get(id=proschet_id, is_deleted=False)
    except Proschet.DoesNotExist:
        print(f"❌ Просчёт с ID={proschet_id} не найден или удален")
        return JsonResponse({
            'success': False,
            'message': 'Просчёт не найден или удален'
        }, status=404)
    
    # 2. Получаем новый тираж из POST запроса
    new_circulation_str = request.POST.get('circulation', '').strip()
    
    if not new_circulation_str:
        print("❌ Не указан новый тираж для пересчёта")
        return JsonResponse({
            'success': False,
            'message': 'Не указан новый тираж'
        }, status=400)
    
    try:
        # Преобразуем строку в целое число
        new_circulation = int(new_circulation_str)
        
        # Проверяем, что тираж положительный
        if new_circulation <= 0:
            print(f"❌ Некорректный тираж: {new_circulation}")
            return JsonResponse({
                'success': False,
                'message': 'Тираж должен быть положительным числом'
            }, status=400)
            
    except ValueError:
        print(f"❌ Некорректный формат тиража: {new_circulation_str}")
        return JsonResponse({
            'success': False,
            'message': 'Тираж должен быть целым числом'
        }, status=400)
    
    # 3. Обновляем тираж в просчёте
    proschet.circulation = new_circulation
    proschet.save()
    
    print(f"✅ Тираж просчёта обновлён: {new_circulation} шт.")
    
    # 4. Получаем все компоненты печати для этого просчёта
    try:
        components = PrintComponent.objects.filter(
            proschet=proschet,
            is_deleted=False
        )
    except Exception as e:
        print(f"❌ Ошибка при получении компонентов: {str(e)}")
        return JsonResponse({
            'success': False,
            'message': f'Ошибка при получении компонентов: {str(e)}'
        }, status=500)
    
    # 5. Пересчитываем цены для каждого компонента, у которого есть принтер
    updated_components = []
    
    for component in components:
        # Проверяем, есть ли у компонента принтер
        if component.printer:
            print(f"📊 Пересчёт цены для компонента ID={component.id}, принтер ID={component.printer.id}")
            
            try:
                # 6. Используем существующую логику расчёта цены из print_price
                # Импортируем здесь, чтобы избежать циклических импортов
                from print_price.models import PrintPrice
                
                # Получаем цены для этого принтера
                print_prices = PrintPrice.objects.filter(printer=component.printer).order_by('copies')
                
                if not print_prices.exists():
                    print(f"⚠️ Для принтера {component.printer.name} нет цен, пропускаем компонент")
                    # Если нет цен, оставляем текущую цену
                    component_price = component.price_per_sheet
                else:
                    # Логика расчёта цены (та же, что в calculate_price_for_printer)
                    # 1. Если тираж точно соответствует одной из записей
                    exact_price = print_prices.filter(copies=new_circulation).first()
                    if exact_price:
                        component_price = exact_price.price_per_sheet
                        print(f"✅ Найдена точная цена: {component_price} руб./лист")
                    
                    # 2. Если тираж меньше минимального
                    elif new_circulation < print_prices.first().copies:
                        min_price = print_prices.order_by('copies').first()
                        component_price = min_price.price_per_sheet
                        print(f"⚠️ Использована минимальная цена: {component_price} руб./лист")
                    
                    # 3. Если тираж больше максимального
                    elif new_circulation > print_prices.order_by('-copies').first().copies:
                        max_price = print_prices.order_by('-copies').first()
                        component_price = max_price.price_per_sheet
                        print(f"⚠️ Использована максимальная цена: {component_price} руб./лист")
                    
                    # 4. Интерполяция между двумя ближайшими значениями
                    else:
                        lower_price = print_prices.filter(copies__lte=new_circulation).order_by('-copies').first()
                        upper_price = print_prices.filter(copies__gte=new_circulation).order_by('copies').first()
                        
                        if lower_price and upper_price and lower_price.copies != upper_price.copies:
                            # Линейная интерполяция
                            x1 = lower_price.copies
                            y1 = lower_price.price_per_sheet
                            x2 = upper_price.copies
                            y2 = upper_price.price_per_sheet
                            
                            # Формула линейной интерполяции
                            component_price = y1 + (y2 - y1) * (new_circulation - x1) / (x2 - x1)
                            print(f"📈 Рассчитана интерполированная цена: {component_price:.2f} руб./лист")
                        else:
                            # Если что-то пошло не так, оставляем текущую цену
                            component_price = component.price_per_sheet
                            print(f"⚠️ Не удалось рассчитать цену, оставляем текущую: {component_price} руб./лист")
                
                # 7. Обновляем цену в компоненте
                component.price_per_sheet = component_price
                component.save()
                
                print(f"✅ Компонент ID={component.id} обновлён, новая цена: {component_price:.2f} руб./лист")
                
            except Exception as e:
                print(f"❌ Ошибка при пересчёте цены для компонента ID={component.id}: {str(e)}")
                # В случае ошибки продолжаем с текущей ценой
        
        else:
            # Если у компонента нет принтера, оставляем текущую цену
            print(f"⚠️ У компонента ID={component.id} нет принтера, цена не пересчитывается")
            component_price = component.price_per_sheet
        
        # 8. Формируем данные компонента для ответа
        component_data = {
            'id': component.id,
            'number': component.number,
            'printer_name': component.printer.name if component.printer else 'Принтер не выбран',
            'paper_name': component.paper.name if component.paper else 'Бумага не выбрана',
            'sheet_count': component.sheet_count,
            'circulation_display': f"{new_circulation:,}".replace(',', ' '),  # Форматированный тираж с пробелами
            'price_per_sheet': str(component.price_per_sheet),
            'formatted_price_per_sheet': f"{component.price_per_sheet:.2f} ₽",
            'total_circulation_price': str(component.total_circulation_price),
            'formatted_total_circulation_price': f"{component.total_circulation_price:.2f} ₽",
        }
        
        updated_components.append(component_data)
    
    # 9. Возвращаем обновлённые данные компонентов
    print(f"✅ Пересчёт завершён. Обновлено {len(updated_components)} компонентов")
    
    return JsonResponse({
        'success': True,
        'message': f'Цены компонентов пересчитаны для тиража {new_circulation} шт.',
        'components': updated_components,
        'circulation': new_circulation,
        'formatted_circulation': f"{new_circulation:,}".replace(',', ' '),
        'updated_count': len(updated_components)
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
    """Получение данных о просчёте для расчета цены"""
    try:
        proschet = Proschet.objects.get(id=proschet_id, is_deleted=False)
        
        # Получаем печатные компоненты (только неудаленные)
        print_components = PrintComponent.objects.filter(
            proschet=proschet, 
            is_deleted=False
        ).select_related('printer', 'paper')
        
        # Получаем дополнительные работы (только неудаленные)
        additional_works = AdditionalWork.objects.filter(
            proschet=proschet, 
            is_deleted=False
        )
        
        # Формируем данные для ответа
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
                    'total_circulation_price': str(component.total_circulation_price),
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
        return JsonResponse({
            'success': False,
            'message': 'Просчёт не найден'
        }, status=404)
    except Exception as e:
        return JsonResponse({
            'success': False,
            'message': f'Ошибка сервера: {str(e)}'
        }, status=500)

@require_POST
@csrf_exempt
def update_component_price(request):
    """
    API для обновления стоимости печатного компонента на основе нового количества листов.
    
    ВАЖНОЕ ИСПРАВЛЕНИЕ: Теперь функция правильно рассчитывает общую стоимость,
    учитывая и цену печати за лист, и стоимость бумаги.
    
    ФОРМУЛА: (Цена печати за лист + Цена материала за лист) × Количество листов
    
    ПАРАМЕТРЫ запроса (JSON):
    - component_id: ID печатного компонента
    - sheet_count: Новое количество листов (из секции "Вычисления листов")
    - proschet_id: ID просчёта (для проверки принадлежности компонента)
    
    ВОЗВРАЩАЕТ (JSON):
    - success: True/False
    - message: Сообщение об ошибке или успехе
    - component: Обновленные данные компонента
    - total_price: Новая общая стоимость всех компонентов просчёта
    """
    
    try:
        # 1. Парсим JSON данные из запроса
        data = json.loads(request.body)
        component_id = data.get('component_id')
        sheet_count = data.get('sheet_count')
        proschet_id = data.get('proschet_id')
        
        # 2. ВАЛИДАЦИЯ: Проверяем, что все необходимые параметры переданы
        if not component_id:
            return JsonResponse({
                'success': False,
                'message': 'Не указан ID компонента'
            }, status=400)
        
        if not sheet_count:
            return JsonResponse({
                'success': False,
                'message': 'Не указано количество листов'
            }, status=400)
        
        # 3. ПРЕОБРАЗОВАНИЕ: Преобразуем sheet_count в Decimal для точности
        try:
            sheet_count_decimal = Decimal(str(sheet_count))
        except (ValueError, TypeError):
            return JsonResponse({
                'success': False,
                'message': 'Количество листов должно быть числом'
            }, status=400)
        
        # 4. ПОИСК: Находим компонент в базе данных
        try:
            # Безопасно получаем компонент, проверяя что он принадлежит указанному просчёту
            component = PrintComponent.objects.get(
                id=component_id,
                proschet_id=proschet_id,
                is_deleted=False
            )
        except PrintComponent.DoesNotExist:
            return JsonResponse({
                'success': False,
                'message': f'Печатный компонент с ID {component_id} не найден или не принадлежит просчёту {proschet_id}'
            }, status=404)
        
        # 5. СОХРАНЕНИЕ СТАРЫХ ЗНАЧЕНИЙ: Для логов и сравнения
        old_sheet_count = component.sheet_count
        old_price_per_sheet = component.price_per_sheet
        old_total_price = component.total_circulation_price
        
        # 6. ОБНОВЛЕНИЕ: Обновляем количество листов в компоненте
        component.sheet_count = sheet_count_decimal
        
        # 7. ПЕРЕСЧЁТ ЦЕНЫ ЗА ЛИСТ: Используем КОЛИЧЕСТВО ЛИСТОВ для пересчета
        if component.printer:
            try:
                # Импортируем модель PrintPrice
                from print_price.models import PrintPrice
                
                # Получаем цены для этого принтера
                print_prices = PrintPrice.objects.filter(printer=component.printer).order_by('copies')
                
                if not print_prices.exists():
                    # Если нет цен для принтера, оставляем текущую цену
                    new_price_per_sheet = component.price_per_sheet or Decimal('0.00')
                    print(f"⚠️ Для принтера нет цен, оставляем текущую: {new_price_per_sheet} руб.")
                else:
                    # Преобразуем количество листов в целое число для сравнения
                    sheet_count_int = int(float(sheet_count_decimal))
                    
                    # Логика расчёта цены на основе количества листов:
                    # 1. Если количество листов точно соответствует одной из записей
                    exact_price = print_prices.filter(copies=sheet_count_int).first()
                    if exact_price:
                        new_price_per_sheet = exact_price.price_per_sheet
                        print(f"✅ Найдена точная цена для {sheet_count_int} листов: {new_price_per_sheet} руб.")
                    
                    # 2. Если количество листов меньше минимального
                    elif sheet_count_int < print_prices.first().copies:
                        min_price = print_prices.order_by('copies').first()
                        new_price_per_sheet = min_price.price_per_sheet
                        print(f"⚠️ Использована минимальная цена (для {min_price.copies} листов): {new_price_per_sheet} руб.")
                    
                    # 3. Если количество листов больше максимального
                    elif sheet_count_int > print_prices.order_by('-copies').first().copies:
                        max_price = print_prices.order_by('-copies').first()
                        new_price_per_sheet = max_price.price_per_sheet
                        print(f"⚠️ Использована максимальная цена (для {max_price.copies} листов): {new_price_per_sheet} руб.")
                    
                    # 4. Интерполяция между двумя ближайшими значениями
                    else:
                        # Находим нижнюю и верхнюю границы
                        lower_price = print_prices.filter(copies__lte=sheet_count_int).order_by('-copies').first()
                        upper_price = print_prices.filter(copies__gte=sheet_count_int).order_by('copies').first()
                        
                        if lower_price and upper_price and lower_price.copies != upper_price.copies:
                            # Линейная интерполяция
                            x1 = lower_price.copies
                            y1 = lower_price.price_per_sheet
                            x2 = upper_price.copies
                            y2 = upper_price.price_per_sheet
                            
                            # Формула линейной интерполяции
                            new_price_per_sheet = y1 + (y2 - y1) * (sheet_count_int - x1) / (x2 - x1)
                            new_price_per_sheet = Decimal(str(round(float(new_price_per_sheet), 2)))
                            print(f"📈 Рассчитана интерполированная цена для {sheet_count_int} листов: {new_price_per_sheet:.2f} руб.")
                        else:
                            # Если что-то пошло не так, оставляем текущую цену
                            new_price_per_sheet = component.price_per_sheet or Decimal('0.00')
                            print(f"⚠️ Не удалось рассчитать цену, оставляем текущую: {new_price_per_sheet} руб.")
                
                # Обновляем цену за лист в компоненте
                component.price_per_sheet = new_price_per_sheet
                
                # Логируем изменение цены
                print(f"🔄 Цена за лист пересчитана: {old_price_per_sheet} руб. → {new_price_per_sheet} руб. (на основе {sheet_count_int} листов)")
                
            except Exception as e:
                print(f"❌ Ошибка при пересчёте цены за лист: {str(e)}")
                # В случае ошибки оставляем текущую цену
                new_price_per_sheet = component.price_per_sheet or Decimal('0.00')
        
        # 8. СОХРАНЕНИЕ: Сохраняем изменения в базе данных
        component.save()
        
        # 9. РАСЧЁТ ОБЩЕЙ СТОИМОСТИ КОМПОНЕНТА:
        # ВАЖНО: Используем свойство total_circulation_price, которое уже включает стоимость бумаги
        # Формула в свойстве: (Цена печати за лист + Цена материала за лист) × Количество листов
        total_component_price = component.total_circulation_price
        
        print(f"✅ Компонент сохранён:")
        print(f"   • ID: {component.id}")
        print(f"   • Количество листов: {sheet_count_decimal}")
        print(f"   • Цена за лист: {component.price_per_sheet} руб.")
        print(f"   • Цена материала: {component.material_price_per_unit} руб.")
        print(f"   • Общая стоимость: {total_component_price} руб.")
        print(f"   • Формула: ({component.price_per_sheet} + {component.material_price_per_unit}) × {sheet_count_decimal}")
        
        # 10. РАСЧЁТ ОБЩЕЙ СТОИМОСТИ ВСЕХ КОМПОНЕНТОВ ПРОСЧЁТА:
        total_price = Decimal('0.00')
        try:
            # Получаем все компоненты просчёта (не удалённые)
            proschet_components = PrintComponent.objects.filter(
                proschet_id=proschet_id,
                is_deleted=False
            )
            
            # Суммируем стоимость всех компонентов
            for comp in proschet_components:
                total_price += comp.total_circulation_price
                
            print(f"💰 Общая стоимость всех компонентов просчёта: {total_price} руб.")
                
        except Exception as e:
            print(f"⚠️ Ошибка при расчёте общей стоимости: {str(e)}")
            # Если не удалось рассчитать общую стоимость, используем только текущий компонент
            total_price = total_component_price
        
        # 11. ФОРМАТИРОВАНИЕ: Подготавливаем данные для ответа
        # Вспомогательные функции для форматирования
        def format_price(price):
            """Форматирует цену для отображения (2 знака после запятой, знак рубля)"""
            return f"{float(price):.2f} ₽"
        
        def format_sheet_count(count):
            """Форматирует количество листов (добавляет разделители тысяч, 2 знака после запятой)"""
            try:
                # Преобразуем Decimal в float для форматирования
                count_float = float(count)
                # Форматируем с 2 знаками после запятой
                formatted = f"{count_float:,.2f}"
                # Заменяем запятые на пробелы (разделители тысяч)
                formatted = formatted.replace(',', ' ')
                # Заменяем точку на запятую (русский формат)
                formatted = formatted.replace('.', ',')
                return formatted
            except:
                return str(count)
        
        # 12. ОТВЕТ: Возвращаем обновленные данные
        return JsonResponse({
            'success': True,
            'message': f'Стоимость пересчитана: ({component.price_per_sheet:.2f} руб./лист + {component.material_price_per_unit:.2f} руб./бумага) × {sheet_count} листов',
            'component': {
                'id': component.id,
                'number': component.number,
                'printer_name': component.printer.name if component.printer else 'Принтер не выбран',
                'paper_name': component.paper.name if component.paper else 'Бумага не выбрана',
                'paper_price': float(component.material_price_per_unit) if component.paper else 0.00,
                'formatted_paper_price': format_price(component.material_price_per_unit) if component.paper else '0.00 ₽',
                'sheet_count': float(sheet_count_decimal),
                'sheet_count_display': format_sheet_count(sheet_count_decimal),
                'price_per_sheet': float(component.price_per_sheet),
                'formatted_price_per_sheet': format_price(component.price_per_sheet),
                'total_price': float(total_component_price),
                'formatted_total_price': format_price(total_component_price),
                # Дополнительная информация для отладки
                'old_price_per_sheet': float(old_price_per_sheet) if old_price_per_sheet else 0.00,
                'old_sheet_count': float(old_sheet_count) if old_sheet_count else 0.00,
                'old_total_price': float(old_total_price) if old_total_price else 0.00,
                # Информация о формуле расчета
                'calculation_formula': 'total = (price_per_sheet + paper_price) * sheet_count',
                'calculation_breakdown': {
                    'price_per_sheet': float(component.price_per_sheet),
                    'paper_price': float(component.material_price_per_unit),
                    'sheet_count': float(sheet_count_decimal),
                    'total': float(total_component_price)
                }
            },
            'total_price': float(total_price),
            'calculation_details': {
                'based_on': 'sheet_count',  # Указываем, что расчёт основан на количестве листов
                'sheet_count_used': float(sheet_count_decimal),
                'price_recalculated': True if component.printer else False,
                'paper_included': True if component.paper else False
            }
        })
        
    except json.JSONDecodeError:
        # Ошибка разбора JSON
        return JsonResponse({
            'success': False,
            'message': 'Ошибка разбора JSON данных'
        }, status=400)
        
    except Exception as e:
        # Любая другая ошибка
        import traceback
        print(f"🔥 Критическая ошибка в update_component_price: {str(e)}")
        print(traceback.format_exc())
        
        return JsonResponse({
            'success': False,
            'message': f'Внутренняя ошибка сервера: {str(e)}'
        }, status=500)