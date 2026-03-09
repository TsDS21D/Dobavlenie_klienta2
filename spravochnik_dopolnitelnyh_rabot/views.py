"""
views.py для приложения spravochnik_dopolnitelnyh_rabot.
Содержит представления для главной страницы, создания, обновления и удаления работ.
ИСПРАВЛЕНО:
  - убран @csrf_exempt, теперь CSRF защита работает штатно.
  - в update_work для price используется Decimal вместо float.
  - добавлено представление get_work для получения данных одной работы (используется для синхронизации между вкладками).
  - улучшена обработка ошибок и валидация.
  - добавлен недостающий импорт require_http_methods.
"""

from django.shortcuts import render, get_object_or_404, redirect
from django.http import JsonResponse
from django.contrib import messages
from django.views.decorators.http import require_POST, require_GET, require_http_methods  # добавлен require_http_methods
from django.contrib.auth.decorators import login_required
from django.views.decorators.cache import never_cache
from decimal import Decimal, InvalidOperation
import math  # для логарифмической интерполяции (может использоваться в utils)
import traceback

from .models import Work, WorkPrice
from .forms import WorkForm, WorkPriceForm, WorkPriceUpdateForm
from .utils import calculate_price_for_work  # функция интерполяции


# ===== СУЩЕСТВУЮЩИЕ ПРЕДСТАВЛЕНИЯ (index, create_work, update_work, get_work, delete_work) =====

@login_required(login_url='/login/')
@never_cache
def index(request):
    """
    Главная страница справочника.
    Отображает список работ, детали выбранной работы и,
    если работа выбрана, её опорные точки цен.
    """
    works = Work.objects.all().order_by('-created_at')

    search_query = request.GET.get('search', '').strip()
    if search_query:
        works = works.filter(name__icontains=search_query)

    selected_work_id = request.GET.get('work_id')
    selected_work = None
    work_prices = []  # список опорных точек для выбранной работы
    if selected_work_id:
        try:
            selected_work = Work.objects.get(id=selected_work_id)
            work_prices = WorkPrice.objects.filter(work=selected_work).order_by('sheets')
        except Work.DoesNotExist:
            messages.error(request, "Выбранная работа не найдена")

    work_form = WorkForm()

    # Обработка POST (если JS отключён)
    if request.method == 'POST' and 'add_work' in request.POST:
        work_form = WorkForm(request.POST)
        if work_form.is_valid():
            work = work_form.save()
            messages.success(request, f"Работа «{work.name}» успешно добавлена")
            return redirect(f"{request.path}?work_id={work.id}")

    context = {
        'works': works,
        'selected_work': selected_work,
        'work_prices': work_prices,      # передаём цены в шаблон
        'work_form': work_form,
        'search_query': search_query,
    }
    return render(request, 'spravochnik_dopolnitelnyh_rabot/index.html', context)


@require_POST
def create_work(request):
    print(f"🔥 Метод запроса: {request.method}")  # появится в логах сервера
    try:
        form = WorkForm(request.POST)
        if form.is_valid():
            work = form.save()
            return JsonResponse({'success': True, 'work': work.to_dict()})
        else:
            # Логируем ошибки формы для отладки
            print("Form errors:", form.errors)
            return JsonResponse({'success': False, 'errors': form.errors}, status=400)
    except Exception as e:
        # Выводим traceback в консоль сервера
        traceback.print_exc()
        return JsonResponse({'success': False, 'error': str(e)}, status=500)


