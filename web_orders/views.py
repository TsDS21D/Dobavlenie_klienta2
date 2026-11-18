"""
Представления (views) приложения "web_orders" (Входящие заявки с сайта).
На этом шаге — один эндпоинт: приём POST-запроса от Moguta с данными заказа.
"""
import hmac
import json
from decimal import Decimal, InvalidOperation

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.db import IntegrityError, transaction
from django.http import FileResponse, HttpResponse, JsonResponse
from django.conf import settings
from django.shortcuts import render, get_object_or_404
from django.views.decorators.http import require_POST
from django.views.decorators.csrf import csrf_exempt
# Авторизация: доступ к заявкам с сайта — только для сотрудников.
# login_url тот же, что в остальных разделах ИС (см. proschety, orders).
from django.contrib.auth.decorators import login_required
from django.utils import timezone
from .models import (
    WebOrder,
    WebOrderItem,
    SiteOrderStatus,
    WebOrderItemFile,
    WebOrderItemFileComment,
)
from .services import convert_web_order_to_order, get_site_status_payload

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

def _attach_pending_files(item, cart_token, file_ids):
    """
    Прикрепляет к позиции заявки файлы, загруженные клиентом ДО оформления.

    Аргументы:
        item       — только что созданная позиция WebOrderItem;
        cart_token — токен корзины из заявки (обязателен);
        file_ids   — список ID промежуточных файлов из позиции заявки.

    Возвращает количество прикреплённых файлов.

    ПОЧЕМУ ПРОВЕРЯЕМ cart_token:
        ID файлов приходят с сайта, но полагаться на них одним нельзя:
        подставив чужой ID, можно было бы «пришить» чужой макет к своей
        заявке. Поэтому берём только те промежуточные файлы, что относятся
        к этой же корзине.

    ПОЧЕМУ НЕ КОПИРУЕМ ФАЙЛ:
        запись WebOrderItemFile получает то же имя в хранилище
        (media/web_orders/pending/…). Физическое копирование 500 МБ
        съело бы диск и время; перенос записи в базе — мгновенный.
    """
    from .models import WebOrderPendingFile

    if not cart_token or not file_ids or not isinstance(file_ids, list):
        return 0

    # Приводим ID к числам, мусор пропускаем.
    ids = []
    for raw_id in file_ids:
        try:
            ids.append(int(raw_id))
        except (TypeError, ValueError):
            continue

    if not ids:
        return 0

    pending_files = WebOrderPendingFile.objects.filter(
        id__in=ids,
        cart_token=cart_token,
    )

    attached = 0

    for pending in pending_files:
        file_obj = WebOrderItemFile(
            item=item,
            link_url=pending.link_url,
            comment=pending.comment,
            kind=pending.kind,
            # Файл загрузил клиент — так и помечаем.
            author_kind=WebOrderItemFile.AUTHOR_CLIENT,
            is_client_visible=True,
            original_name=pending.original_name,
            size=pending.size,
            content_type=pending.content_type,
        )

        if pending.file:
            # Переносим ссылку на файл в хранилище, не копируя байты.
            file_obj.file.name = pending.file.name

        file_obj.save()
        pending.delete()
        attached += 1

        # Клиент загрузил макет — позиция ждёт проверки.
        item.mark_layout_checking()

    return attached

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



def _send_web_order_event(event_type, web_order, request):
    """
    Рассылает событие об изменении заявки во все открытые вкладки /web-orders/.

    ЗАЧЕМ: без этого менеджер видит новую заявку только после F5.
    Событие получает WebOrdersConsumer (web_orders/consumers.py) и
    пересылает всем подписанным вкладкам.

    event_type: 'created' | 'updated' | 'converted'

    ПРО actor_tab_id:
    Session_key в Django общий на все вкладки браузера, поэтому по нему
    нельзя отличить «своё действие в этой вкладке» от «своё действие
    в соседней». Клиент шлёт заголовок X-Tab-Id (его ставит tab_id.js —
    он подключается в orders/base.html, а наша страница её наследует).
    Мы пробрасываем его в событие, клиент сравнивает со своим tab_id
    и не показывает тост о собственном действии.

    ПОЧЕМУ ВСЁ ОБЁРНУТО В try/except:
    канальный слой живёт в Redis. Если он недоступен, приём заявки
    с сайта не должен падать из-за этого — заявка важнее уведомления.
    """
    channel_layer = get_channel_layer()

    # Канальный слой не настроен (например, тестовый запуск без Redis) —
    # молча выходим: заявка сохранится, просто вкладки не обновятся сами.
    if channel_layer is None:
        return

    try:
        async_to_sync(channel_layer.group_send)(
            # Имя группы — то же, что в WebOrdersConsumer.connect()
            'web_orders_list',
            {
                'type': 'web_order_event',   # метод-обработчик в консьюмере
                'event': event_type,
                'web_order_id': web_order.id,
                'number': web_order.moguta_order_number or '',
                'actor_tab_id': request.headers.get('X-Tab-Id', ''),
            },
        )
    except Exception:
        # Redis недоступен, соединение оборвалось и т.п. Не роняем
        # основной сценарий (создание/конвертацию заявки) из-за этого.
        pass

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

    # ========================================================================
    # ПРОВЕРКА СЕКРЕТА ОТПРАВИТЕЛЯ
    # ========================================================================
    # Заявку присылает только сайт bukva-a.ru, и только он должен уметь
    # её создавать. Без проверки любой мог отправить POST с корректным
    # JSON и создать заявку от имени клиента.
    #
    # Сравнение через hmac.compare_digest — постоянное время, без утечки
    # информации о правильных префиксах ключа.
    #
    # Если BUKVA_SENDER_TOKEN не задан в .env — проверка пропускается
    # (мягкий режим), чтобы можно было включить защиту постепенно.
    # ========================================================================
    expected_sender_token = getattr(settings, 'BUKVA_SENDER_TOKEN', '')

    if expected_sender_token:
        provided_sender_token = request.headers.get('X-Sender-Token', '')

        if not hmac.compare_digest(str(provided_sender_token), str(expected_sender_token)):
            return JsonResponse({
                'success': False,
                'error': 'Неверный или отсутствующий X-Sender-Token',
            }, status=403)

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
                # Название организации (юрлицо). Приходит с сайта из поля
                # yur_info[nameyur]; для физлица — пустая строка.
                # Понадобится при конвертации: LegalEntity.name.
                company_name=data.get('company_name') or '',
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

            # Токен корзины: по нему находим файлы, загруженные клиентом
            # до оформления заказа (см. api_site_upload_file).
            cart_token = (data.get('cart_token') or '').strip()

            for item_data in items:
                # Одна позиция = один товар из корзины Moguta.
                item = WebOrderItem.objects.create(
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

                # Файлы, загруженные клиентом заранее, привязываем к позиции.
                _attach_pending_files(
                    item,
                    cart_token,
                    item_data.get('file_ids'),
                )
            # --- Статусы для сайта ---
            # Создаём сразу при приёме, а не при конвертации: клиент видит
            # свой заказ в личном кабинете с первой секунды, и статусы
            # («В обработке», макет «Не загружен») должны существовать уже
            # тогда. Конвертация в заказ их только дополнит.
            #
            # Внутри той же транзакции: если что-то упадёт, не останется
            # заявки без записи статусов.
            SiteOrderStatus.objects.create(web_order=web_order)

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
    
    # --- Сообщаем открытым вкладкам /web-orders/ ---
    # Новая заявка с сайта должна появиться у менеджера без F5.
    # Если канальный слой недоступен — функция молча выйдет,
    # заявка к этому моменту уже сохранена.
    _send_web_order_event('created', web_order, request)

    # --- Успех ---
    return JsonResponse({
        'success': True,
        'web_order_id': web_order.id,
        'message': 'Заявка принята'
    }, status=201)


@login_required(login_url='/login/')
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

        # --- Статус, который видит клиент на сайте ---
        # Он НЕ хранится, а вычисляется из заявки и связанного заказа
        # (см. get_site_status_code в services.py). Считаем здесь, чтобы
        # менеджер в карточке видел ту же картину, что клиент в ЛК.
        #
        # Функция делает один запрос к SiteOrderStatus и один к Order
        # на заявку. Заявок в списке немного (это буфер, а не архив),
        # поэтому отдельная оптимизация не нужна.
        order.site_status_info = get_site_status_payload(order)

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
        # (counter/app_panels.html). Значение должно совпадать с условием
        # в шаблоне панели, иначе кнопка будет выглядеть как «Открыть»
        # вместо «На экране».
        'active_app': 'web_orders',
    }

    return render(request, 'web_orders/index.html', context)


