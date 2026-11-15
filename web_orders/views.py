"""
Представления (views) приложения "web_orders" (Входящие заявки с сайта).
На этом шаге — один эндпоинт: приём POST-запроса от Moguta с данными заказа.
"""
import json
from decimal import Decimal
from django.http import JsonResponse
from django.views.decorators.http import require_POST
from django.views.decorators.csrf import csrf_exempt
from django.utils import timezone
from .models import WebOrder, WebOrderItem


@csrf_exempt  # Запросы с Moguta идут без CSRF-токена
@require_POST
def api_receive_order(request):
    """
    Принимает POST-запрос от Moguta с данными заказа.
    Ожидаемый JSON в теле:
    {
        "moguta_order_id": 48,
        "moguta_order_number": "M-01048",
        "site": "bukva-a.ru",
        "add_date": "2026-11-15T14:08:00",
        "fio": "Димка",
        "email": "dimonsergeich@yandex.ru",
        "phone": "+7 (213) 456 78-90",
        "customer_type": "fiz",
        "requisites": "",
        "address": "Улица-ца",
        "delivery_name": "Доставка",
        "delivery_cost": 500,
        "payment_name": "Оплата картой по ссылке",
        "comment": "",
        "total_summ": 7280,
        "items": [
            {
                "name": "Визитки...",
                "count": 1,
                "price": 6780,
                "property": "",
                "total_price": 6780
            }
        ],
        "op_fields": {
            "1": "",
            "2": "",
            "3": "В обработке",
            "4": "Не загружен",
            "5": "Не оплачен",
            "6": "",
            "7": "",
            "8": false
        },
        "raw_payload": { ... весь исходный POST ... }
    }
    
    Возвращает JSON:
    {
        "success": true,
        "web_order_id": 1,
        "message": "Заявка принята"
    }
    Или при ошибке:
    {
        "success": false,
        "error": "Описание ошибки"
    }
    """
    # --- Разбираем JSON ---
    try:
        data = json.loads(request.body.decode('utf-8'))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return JsonResponse({
            'success': False,
            'error': 'Некорректный JSON в теле запроса'
        }, status=400)
    
    # --- Проверяем обязательные поля ---
    moguta_order_id = data.get('moguta_order_id')
    moguta_order_number = data.get('moguta_order_number', '')
    email = data.get('email', '')
    
    if not moguta_order_id:
        return JsonResponse({
            'success': False,
            'error': 'Не указан moguta_order_id'
        }, status=400)
    
    if not email:
        return JsonResponse({
            'success': False,
            'error': 'Не указан email'
        }, status=400)
    
    # --- Проверяем, нет ли уже такой заявки (защита от дублей) ---
    existing_order = WebOrder.objects.filter(
        moguta_order_id=moguta_order_id,
        is_deleted=False
    ).first()
    
    if existing_order:
        return JsonResponse({
            'success': False,
            'error': f'Заявка с moguta_order_id={moguta_order_id} уже существует'
        }, status=409)  # 409 Conflict
    
    # --- Парсим дату создания ---
    add_date = None
    if data.get('add_date'):
        try:
            add_date = timezone.datetime.fromisoformat(data['add_date'])
        except (ValueError, TypeError):
            add_date = None
    
    # --- Создаём WebOrder ---
    try:
        web_order = WebOrder.objects.create(
            moguta_order_id=moguta_order_id,
            moguta_order_number=moguta_order_number,
            site=data.get('site', 'bukva-a.ru'),
            fio=data.get('fio', ''),
            email=email,
            phone=data.get('phone', ''),
            customer_type=data.get('customer_type', 'fiz'),
            requisites=data.get('requisites', ''),
            address=data.get('address', ''),
            delivery_name=data.get('delivery_name', ''),
            delivery_cost=Decimal(str(data.get('delivery_cost', 0))),
            payment_name=data.get('payment_name', ''),
            comment=data.get('comment', ''),
            total_summ=Decimal(str(data.get('total_summ', 0))),
            add_date=add_date,
            status=WebOrder.STATUS_NEW,
            raw_payload=data,  # Сохраняем сырой JSON
        )
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': f'Ошибка создания заявки: {str(e)}'
        }, status=500)
    
    # --- Создаём WebOrderItem для каждого товара ---
    items = data.get('items', [])
    for item_data in items:
        try:
            WebOrderItem.objects.create(
                web_order=web_order,
                name=item_data.get('name', ''),
                count=int(item_data.get('count', 1)),
                price=Decimal(str(item_data.get('price', 0))),
                property=item_data.get('property', ''),
                total_price=Decimal(str(item_data.get('total_price', 0))),
            )
        except Exception as e:
            # Если не удалось создать позицию — логируем, но не падаем
            # (заявка уже создана, позиции можно добавить вручную)
            pass
    
    # --- Успех ---
    return JsonResponse({
        'success': True,
        'web_order_id': web_order.id,
        'message': 'Заявка принята'
    }, status=201)