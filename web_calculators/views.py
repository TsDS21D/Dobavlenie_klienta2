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
from django.contrib.auth.decorators import login_required

# ===== ИМПОРТЫ НАШИХ МОДУЛЕЙ =====
from .models import WebCalculator
from .services import (
    get_options,
    calculate_price,
    OrderCalculationError,
)


# ============================================================================
# ПУБЛИЧНАЯ HTML-СТРАНИЦА (для тестов)
# ============================================================================

@never_cache
def web_calculator_view(request, slug):
    """
    Публичная страница калькулятора на нашем домене.
    Пока служит для тестирования API: рисует форму, дёргает API через JS,
    отображает результат. На боевом сайте этот HTML будет встроен в bukva-a.ru.
    """
    calculator = get_object_or_404(WebCalculator, slug=slug, is_active=True)
    return render(request, 'web_calculators/calculator.html', {
        'calculator': calculator,
    })


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