@login_required(login_url='/login/')
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

    # Оповещаем другие вкладки: карточка должна переехать в «Отклонена»
    # и у них тоже. Свою вкладку они отсекут по actor_tab_id.
    _send_web_order_event('updated', web_order, request)

    # status_display — готовое человеческое название («Отклонена») из
    # STATUS_CHOICES. JS покажет его в уведомлении, не дублируя текст в коде.
    return JsonResponse({
        'success': True,
        'status': web_order.status,
        'status_display': web_order.get_status_display(),
    })


@login_required
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

    # Возврат — тоже изменение статуса, другие вкладки должны обновиться.
    _send_web_order_event('updated', web_order, request)

    return JsonResponse({
        'success': True,
        'status': web_order.status,
        'status_display': web_order.get_status_display(),
    })


@login_required
@require_POST
def api_convert_web_order(request, order_id):
    """
    Конвертация заявки в заказ — POST /web-orders/api/convert/<id>/.

    ЗАЧЕМ: это финальная точка интеграции. Заявка с сайта живёт в буфере
    до тех пор, пока менеджер не решит, что она настоящая. По этой кнопке
    создаётся полноценный orders.Order: клиент, изделия, товары, доставка.

    Вся работа с данными лежит в web_orders/services.py — здесь только
    нашли заявку, вызвали сервис и перевели результат в HTTP-ответ.

    ОТВЕТ (JSON):
        успех:  {"success": true, "order_id": 12, "order_number": "ORD-12"}
        ошибки: {"success": false, "error": "..."} + 404 / 409 / 500
    """
    # --- Ищем заявку ---
    try:
        web_order = WebOrder.objects.get(pk=order_id, is_deleted=False)
    except WebOrder.DoesNotExist:
        return JsonResponse({
            'success': False,
            'error': 'Заявка не найдена',
        }, status=404)

    # --- Конвертируем ---
    try:
        order = convert_web_order_to_order(
            web_order,
            # Автор заказа: текущий пользователь, если он авторизован.
            # is_authenticated — проверка нужна, потому что представление
            # доступно и анонимно (страница заявок пока без @login_required).
            created_by=request.user if request.user.is_authenticated else None,
        )
    except ValueError as e:
        # Ожидаемые отказы сервиса: заявка уже конвертирована, удалена
        # и т.п. Это не сбой системы, поэтому 409 Conflict и понятный текст.
        return JsonResponse({
            'success': False,
            'error': str(e),
        }, status=409)
    except Exception as e:
        # Непредвиденная ошибка (например, сбой БД). Транзакция в сервисе
        # уже откатилась — «полузаказа» не осталось. Наружу отдаём 500.
        return JsonResponse({
            'success': False,
            'error': 'Ошибка конвертации: %s' % str(e),
        }, status=500)

    # Оповещаем другие вкладки: заявка стала «Конвертированной»,
    # у них она тоже должна уехать в эту группу.
    _send_web_order_event('converted', web_order, request)

    return JsonResponse({
        'success': True,
        'order_id': order.id,
        # Номер заказа — для тоста: «Создан заказ ORD-12».
        'order_number': order.number,
    })