@require_POST
def update_work(request, work_id):
    """
    Обновление поля работы через AJAX (inline-редактирование).
    Ожидает параметры: field_name, new_value.
    Возвращает обновлённые данные работы.
    """
    work = get_object_or_404(Work, id=work_id)

    field_name = request.POST.get('field_name')
    new_value = request.POST.get('new_value')

    if not field_name or new_value is None:
        return JsonResponse({'success': False, 'error': 'Не указано поле или новое значение'}, status=400)

    # Список полей, разрешённых для редактирования
    allowed_fields = ['name', 'price', 'formula_type', 'default_lines_count', 'default_items_per_sheet', 'k_lines']
    if field_name not in allowed_fields:
        return JsonResponse({'success': False, 'error': f'Поле "{field_name}" нельзя редактировать'}, status=400)

    try:
        # Преобразование значения в зависимости от типа поля
        if field_name == 'price' or field_name == 'k_lines':
            new_value = new_value.replace(',', '.')
            try:
                new_value = Decimal(new_value)
            except InvalidOperation:
                raise ValueError("Некорректный формат числа")
            if field_name == 'price' and new_value < 0:
                raise ValueError("Цена не может быть отрицательной")
            if field_name == 'k_lines' and (new_value < 0.1 or new_value > 100):
                raise ValueError("Коэффициент резов должен быть от 0.1 до 100")
        elif field_name in ['formula_type', 'default_lines_count', 'default_items_per_sheet']:
            try:
                new_value = int(new_value)
            except ValueError:
                raise ValueError("Значение должно быть целым числом")
            if field_name == 'formula_type' and new_value not in [1,2,3,4,5,6]:
                raise ValueError("Недопустимый тип формулы")
            if field_name in ['default_lines_count', 'default_items_per_sheet'] and new_value < 1:
                raise ValueError("Значение должно быть не менее 1")
        # Для name оставляем строку как есть

        setattr(work, field_name, new_value)
        work.save()

        return JsonResponse({
            'success': True,
            'message': 'Данные обновлены',
            'work': work.to_dict(),
            'work_id': work.id,
            'field_name': field_name,
            'new_value': str(new_value),
        })

    except ValueError as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=400)
    except Exception as e:
        return JsonResponse({'success': False, 'error': f'Ошибка при обновлении: {str(e)}'}, status=500)


@require_GET
def get_work(request, work_id):
    """
    Возвращает данные одной работы в формате JSON.
    Используется для синхронизации между вкладками.
    """
    work = get_object_or_404(Work, id=work_id)
    return JsonResponse({
        'success': True,
        'work': work.to_dict()
    })


@require_POST
def delete_work(request, work_id):
    """
    Удаление работы.
    Обрабатывает как AJAX, так и обычный POST-запрос.
    """
    work = get_object_or_404(Work, id=work_id)
    work_name = work.name
    work.delete()

    if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
        return JsonResponse({
            'success': True,
            'message': f'Работа «{work_name}» удалена'
        })

    messages.success(request, f'Работа «{work_name}» удалена')
    return redirect('spravochnik_dopolnitelnyh_rabot:index')


# ===== НОВЫЕ ПРЕДСТАВЛЕНИЯ ДЛЯ ОПОРНЫХ ТОЧЕЦ =====

@require_POST
def create_work_price(request):
    """
    Создание новой опорной точки цены через AJAX.
    Использует WorkPriceForm.
    """
    form = WorkPriceForm(request.POST)
    if form.is_valid():
        work_price = form.save()
        return JsonResponse({
            'success': True,
            'message': 'Цена успешно добавлена',
            'work_price': work_price.to_dict(),
        })
    else:
        return JsonResponse({
            'success': False,
            'errors': form.errors,
        }, status=400)


@require_POST
def update_work_price(request, price_id):
    """
    Обновление существующей опорной точки через AJAX (inline-редактирование).
    Ожидает параметры: field_name, new_value.
    """
    work_price = get_object_or_404(WorkPrice, id=price_id)

    field_name = request.POST.get('field_name')
    new_value = request.POST.get('new_value')

    if not field_name or new_value is None:
        return JsonResponse({
            'success': False,
            'error': 'Не указано поле или новое значение'
        }, status=400)

    allowed_fields = ['sheets', 'price']
    if field_name not in allowed_fields:
        return JsonResponse({
            'success': False,
            'error': f'Поле "{field_name}" нельзя редактировать'
        }, status=400)

    try:
        if field_name == 'price':
            new_value = new_value.replace(',', '.')
            try:
                new_value = Decimal(new_value)
            except InvalidOperation:
                raise ValueError("Некорректный формат цены")
            if new_value < 0:
                raise ValueError("Цена не может быть отрицательной")

        elif field_name == 'sheets':
            try:
                new_value = int(new_value)
            except ValueError:
                raise ValueError("Количество листов должно быть целым числом")
            if new_value < 1:
                raise ValueError("Количество листов должно быть не менее 1")

            # Проверка уникальности при изменении sheets
            if new_value != work_price.sheets:
                existing = WorkPrice.objects.filter(
                    work=work_price.work,
                    sheets=new_value
                ).exclude(pk=work_price.pk)
                if existing.exists():
                    return JsonResponse({
                        'success': False,
                        'error': f'Цена для работы "{work_price.work.name}" с количеством листов {new_value} уже существует'
                    }, status=400)

        setattr(work_price, field_name, new_value)
        work_price.save()
        work_price.refresh_from_db()

        return JsonResponse({
            'success': True,
            'message': 'Цена обновлена',
            'work_price': work_price.to_dict(),
            'field_name': field_name,
            'new_value': str(new_value),
        })

    except ValueError as e:
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=400)
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': f'Ошибка при обновлении: {str(e)}'
        }, status=500)


