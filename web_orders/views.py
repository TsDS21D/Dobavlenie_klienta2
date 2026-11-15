"""
Представления (views) приложения "web_orders" (Входящие заявки с сайта).
На этом шаге — один эндпоинт: приём POST-запроса от Moguta с данными заказа.
"""
import json
from decimal import Decimal, InvalidOperation
from django.db import IntegrityError, transaction
from django.http import JsonResponse
from django.shortcuts import render
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



def list_web_orders(request):
    """
    Страница «Входящие заявки с сайта» — GET /web-orders/.

    ЗАЧЕМ ОНА НУЖНА:
    До этого заявки можно было смотреть только в стандартной админке Django
    (/admin/web_orders/weborder/). Менеджеру туда ходить неудобно: другой
    интерфейс, нет карточек в стиле CRM, нет кнопок действий. Эта страница —
    рабочий стол менеджера для входящих заявок.

    ЧТО ПОКАЗЫВАЕТ (первая версия):
        - заявки, сгруппированные по статусам (Новые → В работе →
          Конвертированы → Отклонены → Ошибка);
        - внутри группы — карточки: в свёрнутом виде шапка, по клику
          раскрывается состав заявки.

    ЧЕГО ПОКА НЕ УМЕЕТ (это следующие шаги):
        - редактировать поля заявки;
        - отклонять заявку;
        - конвертировать заявку в заказ (Order).
    """
    # --- Шаг 1. Выборка заявок ---
    # is_deleted=False — в проекте принято «мягкое удаление»: строки физически
    # не удаляются, а помечаются флагом (так же сделано в orders).
    #
    # prefetch_related('items') — ВАЖНО для производительности: без него
    # позиции каждой заявки подтягивались бы отдельным запросом к БД прямо
    # в шаблоне. На 50 заявках это дало бы 51 запрос вместо двух.
    #
    # Порядок сортировки задан в Meta модели (ordering = ['-created_at']),
    # поэтому .order_by() здесь не нужен.
    orders = WebOrder.objects.filter(is_deleted=False).prefetch_related('items')

    # --- Шаг 2. Раскладываем заявки по статусам ---
    # Шаблон Django не умеет фильтровать список по условию, а тег
    # {% regroup %} группирует только по уже отсортированному полю — нам же
    # нужен СВОЙ порядок статусов, не алфавитный. Поэтому группы собираем
    # здесь.
    #
    # Здесь мы один раз проходим по queryset — это заодно выполняет запрос
    # к БД (и подтягивает позиции благодаря prefetch_related). Дальше шаблон
    # работает уже с обычными списками в памяти.
    by_status = {}
    for order in orders:
        # --- Флаг «в заявке есть позиция из веб-калькулятора» ---
        # Нужен, чтобы в шапке карточки показать метку «Калькулятор»:
        # она сразу говорит менеджеру, что заявку можно связать с
        # реальным просчётом (Proschet), а не оформлять как свободный товар.
        #
        # Признак — артикул позиции начинается с 'PR-': именно так
        # нумеруются просчёты в ИС (Proschet.number: PR-1, PR-42, ...),
        # и именно этот код уходит на сайт при создании товара из
        # веб-калькулятора.
        #
        # ПОЧЕМУ any(...) ЗДЕСЬ, А НЕ В ШАБЛОНЕ:
        # шаблон Django не умеет проверять «есть ли в списке элемент,
        # удовлетворяющий условию» — только перебирать все подряд.
        # Заодно order.items.all() здесь берётся из prefetch-кэша,
        # то есть лишних запросов к БД не будет.
        #
        # (item.code or '') — защита от старых заявок, где code пустой
        # или NULL: без неё startswith упадёт на None.
        order.has_pr_item = any(
            (item.code or '').startswith('PR-') for item in order.items.all()
        )

        by_status.setdefault(order.status, []).append(order)

    # --- Шаг 3. Готовые группы для шаблона ---
    # Порядок групп и подписи берём из STATUS_CHOICES модели — это
    # единственное место, где перечислены статусы. Если завтра добавится
    # новый статус, достаточно поправить модель: и группы, и счётчики
    # подхватят его автоматически, шаблон править не придётся.
    #
    # Пустые группы тоже попадают в список — шаблон сам решит, показывать
    # их или скрыть (мы скроем, чтобы не плодить пустые заголовки).
    groups = [
        {
            'status': value,   # 'new', 'processing', ... — для CSS-класса
            'label': label,    # 'Новая', 'В работе', ... — для заголовка
            'orders': by_status.get(value, []),
            'count': len(by_status.get(value, [])),
        }
        for value, label in WebOrder.STATUS_CHOICES
    ]

    context = {
        'groups': groups,
        # Общее число неудалённых заявок — для заголовка страницы.
        'total_count': sum(group['count'] for group in groups),
        # active_app — какой раздел подсветить в правой панели навигации
        # (counter/app_panels.html). Отдельного пункта «Заявки с сайта» там
        # пока нет, поэтому подсвечиваем «Заказы». Когда добавим пункт —
        # заменим на 'web_orders'.
        'active_app': 'orders',
    }

    return render(request, 'web_orders/index.html', context)



