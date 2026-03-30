"""
views.py для приложения devices

Этот файл содержит функции-обработчики (views) для HTTP-запросов к приложению devices.

Основные задачи:
1. Отобразить главную страницу с двумя разделами: принтеры и ламинаторы.
2. Обработать добавление нового устройства (принтера или ламинатора) через POST-запрос.
3. Обработать удаление устройства (принтера или ламинатора).
4. Обработать AJAX-запросы на обновление устройства (inline-редактирование в таблице).

Каждая view-функция:
- Принимает request (и возможно параметры из URL, например printer_id).
- Возвращает HttpResponse (обычно render, redirect или JsonResponse).
- Использует декораторы для проверки аутентификации (@login_required) и кэширования (@never_cache).
"""

# Импорты из Django для работы с запросами и ответами
from django.shortcuts import render, redirect, get_object_or_404
# render: рендерит HTML-шаблон с контекстом
# redirect: перенаправляет на другой URL
# get_object_or_404: возвращает объект или выбрасывает 404, если не найден

from django.contrib.auth.decorators import login_required
# login_required: декоратор, требующий авторизации пользователя.
# Если пользователь не залогинен, перенаправляет на страницу входа.

from django.views.decorators.cache import never_cache
# never_cache: декоратор, запрещающий кэширование страницы (чтобы всегда показывать актуальные данные).

from django.contrib import messages
# messages: фреймворк для вывода одноразовых уведомлений (успех, ошибка, предупреждение).

from django.http import JsonResponse
# JsonResponse: ответ в формате JSON (используется для AJAX-запросов).

from django.views.decorators.csrf import csrf_exempt
# csrf_exempt: отключает проверку CSRF-токена для этого view (используется для AJAX-запросов из форм без CSRF).
# Внимание: обычно лучше передавать CSRF-токен в заголовках, но здесь упрощаем.

from django.views.decorators.http import require_POST
# require_POST: декоратор, разрешающий только POST-запросы (для безопасности).

from django.db import transaction
# transaction: для атомарных операций с БД (чтобы изменения либо полностью применились, либо откатились).

# Импорты из стандартной библиотеки
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
# Decimal: для точных денежных расчётов
# InvalidOperation: исключение при некорректных операциях с Decimal
# ROUND_HALF_UP: правило округления (математическое)

# Импорты из нашего приложения
from .models import Printer, Laminator
from .forms import PrinterForm, PrinterEditForm, LaminatorForm, LaminatorEditForm
from sheet_formats.models import SheetFormat


# ==================== ГЛАВНАЯ СТРАНИЦА (ОБЩАЯ ДЛЯ ПРИНТЕРОВ И ЛАМИНАТОРОВ) ====================

