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
import math

# ИСПРАВЛЕНИЕ: Добавляем недостающие импорты
from decimal import Decimal, InvalidOperation
from .forms import ProschetForm
from .models_list_proschet import Proschet, PrintComponent, AdditionalWork  # ИСПРАВЛЕНО: правильный импорт моделей
from devices.models import Printer
from print_price.models import PrintPrice
# Импортируем модель вычислений листов (из приложения vichisliniya_listov)
from vichisliniya_listov.models import VichisliniyaListovModel
from spravochnik_dopolnitelnyh_rabot.models import Work
# Импортируем функцию интерполяции для использования в представлении (если понадобится)
from spravochnik_dopolnitelnyh_rabot.utils import calculate_price_for_work


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
        # Получаем все не удалённые печатные компоненты для данного просчёта.
        # Используем select_related для оптимизации запросов (подгружаем связанные принтер и бумагу).
        components = PrintComponent.objects.filter(
            proschet_id=proschet_id,
            is_deleted=False
        ).select_related('printer', 'paper')

        # Получаем данные из приложения vichisliniya_listov.
        # Берём только нужные поля: ID компонента и количество листов.
        vich_data_qs = VichisliniyaListovModel.objects.filter(
            vichisliniya_listov_print_component__proschet_id=proschet_id
        ).values('vichisliniya_listov_print_component_id', 'vichisliniya_listov_list_count')

        # Преобразуем queryset в словарь для быстрого доступа по ID компонента.
        vich_data_dict = {
            item['vichisliniya_listov_print_component_id']: item['vichisliniya_listov_list_count']
            for item in vich_data_qs
        }

        components_data = []
        for component in components:
            # Получаем количество листов из словаря, если записи нет – 0.00.
            sheet_count = vich_data_dict.get(component.id, Decimal('0.00'))

            # Форматируем количество листов для отображения (с пробелами как разделителями тысяч).
            try:
                sheet_count_float = float(sheet_count)
                formatted_sheet_count = f"{sheet_count_float:,.2f}".replace(',', ' ')
            except:
                formatted_sheet_count = "0.00"

            # Формируем данные компонента для отправки на клиент.
            component_data = {
                'id': component.id,
                'number': component.number,
                'printer_name': component.printer.name if component.printer else None,
                'paper_name': component.paper.name if component.paper else None,
                'sheet_count': float(sheet_count),                       # числовое значение для расчётов
                'formatted_sheet_count_display': formatted_sheet_count, # строка для отображения в таблице
                'price_per_sheet': str(component.price_per_sheet),
                'formatted_price_per_sheet': component.formatted_price_per_sheet,
                'total_circulation_price': str(component.total_circulation_price),
                'formatted_total_circulation_price': component.formatted_total_circulation_price,
                'has_vich_data': component.id in vich_data_dict,
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


# ============================================================================
# ИСПРАВЛЕННАЯ ФУНКЦИЯ: get_additional_works
# Теперь при каждом запросе пересчитывает total_price для каждой работы
# на основе актуальных значений тиража и количества листов.
# Для формул 3 и 4 использует количество резов (cuts_count) вместо lines_count.
# ============================================================================
@login_required
@require_GET
def get_additional_works(request, component_id):
    """
    Возвращает список дополнительных работ для указанного компонента,
    а также информацию о самом компоненте, просчёте и параметрах из VichisliniyaListovModel.
    
    ИСПРАВЛЕНИЕ:
    - Логика расчёта общей стоимости работ теперь полностью находится в модели AdditionalWork.
    - Здесь мы получаем актуальные данные из VichisliniyaListovModel и тираж,
      затем для каждой работы вызываем метод recalculate_price() с этими параметрами,
      сохраняем обновлённое поле total_price (только его) и возвращаем to_dict().
    - Это гарантирует, что данные в админке и на фронтенде всегда будут синхронизированы.
    """
    # Получаем печатный компонент по ID, проверяем, что он не удалён
    component = get_object_or_404(PrintComponent, id=component_id, is_deleted=False)

    # Получаем все не удалённые дополнительные работы для этого компонента
    works = AdditionalWork.objects.filter(print_component=component, is_deleted=False).order_by('created_at')

    # Пытаемся получить данные из приложения "Вычисления листов" (VichisliniyaListovModel)
    try:
        vich_obj = VichisliniyaListovModel.objects.get(
            vichisliniya_listov_print_component=component
        )
        vich_data = {
            'item_width': float(vich_obj.vichisliniya_listov_item_width),
            'item_height': float(vich_obj.vichisliniya_listov_item_height),
            'list_count': vich_obj.vichisliniya_listov_list_count,        # количество листов (Decimal)
            'fit_total': vich_obj.vichisliniya_listov_fit_total,
            'cuts_count': vich_obj.vichisliniya_listov_cuts_count,        # количество резов
        }
        sheet_count_decimal = vich_obj.vichisliniya_listov_list_count
        cuts_count = vich_obj.vichisliniya_listov_cuts_count
    except VichisliniyaListovModel.DoesNotExist:
        # Если записи нет – устанавливаем значения по умолчанию (0)
        vich_data = {
            'item_width': 0.0,
            'item_height': 0.0,
            'list_count': Decimal('0'),
            'fit_total': 0,
            'cuts_count': 0,
        }
        sheet_count_decimal = Decimal('0')
        cuts_count = 0

    # Получаем тираж из связанного просчёта (если просчёта нет – берём 1)
    proschet = component.proschet
    circulation = proschet.circulation if proschet and proschet.circulation else 1

    # Перебираем все дополнительные работы и обновляем их общую стоимость
    for work in works:
        # Вызываем метод recalculate_price, передавая актуальные данные
        work.recalculate_price(sheet_count_decimal, cuts_count, circulation)

        # Сохраняем только поле total_price, чтобы не изменять другие поля
        # и не вызывать лишних сигналов
        work.save(update_fields=['total_price'])

    # Формируем данные для ответа: для каждой работы вызываем to_dict()
    works_data = [work.to_dict() for work in works]

    # Информация о компоненте (для фронтенда)
    component_info = {
        'id': component.id,
        'number': component.number,
        'sheet_count': str(component.sheet_count) if component.sheet_count else '0',
        'printer_name': component.printer.name if component.printer else None,
    }

    # Информация о просчёте
    proschet_info = {
        'id': proschet.id,
        'number': proschet.number,
        'circulation': proschet.circulation,
    }

    # Возвращаем JSON-ответ
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
    """
    Добавляет новую дополнительную работу из справочника.
    Ожидает параметры: print_component_id, work_id (опционально), title, price, quantity.
    Если передан work_id, то копирует formula_type, lines_count, items_per_sheet из Work.
    ИЗМЕНЕНИЯ:
    - При создании сохраняется базовая цена (price), но в методе save() модели будет использована effective_price.
    - В ответе возвращается словарь работы, включающий effective_price (из to_dict).
    """
    try:
        print_component_id = request.POST.get('print_component_id')
        work_id = request.POST.get('work_id')
        title = request.POST.get('title', '').strip()
        price = request.POST.get('price')
        quantity = request.POST.get('quantity', 1)

        if not print_component_id:
            return JsonResponse({'success': False, 'message': 'Не указан компонент'})

        component = get_object_or_404(PrintComponent, id=print_component_id)

        # Валидация цены
        try:
            price = Decimal(price)
            if price < 0:
                raise ValueError
        except:
            return JsonResponse({'success': False, 'message': 'Некорректная цена'})

        try:
            quantity = int(quantity)
            if quantity < 1:
                quantity = 1
        except:
            quantity = 1

        # Создаём объект AdditionalWork
        work = AdditionalWork(
            print_component=component,
            title=title,
            price=price,
            quantity=quantity,
        )

        # Если выбран справочный элемент, копируем из него формулу и параметры
        if work_id:
            try:
                source_work = Work.objects.get(id=work_id)
                work.work = source_work
                work.formula_type = source_work.formula_type
                work.lines_count = source_work.default_lines_count
                work.items_per_sheet = source_work.default_items_per_sheet
            except Work.DoesNotExist:
                pass  # оставляем значения по умолчанию

        work.save()  # при сохранении пересчитается total_price с использованием effective_price

        # Возвращаем полный словарь работы (to_dict уже включает effective_price)
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
    """
    Обновляет поля дополнительной работы.
    Ожидает параметры: work_id, field_name, field_value.
    Возвращает обновлённый объект работы (с effective_price).
    ИЗМЕНЕНИЯ:
    - При обновлении цены (price) она сохраняется как базовая, но при последующем сохранении
      effective_price будет вычислена заново.
    - Ответ содержит словарь с effective_price.
    """
    try:
        work_id = request.POST.get('work_id')
        field_name = request.POST.get('field_name')
        field_value = request.POST.get('field_value')

        if not work_id or not field_name:
            return JsonResponse({'success': False, 'message': 'Недостаточно данных'})

        work = get_object_or_404(AdditionalWork, id=work_id)

        # Разрешённые для обновления поля
        allowed_fields = ['title', 'price', 'quantity', 'formula_type', 'lines_count', 'items_per_sheet']

        if field_name not in allowed_fields:
            return JsonResponse({'success': False, 'message': f'Поле "{field_name}" нельзя редактировать'})

        # Преобразование значения в зависимости от типа поля
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
                # Для formula_type проверяем, что значение в допустимых пределах
                if field_name == 'formula_type' and field_value not in [1,2,3,4,5,6]:
                    return JsonResponse({'success': False, 'message': 'Некорректный тип формулы'})
            except:
                return JsonResponse({'success': False, 'message': 'Некорректное целое число'})
        elif field_name == 'title':
            field_value = field_value.strip()
            if not field_value:
                return JsonResponse({'success': False, 'message': 'Название не может быть пустым'})

        # Устанавливаем новое значение
        setattr(work, field_name, field_value)
        work.save()  # пересчёт total_price произойдёт в методе save с использованием effective_price

        # Возвращаем обновлённый словарь
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
    """
    Удаляет дополнительную работу (мягкое удаление).
    """
    try:
        work_id = request.POST.get('work_id')
        work = get_object_or_404(AdditionalWork, id=work_id)
        work.is_deleted = True
        work.save()
        return JsonResponse({'success': True, 'message': 'Работа удалена'})
    except Exception as e:
        return JsonResponse({'success': False, 'message': str(e)})
    
def get_proschet_price_data(request, proschet_id):
    """
    Получение данных о просчёте для расчета цены.
    ВОЗВРАЩАЕТ:
    - success: bool
    - proschet: объект просчёта (id, number, title, circulation)
    - print_components: список печатных компонентов с деталями
    - additional_works: список всех дополнительных работ из всех компонентов
    - summary: итоговые суммы (печать, работы, общая)
    
    ДОБАВЛЕНО: для дополнительных работ возвращаются поля total_price и formatted_total_price.
    ИСПРАВЛЕНО: в summary.additional_works_total используется сумма total_price, а не price.
    """
    try:
        # Получаем просчёт, проверяем, что он не удалён
        proschet = Proschet.objects.get(id=proschet_id, is_deleted=False)

        # Получаем все печатные компоненты для этого просчёта
        print_components = PrintComponent.objects.filter(
            proschet=proschet, 
            is_deleted=False
        ).select_related('printer', 'paper').prefetch_related('additional_works')

        # Список для хранения всех дополнительных работ из всех компонентов
        all_works = []
        
        # Переменная для суммирования общей стоимости всех дополнительных работ (total_price)
        total_works_sum = Decimal('0.00')

        # Обходим каждый компонент и собираем его дополнительные работы
        for comp in print_components:
            # Получаем все не удалённые дополнительные работы для этого компонента
            works_qs = comp.additional_works.filter(is_deleted=False)
            
            for work in works_qs:
                # Добавляем работу в общий список
                all_works.append({
                    'id': work.id,
                    'number': work.number,
                    'title': work.title,
                    'price': str(work.price),                      # цена за единицу
                    'formatted_price': f"{work.price:.2f} ₽",
                    'quantity': work.quantity,                     # количество
                    'total_price': str(work.total_price),          # общая стоимость
                    'formatted_total_price': f"{work.total_price:.2f} ₽",  # отформатированная общая стоимость
                    'component_id': comp.id,                        # ID компонента, к которому относится работа
                })
                # Накапливаем общую сумму работ
                total_works_sum += work.total_price

        # Формируем данные о печатных компонентах
        components_data = []
        for component in print_components:
            # Форматируем цену компонента (total_circulation_price)
            comp_price = component.total_circulation_price
            components_data.append({
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
                'total_circulation_price': str(comp_price),
                'formatted_total_circulation_price': f"{comp_price:.2f} ₽",
            })

        # Вычисляем общую стоимость печатных компонентов
        total_print_price = sum(comp.total_circulation_price for comp in print_components)

        # Общая стоимость просчёта (можно взять из proschet.total_price, но пересчитаем для надёжности)
        total_price = total_print_price + total_works_sum

        # Формируем итоговый ответ
        data = {
            'success': True,
            'proschet': {
                'id': proschet.id,
                'number': proschet.number,
                'title': proschet.title,
                'circulation': proschet.circulation,
            },
            'print_components': components_data,
            'additional_works': all_works,
            'summary': {
                'print_components_total': str(total_print_price),
                'formatted_print_components_total': f"{total_print_price:.2f} ₽",
                'additional_works_total': str(total_works_sum),
                'formatted_additional_works_total': f"{total_works_sum:.2f} ₽",
                'total_price': str(total_price),
                'formatted_total_price': f"{total_price:.2f} ₽",
            }
        }
        return JsonResponse(data)

    except Proschet.DoesNotExist:
        return JsonResponse({
            'success': False, 
            'message': 'Просчёт не найден'
        }, status=404)
    except Exception as e:
        # Логируем ошибку для отладки
        import traceback
        traceback.print_exc()
        return JsonResponse({
            'success': False, 
            'message': f'Ошибка сервера: {str(e)}'
        }, status=500)


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
    
@login_required
@require_GET
def get_spravochnik_works(request):
    """
    Возвращает список всех активных работ из справочника для выпадающего списка.
    """
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