@require_POST
def api_reject_web_order(request, order_id):
    """
    Отклонение входящей заявки — POST /web-orders/api/reject/<id>/.

    ЗАЧЕМ: заявка с сайта может быть спамом, тестовой или ошибочной.
    Менеджер должен уметь убрать её из работы, не удаляя физически
    (в проекте принято мягкое удаление, а «отклонена» — это статус,
    заявка остаётся в базе и её видно в группе «Отклонена»).

    ОТВЕТ (JSON):
        успех:  {"success": true,  "status": "rejected", "status_display": "Отклонена"}
        ошибки: {"success": false, "error": "..."}  + код 404 / 409

    ПОЧЕМУ ЗДЕСЬ НЕТ @csrf_exempt:
    в отличие от приёма заявок с Moguta (чужой домен, токена CSRF нет),
    этот запрос идёт со СВОЕЙ страницы. Значит CSRF-защиту надо
    оставить включённой — она бесплатно защищает от подделки запроса
    с чужого сайта. Токен JS возьмёт из <meta name="csrf-token">,
    который уже есть в orders/base.html.
    """
    # --- Ищем заявку ---
    # is_deleted=False: уже удалённую заявку отклонять бессмысленно.
    try:
        web_order = WebOrder.objects.get(pk=order_id, is_deleted=False)
    except WebOrder.DoesNotExist:
        return JsonResponse({
            'success': False,
            'error': 'Заявка не найдена',
        }, status=404)

    # --- Проверяем, что отклонять ещё можно ---
    # Конвертированную заявку отклонять нельзя: за ней уже стоит реальный
    # заказ в производстве. Сначала нужно разобраться с заказом, а не
    # помечать заявку отклонённой (иначе в отчётах будет противоречие:
    # «отклонена», а заказ существует).
    if web_order.status == WebOrder.STATUS_CONVERTED:
        return JsonResponse({
            'success': False,
            'error': 'Заявка уже конвертирована в заказ — отклонять нельзя',
        }, status=409)

    # --- Необязательный комментарий менеджера ---
    # Тело запроса может быть пустым (кнопка без формы) — это нормально.
    # Если комментарий пришёл, ДОПИСЫВАЕМ его к уже существующему, а не
    # затираем: в поле могло уже быть что-то написано вручную в админке.
    comment = ''
    if request.body:
        try:
            payload = json.loads(request.body.decode('utf-8'))
            comment = (payload.get('comment') or '').strip()
        except (json.JSONDecodeError, UnicodeDecodeError):
            # Битый JSON не должен мешать отклонению — просто игнорируем его.
            comment = ''

    if comment:
        if web_order.manager_comment:
            web_order.manager_comment = web_order.manager_comment + '\n' + comment
        else:
            web_order.manager_comment = comment

    # --- Меняем статус ---
    # update_fields — сохраняем только эти колонки: меньше нагрузки на БД
    # и никакого риска затереть другие поля (например, если менеджер
    # параллельно правил заявку в админке).
    # updated_at включаем явно: при auto_now Django обновляет поле только
    # если оно перечислено в update_fields.
    web_order.status = WebOrder.STATUS_REJECTED
    web_order.save(update_fields=['status', 'manager_comment', 'updated_at'])

    # status_display — готовое человеческое название («Отклонена») из
    # STATUS_CHOICES. JS покажет его в уведомлении, не дублируя текст в коде.
    return JsonResponse({
        'success': True,
        'status': web_order.status,
        'status_display': web_order.get_status_display(),
    })



@require_POST
def api_restore_web_order(request, order_id):
    """
    Возврат отклонённой заявки в работу — POST /web-orders/api/restore/<id>/.

    ЗАЧЕМ: менеджер может отклонить заявку по ошибке (не тот заказ,
    передумал, клиент позвонил и подтвердил). Без этой кнопки вернуть
    заявку в работу можно только через админку Django, а это лишние
    шаги и риск ошибиться.

    КУДА ВОЗВРАЩАЕМ: в статус «Новая» (STATUS_NEW), а не в «В работе».
    «Новая» — это начало очереди, и заявка снова попадёт на глаза
    менеджеру вместе с остальными необработанными.

    ЧТО НЕ ТРОГАЕМ: комментарий менеджера (manager_comment) оставляем
    как есть. Это история работы с заявкой, а не её состояние.

    ОТВЕТ (JSON):
        успех:  {"success": true, "status": "new", "status_display": "Новая"}
        ошибки: {"success": false, "error": "..."} + код 404 / 409
    """
    # --- Ищем заявку ---
    try:
        web_order = WebOrder.objects.get(pk=order_id, is_deleted=False)
    except WebOrder.DoesNotExist:
        return JsonResponse({
            'success': False,
            'error': 'Заявка не найдена',
        }, status=404)

    # --- Проверяем, что возвращать есть смысл ---
    # Конвертированную заявку возвращать нельзя: за ней стоит реальный
    # заказ, и «вернуть в новые» означало бы создать его повторно.
    if web_order.status == WebOrder.STATUS_CONVERTED:
        return JsonResponse({
            'success': False,
            'error': 'Заявка уже конвертирована в заказ — вернуть нельзя',
        }, status=409)

    # Если заявка не отклонена, возвращать нечего. Отвечаем успехом без
    # изменений: для интерфейса это не ошибка (кнопку просто не должно
    # быть видно), но и молча менять статус «Новой» на «Новую» незачем.
    if web_order.status != WebOrder.STATUS_REJECTED:
        return JsonResponse({
            'success': False,
            'error': 'Вернуть можно только отклонённую заявку',
        }, status=409)

    # --- Возвращаем в «Новые» ---
    # update_fields — по той же причине, что и в api_reject_web_order:
    # правим ровно две колонки и не рискуем затереть чужие изменения.
    web_order.status = WebOrder.STATUS_NEW
    web_order.save(update_fields=['status', 'updated_at'])

    return JsonResponse({
        'success': True,
        'status': web_order.status,
        'status_display': web_order.get_status_display(),
    })