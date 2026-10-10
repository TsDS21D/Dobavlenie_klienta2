# web_calculators/views.py
"""
Представления (views) приложения "Веб-калькуляторы".

Содержит три функции:
1. web_calculator_view        — публичная HTML-страница калькулятора (для тестов).
2. web_calculator_options_api — GET-эндпоинт с опциями калькулятора (для сайта).
3. web_calculator_price_api   — POST-эндпоинт с расчётом цены (для сайта).

API-эндпоинты отдают JSON. Страница — обычный HTML.
Авторизация не требуется: и страница, и API публичны.
"""

# ===== СТАНДАРТНЫЕ ИМПОРТЫ =====
import json                                       # Разбор JSON тела запроса
from django.http import JsonResponse              # JSON-ответ
from django.shortcuts import render, get_object_or_404
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_GET, require_POST
from django.views.decorators.cache import never_cache
from django.views.decorators.clickjacking import xframe_options_exempt
from django.contrib.auth.decorators import login_required, user_passes_test

# ===== ИМПОРТЫ НАШИХ МОДУЛЕЙ =====
from .models import WebCalculator
from .moguta import get_client, MogutaError
from .services import (
    get_options,
    calculate_price,
    create_proschet_from_webcalc,
    build_product_for_webcalc,
    OrderCalculationError,
)


# ============================================================================
# ПУБЛИЧНАЯ HTML-СТРАНИЦА (для тестов)
# ============================================================================

@never_cache
@xframe_options_exempt
def web_calculator_view(request, slug):
    """
    Публичная страница калькулятора на нашем домене.
    Пока служит для тестирования API: рисует форму, дёргает API через JS,
    отображает результат. На боевом сайте этот HTML будет встроен в bukva-a.ru.

    @xframe_options_exempt убирает заголовок X-Frame-Options для этой вью,
    чтобы страницу можно было встроить в iframe на bukva-a.ru.
    Дополнительно мы сами ставим Content-Security-Policy: frame-ancestors —
    более точный современный способ указать, кто может встраивать страницу.
    """
    calculator = get_object_or_404(WebCalculator, slug=slug, is_active=True)
    response = render(request, 'web_calculators/calculator.html', {
        'calculator': calculator,
    })
    # Разрешаем встраивать только с bukva-a.ru (и со своего домена — на случай тестов).
    response['Content-Security-Policy'] = (
        "frame-ancestors 'self' https://bukva-a.ru https://www.bukva-a.ru"
    )
    return response


# ============================================================================
# API: ОПЦИИ
# ============================================================================

@require_GET
def web_calculator_options_api(request, slug):
    """
    GET /web-calc/api/<slug>/options/
    Возвращает структуру опций калькулятора: принтеры, бумаги, плёнки,
    работы, диапазоны размеров, пресеты.
    """
    calculator = get_object_or_404(WebCalculator, slug=slug, is_active=True)
    data = get_options(calculator)
    return JsonResponse(data)


# ============================================================================
# API: РАСЧЁТ ЦЕНЫ
# ============================================================================

@csrf_exempt
@require_POST
def web_calculator_price_api(request, slug):
    """
    POST /web-calc/api/<slug>/price/
    Принимает JSON с параметрами заказа. Возвращает JSON с ценой.
    При ошибке валидации возвращает 400 и описание.
    """
    calculator = get_object_or_404(WebCalculator, slug=slug, is_active=True)

    # Разбор JSON.
    try:
        payload = json.loads(request.body.decode('utf-8'))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return JsonResponse({
            'success': False,
            'error': 'Некорректный JSON в теле запроса',
            'error_code': 'bad_json',
        }, status=400)

    # Расчёт.
    try:
        result = calculate_price(calculator, payload)
    except OrderCalculationError as e:
        return JsonResponse(e.to_dict(), status=400)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JsonResponse({
            'success': False,
            'error': f'Внутренняя ошибка: {e}',
            'error_code': 'internal_error',
        }, status=500)

    return JsonResponse(result)

# ============================================================================
# API: СОЗДАНИЕ ПРОСЧЁТА ИЗ ВЕБ-КАЛЬКУЛЯТОРА (только для сотрудников)
# ============================================================================

def _is_staff(user):
    """Проверка: пользователь — сотрудник (is_staff)."""
    return user.is_authenticated and user.is_staff


@login_required(login_url='/login/')
@user_passes_test(_is_staff)
@require_POST
def web_calculator_create_proschet_api(request, slug):
    """
    POST /web-calc/api/<slug>/create-proschet/

    Создаёт реальный просчёт (calculator.Proschet) со всеми вложенными
    объектами на основе параметров, выбранных в веб-калькуляторе.

    Доступно только сотрудникам (is_staff).
    Требует CSRF-токен (без @csrf_exempt) — JS шлёт его в заголовке
    X-CSRFToken.

    Формат тела запроса — тот же, что у price_api.
    Ответ: { success, proschet_id, proschet_number, proschet_title }.
    """
    calculator = get_object_or_404(WebCalculator, slug=slug, is_active=True)

    # Разбор JSON.
    try:
        payload = json.loads(request.body.decode('utf-8'))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return JsonResponse({
            'success': False,
            'error': 'Некорректный JSON в теле запроса',
            'error_code': 'bad_json',
        }, status=400)

    # Создание просчёта.
    try:
        proschet = create_proschet_from_webcalc(
            calculator, payload, user=request.user,
        )
    except OrderCalculationError as e:
        return JsonResponse(e.to_dict(), status=400)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JsonResponse({
            'success': False,
            'error': f'Внутренняя ошибка: {e}',
            'error_code': 'internal_error',
        }, status=500)

    return JsonResponse({
        'success': True,
        'proschet_id': proschet.id,
        'proschet_number': proschet.number,
        'proschet_title': proschet.title,
    })