@require_POST
def delete_work_price(request, price_id):
    """
    Удаление опорной точки цены.
    """
    work_price = get_object_or_404(WorkPrice, id=price_id)
    work_id = work_price.work.id
    work_price.delete()

    if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
        return JsonResponse({
            'success': True,
            'message': 'Цена удалена',
        })

    messages.success(request, "Цена удалена")
    return redirect(f"/spravochnik_dopolnitelnyh_rabot/?work_id={work_id}")


# ===== ПРЕДСТАВЛЕНИЯ ДЛЯ ИНТЕРПОЛЯЦИИ =====

@require_POST
def update_work_interpolation_method(request, work_id):
    """
    Обновление метода интерполяции для работы через AJAX.
    """
    work = get_object_or_404(Work, id=work_id)
    new_method = request.POST.get('interpolation_method')

    if not new_method:
        return JsonResponse({
            'success': False,
            'error': 'Не указан метод интерполяции'
        }, status=400)

    valid_methods = ['linear', 'logarithmic']
    if new_method not in valid_methods:
        return JsonResponse({
            'success': False,
            'error': f'Недопустимый метод. Допустимы: {", ".join(valid_methods)}'
        }, status=400)

    old_method = work.interpolation_method
    work.interpolation_method = new_method
    work.save()
    work.refresh_from_db()

    return JsonResponse({
        'success': True,
        'message': 'Метод интерполяции обновлён',
        'work_id': work.id,
        'work_name': work.name,
        'old_method': old_method,
        'new_method': new_method,
        'new_method_display': work.get_interpolation_method_display(),
    })


@require_http_methods(["GET", "POST"])
def calculate_arbitrary_sheets_price(request, work_id):
    """
    Расчёт цены для произвольного количества листов на основе опорных точек.
    Использует функцию calculate_price_for_work из utils.py.
    """
    work = get_object_or_404(Work, id=work_id)

    # Получаем количество листов из запроса
    if request.method == 'POST':
        arbitrary_sheets = request.POST.get('arbitrary_sheets')
    else:
        arbitrary_sheets = request.GET.get('arbitrary_sheets')

    if not arbitrary_sheets:
        return JsonResponse({
            'success': False,
            'error': 'Не указано количество листов для расчёта'
        }, status=400)

    try:
        sheets_int = int(float(arbitrary_sheets))
        if sheets_int < 1:
            return JsonResponse({
                'success': False,
                'error': 'Количество листов должно быть положительным'
            }, status=400)
    except (ValueError, TypeError):
        return JsonResponse({
            'success': False,
            'error': 'Количество листов должно быть числом'
        }, status=400)

    # Проверяем наличие опорных точек
    if not work.work_prices.exists():
        return JsonResponse({
            'success': False,
            'error': f'Для работы "{work.name}" нет сохранённых цен. Добавьте цены в таблице.'
        })

    # Вызываем функцию интерполяции
    calculated_price = calculate_price_for_work(work, sheets_int)

    # Подготавливаем информацию об опорных точках
    points_info = []
    for point in work.work_prices.order_by('sheets'):
        points_info.append({
            'sheets': point.sheets,
            'price': float(point.price),
            'price_display': point.get_price_display(),
        })

    # Определяем отображаемое название метода
    method_display = dict(Work.INTERPOLATION_CHOICES).get(work.interpolation_method, 'Линейная')

    return JsonResponse({
        'success': True,
        'work_id': work.id,
        'work_name': work.name,
        'interpolation_method': work.interpolation_method,
        'interpolation_method_display': method_display,
        'arbitrary_sheets': sheets_int,
        'calculated_price': float(calculated_price),
        'calculated_price_display': f"{calculated_price:.2f} руб.",
        'calculated_price_formatted': f"{calculated_price:.2f}",
        'points_count': len(points_info),
        'price_points': points_info,
        'message': f'Для {sheets_int} листов цена: {calculated_price:.2f} руб. (метод: {method_display})'
    })