@csrf_exempt
def api_site_statuses(request):
    """
    Отдаёт сайту bukva-a.ru статусы заказов для личного кабинета.
    GET /web-orders/api/statuses/?ids=60,59,58

    ЗАЧЕМ: клиент в ЛК на сайте должен видеть актуальный статус
    производства, статус макета, оплату, ссылку на оплату и счёт.
    Источник истины — ИС, поэтому сайт спрашивает её, а не хранит копию.

    АВТОРИЗАЦИЯ — по образцу уже работающего API цен
    (calculator/views.py → api_get_webcalc_prices):
        1. заголовок X-Beauty-Secret сравнивается с BUKVA_API_SECRET
           через hmac.compare_digest (защита от timing-атак);
        2. если задан BUKVA_ALLOWED_IPS — проверяем IP клиента;
        3. CSRF отключён: запрос идёт с чужого домена (bukva-a.ru).

    ОТВЕТ:
        {"success": true, "statuses": {"60": {...}, "59": {...}}}
        Ключ — moguta_order_id, то есть ID заказа в базе Moguta.
    """
    # ===== Шаг 1. Проверка секретного ключа =====
    expected_secret = getattr(settings, 'BUKVA_API_SECRET', '')

    # Ключ не настроен — это ошибка конфигурации, а не клиента.
    if not expected_secret:
        return JsonResponse({
            'success': False,
            'error': 'server_not_configured',
            'message': 'Секретный ключ BUKVA_API_SECRET не задан в настройках',
        }, status=500)

    provided_secret = request.headers.get('X-Beauty-Secret', '')

    if not hmac.compare_digest(str(provided_secret), str(expected_secret)):
        return JsonResponse({
            'success': False,
            'error': 'unauthorized',
            'message': 'Неверный секретный ключ',
        }, status=401)

    # ===== Шаг 2. Проверка IP (если список задан) =====
    allowed_ips = getattr(settings, 'BUKVA_ALLOWED_IPS', [])
    if allowed_ips:
        xff = request.META.get('HTTP_X_FORWARDED_FOR', '')
        client_ip = xff.split(',')[0].strip() if xff else request.META.get('REMOTE_ADDR', '')

        if client_ip not in allowed_ips:
            return JsonResponse({
                'success': False,
                'error': 'forbidden',
                'message': 'IP %s не разрешён' % client_ip,
            }, status=403)

    # ===== Шаг 3. Разбор списка ID =====
    ids_raw = request.GET.get('ids', '')

    # Оставляем только числа: мусор в параметре не должен ронять запрос.
    ids = []
    for chunk in ids_raw.split(','):
        chunk = chunk.strip()
        if chunk.isdigit():
            ids.append(int(chunk))

    if not ids:
        return JsonResponse({
            'success': False,
            'error': 'bad_request',
            'message': 'Параметр ids обязателен, например ?ids=60,59',
        }, status=400)

    # Защита от гигантского запроса: в ЛК редко больше 20 заказов.
    if len(ids) > 100:
        return JsonResponse({
            'success': False,
            'error': 'too_many_ids',
            'message': 'Максимум 100 заказов за один запрос',
        }, status=400)

    # ===== Шаг 4. Собираем ответ =====
    # prefetch_related('items') не нужен для статусов, но пригодится,
    # если позже понадобится состав. Сейчас ограничились быстрым выбором.
    web_orders = WebOrder.objects.filter(
        moguta_order_id__in=ids,
        is_deleted=False,
    )

    statuses = {}
    for web_order in web_orders:
        # Ключ — именно moguta_order_id: сайт знает свой ID заказа,
        # а не наш внутренний.
        statuses[str(web_order.moguta_order_id)] = get_site_status_payload(web_order)

    return JsonResponse({
        'success': True,
        'statuses': statuses,
    })

# ============================================================================
# ЗАГРУЗКА ФАЙЛА МАКЕТА К ПОЗИЦИИ ЗАЯВКИ
# ============================================================================

