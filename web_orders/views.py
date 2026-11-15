"""
Представления (views) приложения "web_orders" (Входящие заявки с сайта).
На этом шаге — один эндпоинт: приём POST-запроса от Moguta с данными заказа.
"""
import json
from decimal import Decimal, InvalidOperation
from django.db import IntegrityError, transaction
from django.http import JsonResponse
from django.views.decorators.http import require_POST
from django.views.decorators.csrf import csrf_exempt
from django.utils import timezone
from .models import WebOrder, WebOrderItem

def _to_decimal(value):
    """
    Безопасно превращает значение из JSON в Decimal.

    ЗАЧЕМ ЭТО НУЖНО:
    Moguta в разных местах присылает числа по-разному: то числом (500),
    то строкой ("500"), то пустой строкой (""), то null. Прямое
    Decimal(str(value)) на null и на "" бросает исключение и роняет
    создание всей заявки в 500. Здесь любое нераспознанное значение
    превращается в 0.00 — заявка сохранится, менеджер поправит руками.

    Дополнительно убираем пробелы (разделитель тысяч "1 030") и
    заменяем запятую на точку ("1030,50") — на случай, если значение
    когда-нибудь придёт из другого источника, а не из PHP.
    """
    if value is None or value == '':
        return Decimal('0.00')
    try:
        return Decimal(str(value).replace(' ', '').replace(',', '.'))
    except (InvalidOperation, ValueError, TypeError):
        return Decimal('0.00')


def _to_int(value, default=1):
    """
    Безопасно превращает значение в целое число.

    ЗАЧЕМ ЭТО НУЖНО:
    int('1.0') в Python падает с ValueError, а JSON может легко принести
    "1.0" вместо 1. Поэтому сначала приводим к float, потом к int.
    Если значение вообще не число — возвращаем default (по умолчанию 1,
    потому что позиция заказа с количеством 0 бессмысленна).
    """
    try:
        return int(float(str(value).replace(',', '.')))
    except (TypeError, ValueError):
        return default

def _to_json(value):
    """
    Проверяет, что значение годится для JSONField.

    ЗАЧЕМ: JSONField принимает dict и list, но если с сайта вдруг придёт
    op_fields строкой, числом или булевым — Django попытается это
    сериализовать и может уронить создание заявки. Такое поле нам нужно
    как справочник значений, поэтому всё, что не словарь и не список,
    считаем отсутствующим (None).
    """
    if isinstance(value, (dict, list)):
        return value
    return None

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
    
    # --- Создаём заявку и её позиции ОДНОЙ транзакцией ---
    #
    # ПОЧЕМУ ТРАНЗАКЦИЯ (и почему это важно):
    # Раньше заявка создавалась ДО цикла по позициям. Если позиции падали
    # с ошибкой — в базе оставалась заявка БЕЗ состава, а клиент получал 500.
    # Повторная отправка того же заказа натыкалась на 409 («уже существует»)
    # и позиции уже не появлялись никогда: заявка превращалась в «зомби».
    # Теперь либо сохраняется всё целиком (заявка + все позиции), либо
    # ничего не сохраняется. Повторная отправка после сбоя пройдёт нормально.
    try:
        with transaction.atomic():
            # Сама заявка. Снимок данных с сайта на момент оформления.
            web_order = WebOrder.objects.create(
                moguta_order_id=moguta_order_id,
                moguta_order_number=moguta_order_number,
                site=data.get('site', 'bukva-a.ru'),
                fio=data.get('fio') or '',
                email=email,
                phone=data.get('phone') or '',
                customer_type=data.get('customer_type') or 'fiz',
                requisites=data.get('requisites') or '',
                address=data.get('address') or '',
                delivery_name=data.get('delivery_name') or '',
                delivery_cost=_to_decimal(data.get('delivery_cost')),
                payment_name=data.get('payment_name') or '',
                comment=data.get('comment') or '',
                total_summ=_to_decimal(data.get('total_summ')),
                add_date=add_date,
                status=WebOrder.STATUS_NEW,
                raw_payload=data,  # Сырой JSON — для отладки и повторной конвертации
                # Снимок доп. полей Moguta (статусы, ссылка на оплату, счёт).
                # Приходит в JSON как словарь с ключами-ID: {"3": {...}, ...}.
                op_fields=_to_json(data.get('op_fields')),
            )

            # Позиции заявки.
            # Если ключа items нет или пришёл не список — считаем список пустым
            # (заявка при этом сохранится, менеджер добавит позиции вручную).
            items = data.get('items') or []
            if not isinstance(items, list):
                items = []

            for item_data in items:
                # Одна позиция = один товар из корзины Moguta.
                WebOrderItem.objects.create(
                    web_order=web_order,
                    name=item_data.get('name') or '',
                    # Артикул товара из Moguta. Для товаров веб-калькулятора
                    # это номер просчёта (PR-NN) — по нему при конвертации
                    # найдём Proschet. Для обычных товаров каталога здесь
                    # будет их собственный артикул (CN1_107 и подобные),
                    # и такая позиция станет строкой OrderTovar.
                    code=item_data.get('code') or '',
                    count=_to_int(item_data.get('count'), default=1),
                    price=_to_decimal(item_data.get('price')),
                    property=item_data.get('property') or '',
                    total_price=_to_decimal(item_data.get('total_price')),
                )

    except IntegrityError:
        # Гонка дублей: два запроса одновременно прошли предварительную
        # проверку filter().first() и оба попытались создать заявку с одним
        # и тем же moguta_order_id. Уникальный индекс в БД второй запрос
        # не пропустил, Django бросил IntegrityError.
        #
        # Отвечаем тем же 409 и тем же текстом, что и обычная повторная
        # отправка: для сайта поведение должно быть одинаковым, он на любой
        # 409 просто пишет строку http=409 в свой лог и продолжает работу.
        #
        # ВАЖНО: этот блок обязан стоять ВЫШЕ except Exception, иначе
        # IntegrityError перехватится общим обработчиком и станет 500.
        return JsonResponse({
            'success': False,
            'error': f'Заявка с moguta_order_id={moguta_order_id} уже существует'
        }, status=409)


    except Exception as e:
        # Любая ошибка — транзакция уже откатилась, «полузаявки» в базе нет.
        return JsonResponse({
            'success': False,
            'error': f'Ошибка создания заявки: {str(e)}'
        }, status=500)
    
    # --- Успех ---
    return JsonResponse({
        'success': True,
        'web_order_id': web_order.id,
        'message': 'Заявка принята'
    }, status=201)