@login_required(login_url='/counter/login/')   # Требуем авторизации; если нет — редирект на страницу входа
@never_cache                                   # Запрещаем браузеру кэшировать эту страницу
def index(request):
    """
    Главная страница управления устройствами.
    URL: /devices/
    Методы: GET (показать страницу), POST (добавить принтер или ламинатор).

    В контекст передаются:
    - printers: все принтеры (с подгрузкой связанных форматов)
    - laminators: все ламинаторы
    - formats: все форматы листов (для выпадающих списков в таблицах)
    - printer_form: форма добавления принтера
    - laminator_form: форма добавления ламинатора
    - PRINTER_INTERPOLATION_CHOICES, LAMINATOR_INTERPOLATION_CHOICES — для выпадающих списков в таблицах
    """

    # ---------- Получение данных для отображения ----------
    # select_related('sheet_format') — подгружает связанный объект SheetFormat одним запросом (уменьшает количество запросов к БД).
    printers = Printer.objects.all().select_related('sheet_format').order_by('name')
    laminators = Laminator.objects.all().select_related('sheet_format').order_by('name')
    formats = SheetFormat.objects.all().order_by('name')  # Все форматы для выпадающих списков

    # Инициализируем пустые формы (для GET-запроса)
    printer_form = PrinterForm()
    laminator_form = LaminatorForm()

    # ---------- Обработка POST-запроса (добавление нового устройства) ----------
    if request.method == 'POST':
        # Определяем тип устройства по скрытому полю 'device_type', переданному в форме.
        device_type = request.POST.get('device_type')  # 'printer' или 'laminator'

        if device_type == 'printer':
            # Связываем форму с переданными данными
            printer_form = PrinterForm(request.POST)
            if printer_form.is_valid():
                try:
                    # Атомарная операция: сохраняем принтер в БД
                    with transaction.atomic():
                        printer = printer_form.save()
                    # Добавляем сообщение об успехе (будет показано на следующей странице)
                    messages.success(request, f'✅ Принтер "{printer.name}" успешно добавлен!')
                    # Перенаправляем на ту же страницу (чтобы избежать повторной отправки формы при обновлении)
                    return redirect('devices:index')
                except Exception as e:
                    # Если произошла ошибка при сохранении (например, нарушение уникальности)
                    messages.error(request, f'❌ Ошибка: {str(e)}')
            else:
                # Если форма невалидна, показываем все ошибки валидации
                for field, errors in printer_form.errors.items():
                    for error in errors:
                        messages.error(request, f'❌ Ошибка в поле "{field}": {error}')

        elif device_type == 'laminator':
            # Аналогично для ламинатора
            laminator_form = LaminatorForm(request.POST)
            if laminator_form.is_valid():
                try:
                    with transaction.atomic():
                        laminator = laminator_form.save()
                    messages.success(request, f'✅ Ламинатор "{laminator.name}" успешно добавлен!')
                    return redirect('devices:index')
                except Exception as e:
                    messages.error(request, f'❌ Ошибка: {str(e)}')
            else:
                for field, errors in laminator_form.errors.items():
                    for error in errors:
                        messages.error(request, f'❌ Ошибка в поле "{field}": {error}')

    # ---------- Формирование контекста для шаблона ----------
    context = {
        'printers': printers,
        'laminators': laminators,
        'formats': formats,
        'printer_form': printer_form,
        'laminator_form': laminator_form,
        'user': request.user,                     # Текущий пользователь (для шаблона)
        'active_app': 'devices',                  # Для подсветки активного приложения в навигации
        'PRINTER_INTERPOLATION_CHOICES': Printer.INTERPOLATION_CHOICES,
        'LAMINATOR_INTERPOLATION_CHOICES': Laminator.LAMINATOR_INTERPOLATION_CHOICES,
    }

    # Рендерим шаблон 'devices/index.html' с переданным контекстом
    response = render(request, 'devices/index.html', context)

    # Заголовки для запрета кэширования (чтобы после добавления/удаления сразу видеть изменения)
    response['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    response['Pragma'] = 'no-cache'
    response['Expires'] = '0'
    return response


# ==================== ПРИНТЕРЫ: УДАЛЕНИЕ И ОБНОВЛЕНИЕ ====================

@login_required
def delete_printer(request, printer_id):
    """
    Удаляет принтер по ID.
    URL: /devices/printer/delete/<printer_id>/
    После удаления перенаправляет на главную страницу devices.
    """
    # get_object_or_404 — либо найдёт принтер, либо выбросит 404 ошибку
    printer = get_object_or_404(Printer, id=printer_id)
    # Сохраняем название для сообщения (до удаления)
    name = printer.name
    # Удаляем объект из базы данных
    printer.delete()
    # Добавляем сообщение об успехе
    messages.success(request, f'✅ Принтер "{name}" удалён.')
    # Перенаправляем на главную страницу приложения devices
    return redirect('devices:index')


@login_required
@require_POST                # Разрешаем только POST-запросы
@csrf_exempt                 # Отключаем CSRF для упрощения AJAX (но в реальном проекте лучше передавать токен)
def update_printer(request, printer_id):
    """
    Обрабатывает AJAX-запрос на обновление параметров принтера.
    URL: /devices/printer/update/<printer_id>/
    Ожидает JSON с данными (name, sheet_format, margin_mm, duplex_coefficient, devices_interpolation_method).
    Возвращает JSON с результатом операции.
    """
    try:
        # Находим принтер по ID
        printer = Printer.objects.get(id=printer_id)

        # Определяем, в каком формате пришли данные (JSON или обычный POST)
        if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
            # Это AJAX-запрос, данные в JSON
            import json
            data = json.loads(request.body)   # Парсим JSON из тела запроса
        else:
            # Обычный POST-запрос (например, из формы)
            data = request.POST.dict()

        # Передаём данные в форму редактирования, указывая существующий экземпляр printer
        form = PrinterEditForm(data, instance=printer)

        if form.is_valid():
            # Атомарно сохраняем изменения
            with transaction.atomic():
                updated_printer = form.save()
            # Подготавливаем успешный ответ
            return JsonResponse({
                'success': True,
                'message': f'Принтер "{updated_printer.name}" обновлён',
                'printer': updated_printer.to_dict()   # to_dict() преобразует объект в словарь для JSON
            })
        else:
            # Если форма невалидна, собираем ошибки
            errors = {field: list(errors) for field, errors in form.errors.items()}
            return JsonResponse({
                'success': False,
                'message': 'Ошибка валидации данных',
                'errors': errors
            }, status=400)   # HTTP 400 Bad Request

    except Printer.DoesNotExist:
        return JsonResponse({
            'success': False,
            'message': 'Принтер не найден'
        }, status=404)       # HTTP 404 Not Found

    except Exception as e:
        # Любая другая ошибка (например, проблемы с БД)
        return JsonResponse({
            'success': False,
            'message': str(e)
        }, status=500)       # HTTP 500 Internal Server Error


# ==================== ЛАМИНАТОРЫ: УДАЛЕНИЕ И ОБНОВЛЕНИЕ ====================

@login_required
def delete_laminator(request, laminator_id):
    """
    Удаляет ламинатор по ID.
    URL: /devices/laminator/delete/<laminator_id>/
    """
    laminator = get_object_or_404(Laminator, id=laminator_id)
    name = laminator.name
    laminator.delete()
    messages.success(request, f'✅ Ламинатор "{name}" удалён.')
    return redirect('devices:index')


@login_required
@require_POST
@csrf_exempt
def update_laminator(request, laminator_id):
    """
    Обрабатывает AJAX-запрос на обновление параметров ламинатора.
    URL: /devices/laminator/update/<laminator_id>/
    Аналогична update_printer, но для модели Laminator.
    """
    try:
        laminator = Laminator.objects.get(id=laminator_id)

        if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
            import json
            data = json.loads(request.body)
        else:
            data = request.POST.dict()

        form = LaminatorEditForm(data, instance=laminator)

        if form.is_valid():
            with transaction.atomic():
                updated_laminator = form.save()
            return JsonResponse({
                'success': True,
                'message': f'Ламинатор "{updated_laminator.name}" обновлён',
                'laminator': updated_laminator.to_dict()   # Обратите внимание: ключ 'laminator', а не 'printer'
            })
        else:
            errors = {field: list(errors) for field, errors in form.errors.items()}
            return JsonResponse({
                'success': False,
                'message': 'Ошибка валидации данных',
                'errors': errors
            }, status=400)

    except Laminator.DoesNotExist:
        return JsonResponse({
            'success': False,
            'message': 'Ламинатор не найден'
        }, status=404)

    except Exception as e:
        return JsonResponse({
            'success': False,
            'message': str(e)
        }, status=500)