@login_required(login_url='/login/')
@require_POST
def api_upload_item_file(request, item_id):
    """
    POST /web-orders/api/item/<id>/files/upload/

    Принимает multipart/form-data:
        file             — файл (необязательно, если есть link_url)
        link_url         — ссылка на макет (необязательно, если есть файл)
        comment          — комментарий автора
        kind             — тип: layout / proof / prepress / other
        is_client_visible — '1', если файл виден клиенту

    Возвращает JSON:
        {"success": true, "id": 12, "display_name": "...", "display_size": 12345,
         "url": "https://.../media/...", "kind": "layout",
         "kind_display": "Макет", "author_kind_display": "Менеджер",
         "comment": "...", "created_at": "18.11.2026 01:00"}

    ПОЧЕМУ ОТДЕЛЬНАЯ ПРОВЕРКА РАЗМЕРА:
    nginx режет запрос по client_max_body_size (по умолчанию 1 МБ),
    но настройка может быть увеличена неаккуратно. Своя проверка
    гарантирует, что в media не попадёт файл больше разрешённого,
    даже если nginx пропустит.
    """
    import os

    item = get_object_or_404(WebOrderItem, pk=item_id)

    # Позиция «Доставка» файлов иметь не может.
    # Проверяем по названию: отдельного флага «это доставка» в модели нет.
    if not item.code and item.name.strip().lower().startswith('доставка'):
        return JsonResponse({
            'success': False,
            'error': 'К позиции «Доставка» файл приложить нельзя',
        }, status=400)

    uploaded = request.FILES.get('file')
    link_url = (request.POST.get('link_url') or '').strip()
    comment = (request.POST.get('comment') or '').strip()
    kind = request.POST.get('kind') or WebOrderItemFile.KIND_LAYOUT
    is_client_visible = request.POST.get('is_client_visible') in ('1', 'on', 'true')

    # Хотя бы что-то одно должно быть: файл или ссылка.
    if not uploaded and not link_url:
        return JsonResponse({
            'success': False,
            'error': 'Приложите файл или укажите ссылку на макет',
        }, status=400)

    # Тип файла — только из списка.
    valid_kinds = [k for k, _ in WebOrderItemFile.KIND_CHOICES]
    if kind not in valid_kinds:
        kind = WebOrderItemFile.KIND_LAYOUT

    # Ограничение размера.
    max_size = getattr(settings, 'WEB_ORDER_MAX_FILE_SIZE', 512 * 1024 * 1024)
    if uploaded and uploaded.size > max_size:
        return JsonResponse({
            'success': False,
            'error': 'Файл больше %s МБ' % (max_size // (1024 * 1024)),
        }, status=413)

    # Ограничение по расширению.
    allowed_ext = getattr(settings, 'WEB_ORDER_ALLOWED_FILE_EXTENSIONS', [])
    if uploaded and allowed_ext:
        ext = os.path.splitext(uploaded.name)[1].lower()
        if ext not in allowed_ext:
            return JsonResponse({
                'success': False,
                'error': 'Недопустимый тип файла: %s' % ext,
            }, status=400)

    file_obj = WebOrderItemFile(
        item=item,
        link_url=link_url,
        comment=comment,
        kind=kind,
        author_kind=WebOrderItemFile.AUTHOR_MANAGER,
        author=request.user,
        is_client_visible=is_client_visible,
    )

    if uploaded:
        # Исходное имя и размер сохраняем ДО сохранения: после
        # сохранения Django уже переименует файл в uuid.
        file_obj.original_name = uploaded.name
        file_obj.size = uploaded.size
        file_obj.content_type = getattr(uploaded, 'content_type', '') or ''
        file_obj.file = uploaded

    # ========================================================================
    # ФАЙЛ, ЗАГРУЖЕННЫЙ ПОСЛЕ КОНВЕРТАЦИИ, ТОЖЕ ДОЛЖЕН ПОПАСТЬ В ЗАКАЗ
    # ========================================================================
    # Связь с изделием/товаром проставляется в момент конвертации заявки.
    # Если менеджер загружает файл уже после неё (например, клиент прислал
    # правку), связи у новой записи нет — и в карточке заказа файл
    # не появится, хотя в заявке будет.
    #
    # Решение: наследуем связь у других файлов этой же позиции. Если у
    # позиции уже есть файл, привязанный к изделию или товару, значит
    # заявка сконвертирована — и новый файл относится туда же.
    #
    # Явно исключаем пустые значения: иначе возьмём «первый попавшийся»
    # файл, у которого связи тоже нет, и ничего не изменится.
    sibling_file = (
        item.files.exclude(order_product__isnull=True).first()
        or item.files.exclude(order_tovar__isnull=True).first()
    )

    if sibling_file is not None:
        file_obj.order_product = sibling_file.order_product
        file_obj.order_tovar = sibling_file.order_tovar

    file_obj.save()

    return JsonResponse({
        'success': True,
        'id': file_obj.id,
        'display_name': file_obj.display_name,
        'display_size': file_obj.display_size,
        'url': file_obj.file.url if file_obj.file else '',
        # link_url и is_client_visible нужны, чтобы фронтенд мог сразу
        # нарисовать строку файла без перезагрузки страницы.
        'link_url': file_obj.link_url or '',
        'is_client_visible': file_obj.is_client_visible,
        'kind': file_obj.kind,
        'kind_display': file_obj.get_kind_display(),
        'author_kind_display': file_obj.get_author_kind_display(),
        'comment': file_obj.comment,
        'created_at': timezone.localtime(file_obj.created_at).strftime('%d.%m.%Y %H:%M'),
    }, status=201)

# ============================================================================
# КОММЕНТАРИЙ К ФАЙЛУ МАКЕТА (менеджер → клиент и обратно)
# ============================================================================

@login_required(login_url='/login/')
@require_POST
def api_add_file_comment(request, file_id):
    """
    POST /web-orders/api/file/<id>/comments/add/

    Принимает:
        text              — текст комментария (обязательный)
        is_client_visible — '1', если комментарий виден клиенту

    Возвращает JSON:
        {"success": true, "id": 5, "text": "...", "author_kind": "manager",
         "author_kind_display": "Менеджер", "is_client_visible": true,
         "created_at": "18.11.2026 01:20"}

    ЗАЧЕМ ОТДЕЛЬНЫЙ ЭНДПОИНТ:
    комментарии нужны и менеджеру (уточнить правку), и клиенту (ответить).
    Один endpoint на оба случая: разница только в author_kind, который
    определяется по факту авторизации, а не приходит из формы — иначе
    клиент мог бы выдать себя за менеджера.
    """
    file_obj = get_object_or_404(WebOrderItemFile, pk=file_id)

    text = (request.POST.get('text') or '').strip()
    is_client_visible = request.POST.get('is_client_visible') in ('1', 'on', 'true')

    if not text:
        return JsonResponse({
            'success': False,
            'error': 'Комментарий не может быть пустым',
        }, status=400)

    if len(text) > 5000:
        return JsonResponse({
            'success': False,
            'error': 'Комментарий не должен превышать 5000 символов',
        }, status=400)

    comment = WebOrderItemFileComment.objects.create(
        file=file_obj,
        text=text,
        # author_kind не берём из запроса: сюда приходит только менеджер
        # (endpoint закрыт @login_required). Клиентские комментарии будут
        # приходить через отдельный публичный endpoint с сайта.
        author_kind=WebOrderItemFileComment.AUTHOR_MANAGER,
        author=request.user,
        is_client_visible=is_client_visible,
    )

    return JsonResponse({
        'success': True,
        'id': comment.id,
        'text': comment.text,
        'author_kind': comment.author_kind,
        'author_kind_display': comment.get_author_kind_display(),
        'is_client_visible': comment.is_client_visible,
        'created_at': timezone.localtime(comment.created_at).strftime('%d.%m.%Y %H:%M'),
    }, status=201)

# ============================================================================
# СКАЧИВАНИЕ ФАЙЛА МАКЕТА
# ============================================================================

def api_download_item_file(request, file_id):

    # Доступ двумя способами:
    #   1) сотрудник ИС — по логину (как раньше);
    #   2) клиент с сайта — по подписанной ссылке ?token=… (живёт 1 час).
    # Токен даёт доступ только к этому конкретному файлу.
    from .upload_tokens import parse_download_token

    token = request.GET.get('token', '')

    if token:
        payload = parse_download_token(token)
        if payload is None or int(payload.get('fid', 0)) != int(file_id):
            return JsonResponse({
                'success': False,
                'error': 'Ссылка недействительна или устарела',
            }, status=403)
    else:
        if not request.user.is_authenticated:
            from django.contrib.auth.views import redirect_to_login
            return redirect_to_login(request.get_full_path(), '/login/')

    file_obj = get_object_or_404(WebOrderItemFile, pk=file_id)
    """
    GET /web-orders/files/<id>/download/

    Отдаёт файл макета с ИСХОДНЫМ именем в заголовке Content-Disposition.

    ЗАЧЕМ ОТДЕЛЬНЫЙ ENDPOINT, А НЕ ССЫЛКА НА /media/:
      1. На диске файлы лежат под uuid — иначе два «макет.pdf» затрут
         друг друга, а имя от пользователя нельзя пускать в путь.
      2. Прямая ссылка на /media/ доступна любому, кто её узнал.
         Здесь доступ только у авторизованного сотрудника.
      3. Браузер сохраняет файл под человеческим именем
         («Реквизиты счёта ИП … .pdf»), а не «d3dedfc6….pdf».

    FileResponse отдаёт файл потоком: макет на 500 МБ не будет
    целиком прочитан в память процесса.
    """
    file_obj = get_object_or_404(WebOrderItemFile, pk=file_id)

    if not file_obj.file:
        return JsonResponse({
            'success': False,
            'error': 'У этой записи нет файла — только ссылка',
        }, status=400)

    try:
        file_obj.file.open('rb')
    except (FileNotFoundError, OSError):
        return JsonResponse({
            'success': False,
            'error': 'Файл не найден на диске',
        }, status=404)

    # filename=... Django сам закодирует кириллицу через filename*
    # (RFC 5987), поэтому русские имена сохраняются корректно.
    return FileResponse(
        file_obj.file,
        as_attachment=True,
        filename=file_obj.display_name or 'lаyout',
    )

# ============================================================================
# УДАЛЕНИЕ ФАЙЛА МАКЕТА
# ============================================================================

@login_required(login_url='/login/')
@require_POST
def api_delete_item_file(request, file_id):
    """
    POST /web-orders/files/<id>/delete/

    Удаляет запись файла и сам файл с диска.

    ЗАЧЕМ: менеджер может загрузить не тот файл, дубликат или файл,
    который клиент просил не хранить. Без удаления такие записи
    остаются в карточке навсегда.

    ВАЖНО: удаляем и физический файл — иначе диск будет забиваться
    «осиротевшими» макетами, на которые уже никто не ссылается.
    Ошибку удаления с диска не считаем фатальной: запись из базы
    всё равно должна исчезнуть.
    """
    file_obj = get_object_or_404(WebOrderItemFile, pk=file_id)

    # Сначала стираем файл из хранилища, потом саму запись.
    if file_obj.file:
        try:
            file_obj.file.delete(save=False)
        except (OSError, ValueError):
            # Файла на диске уже нет — не мешаем удалению записи.
            pass

    file_obj.delete()

    return JsonResponse({
        'success': True,
        'id': file_id,
    })

# ============================================================================
# ТОКЕН ДЛЯ ПРЯМОЙ ЗАГРУЗКИ ФАЙЛОВ КЛИЕНТОМ
# ============================================================================

@csrf_exempt
@require_POST
def api_site_upload_token(request):
    """
    POST /web-orders/api/site/upload-token/

    Вызывается САЙТОМ (серверная часть, не браузером) с заголовком
    X-Sender-Token. Возвращает подписанный токен, который сайт передаст
    браузеру для прямой загрузки файлов в ИС.

    Тело JSON:
        {"cart_token": "a3f9…"}

    Ответ:
        {"success": true, "token": "…", "expires_at": 1763500000, "ttl_hours": 24}
    """
    # Сайт аутентифицируется тем же ключом, что и при отправке заявок.
    expected_sender_token = getattr(settings, 'BUKVA_SENDER_TOKEN', '')

    if not expected_sender_token:
        return JsonResponse({
            'success': False,
            'error': 'BUKVA_SENDER_TOKEN не настроен на сервере ИС',
        }, status=500)

    provided = request.headers.get('X-Sender-Token', '')
    if not hmac.compare_digest(str(provided), str(expected_sender_token)):
        return JsonResponse({
            'success': False,
            'error': 'Неверный или отсутствующий X-Sender-Token',
        }, status=403)

    try:
        data = json.loads(request.body.decode('utf-8'))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return JsonResponse({
            'success': False,
            'error': 'Некорректный JSON в теле запроса',
        }, status=400)

    cart_token = (data.get('cart_token') or '').strip()
    if not cart_token:
        return JsonResponse({
            'success': False,
            'error': 'Не указан cart_token',
        }, status=400)

    from .upload_tokens import make_upload_token

    try:
        token, expires_at = make_upload_token(cart_token)
    except ValueError as e:
        return JsonResponse({
            'success': False,
            'error': str(e),
        }, status=500)

    return JsonResponse({
        'success': True,
        'token': token,
        'expires_at': expires_at,
        'ttl_hours': getattr(settings, 'WEB_ORDER_UPLOAD_TOKEN_TTL_HOURS', 24),
    })

# ============================================================================
# ЗАГРУЗКА ФАЙЛА КЛИЕНТОМ (напрямую из браузера, до оформления заказа)
# ============================================================================

# ============================================================================
# CORS ДЛЯ ЗАГРУЗКИ С САЙТА
# ============================================================================
# Браузер грузит файл с bukva-a.ru на beauty-print.ru — это кросс-доменный
# запрос. Заголовок X-Upload-Token делает его «непростым», поэтому браузер
# сначала шлёт предварительный OPTIONS и требует явного разрешения.
# Без этих заголовков Chrome блокирует запрос с ошибкой CORS.

BEAUTY_UPLOAD_ALLOWED_ORIGIN = 'https://bukva-a.ru'


def _beauty_cors(response):
    """Проставляет CORS-заголовки для эндпоинта загрузки файлов."""
    response['Access-Control-Allow-Origin'] = BEAUTY_UPLOAD_ALLOWED_ORIGIN
    response['Access-Control-Allow-Headers'] = 'X-Upload-Token, Content-Type'
    response['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
    response['Access-Control-Max-Age'] = '86400'
    response['Vary'] = 'Origin'
    return response


@csrf_exempt
@require_POST
def _api_site_upload_file_impl(request):
    """
    POST /web-orders/api/site/upload/

    Публичный эндпоинт для браузера клиента. CSRF отключён, потому что
    запрос идёт с чужого домена (bukva-a.ru). Защита — подписанный токен
    в заголовке X-Upload-Token (его выдаёт api_site_upload_token).

    Принимает multipart/form-data:
        file      — файл (либо link_url)
        link_url  — ссылка на макет
        line_uid  — ключ строки корзины (Models_Cart::addToCart)
        comment   — комментарий клиента
        kind      — тип файла (по умолчанию layout)

    Возвращает JSON с данными созданной промежуточной записи.

    ВАЖНО: здесь НЕ создаётся ни заявка, ни позиция — файл ждёт в
    WebOrderPendingFile и привяжется к позиции, когда сайт пришлёт заявку.
    """
    import os

    from .models import WebOrderPendingFile
    from .upload_tokens import parse_upload_token

    # --- Проверка токена ---
    payload = parse_upload_token(request.headers.get('X-Upload-Token', ''))

    if payload is None:
        return JsonResponse({
            'success': False,
            'error': 'Недействительный или просроченный токен загрузки',
        }, status=403)

    cart_token = payload['cart_token']

    uploaded = request.FILES.get('file')
    link_url = (request.POST.get('link_url') or '').strip()
    line_uid = (request.POST.get('line_uid') or '').strip()[:64]
    comment = (request.POST.get('comment') or '').strip()
    kind = request.POST.get('kind') or WebOrderItemFile.KIND_LAYOUT

    if not uploaded and not link_url:
        return JsonResponse({
            'success': False,
            'error': 'Приложите файл или укажите ссылку на макет',
        }, status=400)

    valid_kinds = [k for k, _ in WebOrderItemFile.KIND_CHOICES]
    if kind not in valid_kinds:
        kind = WebOrderItemFile.KIND_LAYOUT

    # Ограничение размера — то же, что у менеджера.
    max_size = getattr(settings, 'WEB_ORDER_MAX_FILE_SIZE', 512 * 1024 * 1024)
    if uploaded and uploaded.size > max_size:
        return JsonResponse({
            'success': False,
            'error': 'Файл больше %s МБ' % (max_size // (1024 * 1024)),
        }, status=413)

    # Ограничение по расширению.
    allowed_ext = getattr(settings, 'WEB_ORDER_ALLOWED_FILE_EXTENSIONS', [])
    if uploaded and allowed_ext:
        ext = os.path.splitext(uploaded.name)[1].lower()
        if ext not in allowed_ext:
            return JsonResponse({
                'success': False,
                'error': 'Недопустимый тип файла: %s' % ext,
            }, status=400)

    pending = WebOrderPendingFile(
        cart_token=cart_token,
        line_uid=line_uid,
        link_url=link_url,
        comment=comment,
        kind=kind,
    )

    if uploaded:
        # Исходное имя и размер — ДО сохранения: дальше Django
        # переименует файл в uuid.
        pending.original_name = uploaded.name
        pending.size = uploaded.size
        pending.content_type = getattr(uploaded, 'content_type', '') or ''
        pending.file = uploaded

    pending.save()

    return JsonResponse({
        'success': True,
        'id': pending.id,
        'display_name': pending.display_name,
        'display_size': pending.display_size,
        'kind': pending.kind,
        'kind_display': pending.get_kind_display(),
        'comment': pending.comment,
        'line_uid': pending.line_uid,
    }, status=201)

@csrf_exempt
def api_site_upload_file(request):
    """
    Публичная обёртка: обрабатывает предварительный OPTIONS-запрос
    (CORS preflight) и проставляет заголовки разрешения на все ответы.
    """
    if request.method == 'OPTIONS':
        return _beauty_cors(HttpResponse(status=204))

    if request.method != 'POST':
        return _beauty_cors(JsonResponse({
            'success': False,
            'error': 'Метод не поддерживается',
        }, status=405))

    return _beauty_cors(_api_site_upload_file_impl(request))

# ============================================================================
# ФАЙЛЫ МАКЕТОВ ДЛЯ ЛИЧНОГО КАБИНЕТА КЛИЕНТА
# ============================================================================

@csrf_exempt
def api_client_files(request):
    """
    POST /web-orders/api/client/files/

    Отдаёт сайту bukva-a.ru макеты и переписку по ним для ЛК клиента.

    ЗАПРОС (JSON):
        {"order_numbers": ["M-01074", "M-01073"]}

    ОТВЕТ (JSON):
        {
          "success": true,
          "orders": {
            "M-01074": {
              "items": [
                {"item_id": 5, "name": "Визитки…", "files": [
                   {"id": 12, "name": "макет.pdf", "size": 191234,
                    "created_at": "18.11.2026 23:42",
                    "kind": "Макет",
                    "comments": [
                       {"author": "Менеджер", "author_kind": "manager",
                        "text": "Утвердили", "created_at": "19.11.2026 10:15"}
                    ]}
                ]}
              ]
            }
          }
        }

    АВТОРИЗАЦИЯ — как у api_site_statuses: заголовок X-Beauty-Secret
    сравнивается с BUKVA_API_SECRET (hmac.compare_digest), при заданном
    BUKVA_ALLOWED_IPS дополнительно проверяется IP.

    ВАЖНО ПРО ПРИВАТНОСТЬ:
        Отдаём ТОЛЬКО записи с is_client_visible=True — и файлы, и
        комментарии. Внутренние заметки менеджера клиент видеть не должен
        ни при каких условиях, поэтому фильтр стоит в самом запросе к БД,
        а не в шаблоне.
    """
    # ===== Проверка секретного ключа =====
    expected_secret = getattr(settings, 'BUKVA_API_SECRET', '')

    if not expected_secret:
        return JsonResponse({
            'success': False,
            'error': 'server_not_configured',
            'message': 'Секретный ключ BUKVA_API_SECRET не задан в настройках',
        }, status=500)

    provided_secret = request.headers.get('X-Beauty-Secret', '')

    if not hmac.compare_digest(str(provided_secret), str(expected_secret)):
        return JsonResponse({
            'success': False,
            'error': 'unauthorized',
            'message': 'Неверный секретный ключ',
        }, status=401)

    # ===== Проверка IP (если список задан) =====
    allowed_ips = getattr(settings, 'BUKVA_ALLOWED_IPS', [])
    if allowed_ips:
        xff = request.META.get('HTTP_X_FORWARDED_FOR', '')
        client_ip = xff.split(',')[0].strip() if xff else request.META.get('REMOTE_ADDR', '')
        if client_ip not in allowed_ips:
            return JsonResponse({
                'success': False,
                'error': 'ip_not_allowed',
                'message': 'IP не разрешён',
            }, status=403)

    # ===== Разбор запроса =====
    try:
        data = json.loads(request.body.decode('utf-8'))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return JsonResponse({
            'success': False,
            'error': 'bad_request',
            'message': 'Некорректный JSON',
        }, status=400)

    order_numbers = data.get('order_numbers') or []
    if not isinstance(order_numbers, list):
        order_numbers = []

    # Ограничение размера пачки: ЛК запрашивает максимум 50 заказов.
    order_numbers = [str(n).strip() for n in order_numbers[:50] if str(n).strip()]

    if not order_numbers:
        return JsonResponse({'success': True, 'orders': {}})

    orders = WebOrder.objects.filter(
        moguta_order_number__in=order_numbers,
        is_deleted=False,
    )

    result = {}

    for order in orders:
        items_data = []

        for item in order.items.all().order_by('id'):
            # Только файлы, видимые клиенту.
            files = item.files.filter(is_client_visible=True).order_by('created_at')

            # Позиции БЕЗ файлов тоже нужны клиенту: именно к ним он
            # прикладывает первый макет из ЛК. Поэтому continue убран —
            # ниже позиция попадёт в ответ с пустым списком files.

            files_data = []

            for file_obj in files:
                # Только комментарии, видимые клиенту.
                comments = file_obj.comments.filter(is_client_visible=True).order_by('created_at')

                # Подписанная ссылка на скачивание: клик ведёт прямо в ИС,
                # токен живёт 1 час и действует только на этот файл.
                from .upload_tokens import make_download_token

                # Абсолютный адрес собираем от публичной константы, а не
                # от request.build_absolute_uri(): за nginx Django считает
                # схему http, и клиент на https-странице получал ссылку
                # http://, которую браузер блокирует (mixed content).
                download_path = '%s/web-orders/files/%d/download/?token=%s' % (
                    getattr(settings, 'WEB_ORDER_PUBLIC_BASE_URL', 'https://beauty-print.ru'),
                    file_obj.id,
                    make_download_token(file_obj.id),
                )

                files_data.append({
                    'id': file_obj.id,
                    'name': file_obj.display_name,
                    'size': file_obj.display_size,
                    # Комментарий, оставленный при загрузке файла
                    # (клиент или менеджер). Переписка — отдельно в comments.
                    'comment': file_obj.comment,
                    'download_url': download_path,
                    'kind': file_obj.get_kind_display(),
                    'created_at': timezone.localtime(file_obj.created_at).strftime('%d.%m.%Y %H:%M'),
                    'comments': [
                        {
                            'author': c.get_author_kind_display(),
                            'author_kind': c.author_kind,
                            'text': c.text,
                            'created_at': timezone.localtime(c.created_at).strftime('%d.%m.%Y %H:%M'),
                        }
                        for c in comments
                    ],
                })

            # Токен на загрузку правки именно к этой позиции.
            # Отдаём сразу вместе с файлами: иначе ЛК пришлось бы делать
            # отдельный HTTP-запрос на каждую позицию каждого заказа.
            # Живёт 1 час — клиент успевает открыть ЛК и приложить файл.
            from .upload_tokens import make_order_upload_token

            try:
                item_upload_token, item_upload_expires = make_order_upload_token(
                    order.moguta_order_number,
                    item.id,
                )
            except ValueError:
                item_upload_token = ''
                item_upload_expires = 0

            items_data.append({
                'item_id': item.id,
                'name': item.name or 'Позиция',
                'upload_token': item_upload_token,
                'upload_expires_at': item_upload_expires,
                'files': files_data,
            })

        result[order.moguta_order_number] = {'items': items_data}

    return JsonResponse({
        'success': True,
        'orders': result,
    })    

# ============================================================================
# ТОКЕН НА ЗАГРУЗКУ ПРАВКИ К ЗАКАЗУ (для ЛК клиента)
# ============================================================================

@csrf_exempt
def api_site_order_upload_token(request):
    """
    POST /web-orders/api/site/order-upload-token/

    Вызывается сайтом (серверная часть) с заголовком X-Beauty-Secret.

    Тело JSON:
        {"order_number": "M-01074", "item_id": 23}

    Ответ:
        {"success": true, "token": "…", "expires_at": 1234567890}

    ПРОВЕРКИ:
        1. секрет сайта;
        2. заказ с таким номером существует;
        3. позиция принадлежит именно этому заказу — иначе, зная чужой
           item_id, можно было бы приложить файл в чужой заказ.
    """
    if request.method != 'POST':
        return JsonResponse({
            'success': False,
            'error': 'Метод не поддерживается',
        }, status=405)

    # ===== Проверка секрета =====
    expected_secret = getattr(settings, 'BUKVA_API_SECRET', '')

    if not expected_secret:
        return JsonResponse({
            'success': False,
            'error': 'server_not_configured',
        }, status=500)

    provided_secret = request.headers.get('X-Beauty-Secret', '')

    if not hmac.compare_digest(str(provided_secret), str(expected_secret)):
        return JsonResponse({
            'success': False,
            'error': 'unauthorized',
        }, status=401)

    # ===== Разбор запроса =====
    try:
        data = json.loads(request.body.decode('utf-8'))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return JsonResponse({
            'success': False,
            'error': 'Некорректный JSON',
        }, status=400)

    order_number = str(data.get('order_number') or '').strip()

    try:
        item_id = int(data.get('item_id') or 0)
    except (TypeError, ValueError):
        item_id = 0

    if not order_number or item_id <= 0:
        return JsonResponse({
            'success': False,
            'error': 'Нужны order_number и item_id',
        }, status=400)

    # ===== Проверка, что позиция принадлежит заказу =====
    order = WebOrder.objects.filter(
        moguta_order_number=order_number,
        is_deleted=False,
    ).first()

    if order is None:
        return JsonResponse({
            'success': False,
            'error': 'Заказ не найден',
        }, status=404)

    item = order.items.filter(pk=item_id).first()

    if item is None:
        return JsonResponse({
            'success': False,
            'error': 'Позиция не принадлежит этому заказу',
        }, status=403)

    from .upload_tokens import make_order_upload_token

    try:
        token, expires_at = make_order_upload_token(order_number, item.id)
    except ValueError as e:
        return JsonResponse({
            'success': False,
            'error': str(e),
        }, status=500)

    return JsonResponse({
        'success': True,
        'token': token,
        'expires_at': expires_at,
    })

# ============================================================================
# ЗАГРУЗКА ПРАВКИ МАКЕТА К ЗАКАЗУ (из ЛК клиента)
# ============================================================================

@csrf_exempt
def _api_site_order_upload_impl(request):
    """
    POST /web-orders/api/site/order-upload/

    Браузер клиента шлёт файл напрямую в ИС с заголовком X-Upload-Token
    (токен выдаёт api_site_order_upload_token для конкретной позиции).

    Поля формы:
        file    — файл (либо link_url)
        comment — комментарий клиента

    Создаёт обычный WebOrderItemFile с author_kind=client и
    is_client_visible=True: менеджер видит правку в заявке, клиент —
    в ЛК, при конвертации файл уедет в изделие вместе с остальными.
    """
    import os

    from .upload_tokens import parse_order_upload_token

    payload = parse_order_upload_token(request.headers.get('X-Upload-Token', ''))

    if payload is None:
        return JsonResponse({
            'success': False,
            'error': 'Ссылка на загрузку недействительна или устарела',
        }, status=403)

    # ===== Проверяем заказ и позицию из токена =====
    order = WebOrder.objects.filter(
        moguta_order_number=payload['on'],
        is_deleted=False,
    ).first()

    if order is None:
        return JsonResponse({
            'success': False,
            'error': 'Заказ не найден',
        }, status=404)

    item = order.items.filter(pk=int(payload['iid'])).first()

    if item is None:
        return JsonResponse({
            'success': False,
            'error': 'Позиция не найдена',
        }, status=404)

    uploaded = request.FILES.get('file')
    link_url = (request.POST.get('link_url') or '').strip()
    comment = (request.POST.get('comment') or '').strip()

    if not uploaded and not link_url:
        return JsonResponse({
            'success': False,
            'error': 'Приложите файл или укажите ссылку',
        }, status=400)

    max_size = getattr(settings, 'WEB_ORDER_MAX_FILE_SIZE', 512 * 1024 * 1024)
    if uploaded and uploaded.size > max_size:
        return JsonResponse({
            'success': False,
            'error': 'Файл больше %s МБ' % (max_size // (1024 * 1024)),
        }, status=413)

    allowed_ext = getattr(settings, 'WEB_ORDER_ALLOWED_FILE_EXTENSIONS', [])
    if uploaded and allowed_ext:
        ext = os.path.splitext(uploaded.name)[1].lower()
        if ext not in allowed_ext:
            return JsonResponse({
                'success': False,
                'error': 'Недопустимый тип файла: %s' % ext,
            }, status=400)

    file_obj = WebOrderItemFile(
        item=item,
        kind=WebOrderItemFile.KIND_LAYOUT,
        author_kind=WebOrderItemFile.AUTHOR_CLIENT,
        is_client_visible=True,
        comment=comment,
        link_url=link_url,
    )

    if uploaded:
        file_obj.original_name = uploaded.name
        file_obj.size = uploaded.size
        file_obj.content_type = getattr(uploaded, 'content_type', '') or ''
        file_obj.file = uploaded

    # Если заявка уже сконвертирована — привязываем к тому же
    # изделию/товару, что и остальные файлы позиции, иначе правка
    # не появится в карточке заказа.
    sibling_file = (
        item.files.exclude(order_product__isnull=True).first()
        or item.files.exclude(order_tovar__isnull=True).first()
    )

    if sibling_file is not None:
        file_obj.order_product = sibling_file.order_product
        file_obj.order_tovar = sibling_file.order_tovar

    file_obj.save()

    # Правка от клиента — снова «на проверке», даже если макет был
    # утверждён: файл изменился, проверять заново.
    item.mark_layout_checking()

    from .upload_tokens import make_download_token

    download_path = '%s/web-orders/files/%d/download/?token=%s' % (
        getattr(settings, 'WEB_ORDER_PUBLIC_BASE_URL', 'https://beauty-print.ru'),
        file_obj.id,
        make_download_token(file_obj.id),
    )

    return JsonResponse({
        'success': True,
        'id': file_obj.id,
        'name': file_obj.display_name,
        'size': file_obj.display_size,
        'comment': file_obj.comment,
        'download_url': download_path,
    }, status=201)


@csrf_exempt
def api_site_order_upload(request):
    """
    Публичная обёртка: CORS-preflight и заголовки разрешения.
    """
    if request.method == 'OPTIONS':
        return _beauty_cors(HttpResponse(status=204))

    if request.method != 'POST':
        return _beauty_cors(JsonResponse({
            'success': False,
            'error': 'Метод не поддерживается',
        }, status=405))

    return _beauty_cors(_api_site_order_upload_impl(request))

# ============================================================================
# СМЕНА СТАТУСА МАКЕТА У ПОЗИЦИИ (менеджер)
# ============================================================================

@login_required(login_url='/login/')
@require_POST
def api_set_item_layout_status(request, item_id):
    """
    POST /web-orders/api/item/<id>/layout-status/

    Принимает:
        status — код статуса (not_loaded / checking / checked / errors)

    Возвращает:
        {"success": true, "status": "checked", "status_label": "Проверен"}

    КОГДА МЕНЕДЖЕР ЗДЕСЬ НИЧЕГО НЕ МЕНЯЕТ:
        автопереключение в «на проверке» делает сама загрузка файла
        клиентом (см. WebOrderItem.mark_layout_checking). Здесь — ручное
        решение: утвердить макет или вернуть на правку.
    """
    item = get_object_or_404(WebOrderItem, pk=item_id)

    # Позиция доставки макетов не имеет.
    if not item.code and (item.name or '').lower().startswith('доставка'):
        return JsonResponse({
            'success': False,
            'error': 'У позиции доставки нет макета',
        }, status=400)

    status = (request.POST.get('status') or '').strip()

    valid_codes = [code for code, _ in WebOrderItem.LAYOUT_STATUS_CHOICES]

    if status not in valid_codes:
        return JsonResponse({
            'success': False,
            'error': 'Недопустимый статус макета',
        }, status=400)

    item.layout_status = status
    item.save(update_fields=['layout_status'])

    return JsonResponse({
        'success': True,
        'status': item.layout_status,
        'status_label': item.get_layout_status_display(),
    })