# ============================================================================
# API: ДОБАВЛЕНИЕ ТОВАРА В КОРЗИНУ MOGUTA (bukva-a.ru)
# ============================================================================

@csrf_exempt
@require_POST
def web_calculator_add_to_cart_api(request, slug):
    """
    POST /web-calc/api/<slug>/add-to-cart/

    Создаёт РЕАЛЬНЫЙ просчёт (Proschet) в БД beauty-print.ru, затем —
    товар в каталоге bukva-a.ru через Moguta API с артикулом PR-N
    (номер просчёта). Возвращает product_id и характеристики товара.

    Дальше JS внутри iframe передаст product_id родителю на bukva-a.ru,
    а тот добавит товар в корзину через POST /cart.

    Публичный эндпоинт — CSRF отключён (@csrf_exempt), потому что
    запросы идут с чужого домена (bukva-a.ru).

    ЧТО ИЗМЕНИЛОСЬ:
        Раньше эндпоинт НЕ создавал просчёт в БД — просто считал цену
        в памяти и слал товар в Moguta с code=CALC-<slug>-<timestamp>.
        Теперь:
          1. Создаётся Proschet в БД (это «якорь» для пересчёта цен).
          2. code товара = proschet.number (например, "PR-42").
          3. Цена товара = proschet.total_price (актуальная цена просчёта).
        Благодаря этому при открытии корзины на bukva-a.ru плагин
        найдёт товар по префиксу "PR-" и запросит актуальную цену.
    """
    calculator = get_object_or_404(WebCalculator, slug=slug, is_active=True)

    # Разбор JSON.
    try:
        payload = json.loads(request.body.decode('utf-8'))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return JsonResponse({
            'success': False,
            'error': 'Некорректный JSON в теле запроса',
            'error_code': 'bad_json',
        }, status=400)

    # ===== 1. Считаем цену — для логирования и как быстрый чек валидации =====
    # Если payload некорректен, calculate_price бросит OrderCalculationError,
    # и мы вернём клиенту понятную ошибку (не создавая просчёт в БД).
    try:
        result = calculate_price(calculator, payload)
    except OrderCalculationError as e:
        return JsonResponse(e.to_dict(), status=400)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JsonResponse({
            'success': False,
            'error': f'Внутренняя ошибка расчёта: {e}',
            'error_code': 'internal_error',
        }, status=500)

    # ===== 2. Создаём РЕАЛЬНЫЙ просчёт в БД =====
    # Это «якорь», по которому потом будем пересчитывать актуальную цену
    # (когда клиент откроет корзину на bukva-a.ru).
    try:
        proschet = create_proschet_from_webcalc(calculator, payload, user=None)
    except OrderCalculationError as e:
        # Ошибки валидации — возвращаем клиенту как есть.
        return JsonResponse(e.to_dict(), status=400)
    except Exception as e:
        # Внутренняя ошибка — логируем, отдаём 500.
        import traceback
        traceback.print_exc()
        return JsonResponse({
            'success': False,
            'error': f'Ошибка создания просчёта: {e}',
            'error_code': 'proschet_creation_error',
        }, status=500)

    # ===== 3. Собираем данные товара для Moguta =====
    # Передаём proschet — из него берётся номер (code) и итоговая цена.
    try:
        product_data = build_product_for_webcalc(
            calculator,
            payload,
            proschet=proschet,
            price=result['total_price'],
            mass_g=result['total_mass_g'],
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JsonResponse({
            'success': False,
            'error': f'Ошибка формирования товара: {e}',
            'error_code': 'build_error',
        }, status=500)

    # ===== 4. Создаём товар в Moguta через API =====
    try:
        client = get_client()
        # Первый вызов — создаёт товар.
        client.import_product(product_data)
        # Второй вызов — Moguta идёт в ветку «обновление» и корректно
        # привязывает значения характеристик (createProductStringProp
        # работает только в этой ветке).
        client.import_product(product_data)
        # importProduct не возвращает id — получаем его отдельным запросом.
        created = client.get_product_by_code(product_data['code'])
        product_id = created.get('id') if created else None
        if not product_id:
            return JsonResponse({
                'success': False,
                'error': 'Товар создан, но не удалось получить его id',
                'error_code': 'product_id_not_found',
            }, status=500)
    except MogutaError as e:
        return JsonResponse({
            'success': False,
            'error': f'Ошибка Moguta API: {e}',
            'error_code': 'moguta_error',
        }, status=502)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JsonResponse({
            'success': False,
            'error': f'Внутренняя ошибка при обращении к Moguta: {e}',
            'error_code': 'internal_error',
        }, status=500)

    # ===== 5. Успех — возвращаем данные клиенту =====
    return JsonResponse({
        'success': True,
        'product_id': product_id,
        'product_code': product_data['code'],       # например, "PR-42"
        'product_title': product_data['title'],
        'price': float(proschet.total_price),
        'proschet_id': proschet.id,
        'proschet_number': proschet.number,
        'properties': product_data.get('property', []),
    })