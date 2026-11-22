"""
Сервисный слой приложения web_orders (Входящие заявки с сайта).

ЗАЧЕМ ОТДЕЛЬНЫЙ ФАЙЛ:
логика «превратить заявку в заказ» — это не одна строка в представлении.
Она ищет или создаёт клиента, юрлицо и контактное лицо, раскладывает
позиции на изделия и товары, переносит доставку. Держать это во views.py
значит получить функцию на 300 строк, которую невозможно ни прочитать,
ни протестировать. В проекте уже принят такой подход: orders/services.py,
calculator/services_webcalc.py.

ВАЖНО ПРО ЯДРО:
этот модуль НИЧЕГО не меняет в calculator/ и не трогает математику цен.
Он только читает данные и вызывает существующие сервисные функции
приложения orders (add_product_to_order).
"""
import re

from decimal import Decimal

from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from baza_klientov.models import Client, ContactPerson, LegalEntity
from orders.models import Order, OrderTovar
from orders.services import add_product_to_order
from calculator.models_list_proschet import Proschet

from .models import WebOrder, WebOrderItem, SiteOrderStatus
from django.conf import settings

def _normalize_phone(phone):
    """
    Оставляет от телефона только цифры и приводит к формату 7XXXXXXXXXX.

    ЗАЧЕМ: телефон приходит с сайта в свободном виде — "+7 (213) 456 78-90",
    "8-213-456-78-90", "72134567890". Сравнивать такие строки напрямую
    бессмысленно, поэтому приводим к цифрам и убираем разницу между
    «8» и «7» в начале номера.

    Что делаем:
        1. выбрасываем всё, кроме цифр;
        2. если цифр 11 и номер начинается с 8 — заменяем первую на 7.

    Возвращает строку цифр (может быть пустой, если телефона нет).
    """
    digits = re.sub(r'\D', '', phone or '')

    # 8XXXXXXXXXX → 7XXXXXXXXXX (привычная запись в России)
    if len(digits) == 11 and digits.startswith('8'):
        digits = '7' + digits[1:]

    return digits


def resolve_client_for_web_order(web_order):
    """
    Находит клиента ИС по данным заявки или создаёт нового.

    ПОРЯДОК ПОИСКА (от самого надёжного признака к самому слабому):
        1. по e-mail среди контактных лиц (email уникален для человека);
        2. по последним 10 цифрам телефона (мобильный и обычный);
        3. если не нашли — создаём нового клиента.

    ПОЧЕМУ e-mail, а не имя: у Client нет поля e-mail вообще — почта
    хранится в ContactPerson. Именно поэтому поиск идёт по контактным
    лицам, а клиент берётся из найденной связи contact.client.

    ЧТО СОЗДАЁМ ДЛЯ НОВОГО КЛИЕНТА:
        Client          — name = название компании (юрлицо) или ФИО;
        ContactPerson   — ФИО, телефон, e-mail, признак «основное»;
        LegalEntity     — только для юрлица: name + реквизиты из заявки.

    Возвращает кортеж:
        (client, contact_person, legal_entity, client_was_created)

    legal_entity может быть None — для физлица.
    client_was_created — True, если клиента создали именно сейчас
    (пригодится, чтобы написать это в комментарий заказа/заявки).
    """
    # --- Готовим исходные данные ---
    email = (web_order.email or '').strip()
    phone_digits = _normalize_phone(web_order.phone)
    fio = (web_order.fio or '').strip()
    company = (web_order.company_name or '').strip()
    is_yur = (web_order.customer_type == WebOrder.CUSTOMER_YUR)

    contact = None

    # --- Шаг 1. Ищем контактное лицо по e-mail ---
    # is_deleted=False — в проекте мягкое удаление, удалённые не учитываем.
    # order_by('id') — чтобы результат был предсказуемым, если почту
    # когда-то продублировали у двух контактов.
    if email:
        contact = (
            ContactPerson.objects
            .filter(is_deleted=False, email__iexact=email)
            .select_related('client')
            .order_by('id')
            .first()
        )

    # --- Шаг 2. Если по почте не нашли — ищем по телефону ---
    # Сравниваем последние 10 цифр: этого достаточно, чтобы отличить
    # номера, и при этом не зависит от формата записи.
    # Q(...) | Q(...) — проверяем и обычный телефон, и мобильный.
    if contact is None and len(phone_digits) >= 10:
        phone_tail = phone_digits[-10:]
        contact = (
            ContactPerson.objects
            .filter(is_deleted=False)
            .filter(Q(phone__contains=phone_tail) | Q(mobile__contains=phone_tail))
            .select_related('client')
            .order_by('id')
            .first()
        )

    # --- Шаг 3. Если контакт найден и его клиент жив — используем его ---
    # Проверяем contact.client: контакт мог остаться, а клиент — быть
    # помечен удалённым. В таком случае считаем, что клиента нет.
    if contact is not None and contact.client_id and not contact.client.is_deleted:
        client = contact.client

        # Для юрлица подтягиваем существующее юрлицо клиента, чтобы не
        # создавать второе. Приоритет — «основное» (is_primary=True).
        legal_entity = None
        if is_yur:
            legal_entity = (
                LegalEntity.objects
                .filter(client=client, is_deleted=False)
                .order_by('-is_primary', 'id')
                .first()
            )

        return client, contact, legal_entity, False

    # --- Шаг 4. Клиента нет — создаём ---
    # Имя клиента: для юрлица — название компании (если клиент его ввёл),
    # иначе ФИО. Фолбэки (email, «Клиент с сайта») нужны на случай, когда
    # и ФИО пустое — поле name в Client обязательное, пустым его не создать.
    client_name = company if (is_yur and company) else (fio or email or 'Клиент с сайта')

    client = Client.objects.create(
        name=client_name,
        # Комментарий — след, откуда клиент взялся. Менеджер сразу увидит,
        # что карточку создала интеграция, а не человек.
        comment='Создан автоматически из заявки с сайта %s' % (
            web_order.moguta_order_number or ('#' + str(web_order.moguta_order_id))
        ),
    )

    # Контактное лицо — то, откуда мы вообще узнали про клиента.
    contact = ContactPerson.objects.create(
        client=client,
        full_name=fio or client_name,
        phone=web_order.phone or '',
        email=email,
        # Это первое контактное лицо клиента, значит основное.
        is_primary=True,
    )

    # Юрлицо — только если заявка от организации.
    legal_entity = None
    if is_yur:
        legal_entity = LegalEntity.objects.create(
            client=client,
            # Название компании; если клиент его не ввёл —
            # подставляем ФИО, чтобы поле не осталось пустым.
            name=company or fio or client_name,
            requisites=web_order.requisites or '',
            is_primary=True,
        )

    return client, contact, legal_entity, True



@transaction.atomic
def convert_web_order_to_order(web_order, created_by=None):
    """
    Превращает входящую заявку в заказ (orders.Order).

    Аргументы:
        web_order  — экземпляр WebOrder, которую конвертируем;
        created_by — пользователь ИС, выполнивший конвертацию
                     (попадёт в Order.created_by).

    Возвращает:
        Order — созданный заказ.

    Бросает ValueError, если конвертировать нельзя (уже конвертирована,
    удалена). Представление поймает это и вернёт 409 с текстом.

    КАК РАСКЛАДЫВАЮТСЯ ПОЗИЦИИ:
        • артикул PR-NN и просчёт найден → Product (изделие) через
          существующую функцию orders.services.add_product_to_order;
        • артикул PR-NN, но просчёт удалён → OrderTovar (снимок) + пометка
          в комментарии менеджера;
        • любой другой артикул (CN1_…) → OrderTovar (снимок названия и цены);
        • доставка (если стоимость > 0) → отдельный OrderTovar «Доставка».

    ПОЧЕМУ ДОСТАВКА — ТОВАР:
        в модели Order нет поля стоимости доставки, есть только флаг
        is_delivery и адрес. Чтобы итог заказа совпал с сайтом, стоимость
        кладём отдельной позицией. Ядро orders при этом не меняется.

    ВСЯ ФУНКЦИЯ АТОМАРНА:
        если на любом шаге упадёт ошибка, не останется ни заказа без
        позиций, ни «полуконвертированной» заявки.
    """
    # --- Защита от повторной конвертации ---
    if web_order.is_deleted:
        raise ValueError('Заявка удалена — конвертировать нельзя')

    if web_order.status == WebOrder.STATUS_CONVERTED and web_order.converted_order_id:
        raise ValueError('Заявка уже конвертирована в заказ')

    # --- Клиент, контактное лицо, юрлицо ---
    # Функция либо находит существующих, либо создаёт новых.
    client, contact, legal_entity, client_created = resolve_client_for_web_order(web_order)

    is_yur = (web_order.customer_type == WebOrder.CUSTOMER_YUR)
    delivery_cost = web_order.delivery_cost or Decimal('0.00')

    # --- Создаём заказ ---
    # ===== НОМЕР ЗАКАЗА =====
    # Номер уже выдан единым нумератором ИС и хранится в заявке
    # (moguta_order_number). Берём именно его: клиент, сайт, письма и ИС
    # должны показывать один и тот же номер.
    #
    # Если номер занят другим заказом (после ручных правок или повторной
    # конвертации), оставляем пустую строку — Order.save() выдаст новый
    # из последовательности. Дубль в базе был бы хуже дыры в нумерации.
    order_number = (web_order.moguta_order_number or '').strip()

    if order_number and Order.objects.filter(number=order_number).exists():
        order_number = ''

    # created_at оставляем «сейчас»: для системы заказ создан в момент
    # конвертации. Дата оформления на сайте уходит в комментарий.
    order = Order.objects.create(
        number=order_number,
        # Источник и связь с заявкой: по ним в списке заказов видно,
        # что заказ пришёл с сайта, и можно перейти к заявке.
        source=Order.SOURCE_SITE,
        web_order=web_order,
        client=client,
        contact_person=contact,
        legal_entity=legal_entity,
        # 'legal' / 'individual' — значения из Order.PAYER_TYPE_CHOICES
        payer_type='legal' if is_yur else 'individual',
        # Дату сайта переводим в московское время: в базе add_date хранится
        # в UTC (USE_TZ=True), и strftime() без перевода показал бы время
        # на 3 часа меньше реального. timezone.localtime() переводит
        # в текущую зону из settings.TIME_ZONE (Europe/Moscow).
        comment='Заявка с сайта %s от %s' % (
            web_order.moguta_order_number or ('#' + str(web_order.moguta_order_id)),
            timezone.localtime(web_order.add_date).strftime('%d.%m.%Y %H:%M')
            if web_order.add_date else '—',
        ),
        # Доставка есть, если за неё взяли деньги. Адрес и телефон
        # переносим — менеджеру они нужны сразу.
        is_delivery=(delivery_cost > 0),
        delivery_address=web_order.address or '',
        delivery_phone=web_order.phone or '',
        created_by=created_by,
    )

    # --- Раскладываем позиции ---
    # order_position — сквозной счётчик для OrderTovar (порядок в списке).
    order_position = 0
    missing_proschets = []   # артикулы PR-*, которых нет в базе

    for item in web_order.items.all().order_by('id'):
        code = (item.code or '').strip()
        proschet = None

        # Ищем просчёт только для калькуляторных позиций.
        # is_deleted=False: удалённый просчёт использовать нельзя.
        if code.upper().startswith('PR-'):
            proschet = Proschet.objects.filter(number=code, is_deleted=False).first()

        if proschet is not None:
            # add_product_to_order пересчитает цену по актуальным
            # справочникам и скидке клиента — это её штатное поведение,
            # менять его нельзя (функция используется в других местах).
            product = add_product_to_order(proschet, order)

            # Перезаписываем цену изделия на ту, что клиент видел на сайте.
            # Клиент согласовал сумму при оформлении — подменять её
            # пересчётом нельзя.
            site_total = item.total_price or (item.price * item.count)
            if site_total and product.total_price != site_total:
                product.total_price = site_total
                product.save(update_fields=['total_price'])

            # ============================================================
            # BEAUTY-PRINT: файлы макетов «переезжают» к изделию
            # ============================================================
            # Макет относится к изделию, а не к заявке — после конвертации
            # менеджер должен видеть его в карточке заказа, рядом с изделием.
            # Связь с позицией заявки при этом сохраняется: заявка остаётся
            # историей, заказ — рабочей сущностью.
            item.files.update(order_product=product)

            continue

        # Сюда попадаем в двух случаях:
        #   • обычный товар каталога (CN1_…);
        #   • калькуляторная позиция, но просчёта уже нет.
        if code.upper().startswith('PR-'):
            missing_proschets.append(code)

        order_position += 1
        # Сохраняем объект в переменную: он нужен, чтобы привязать файлы
        # макетов к созданному товару.
        tovar = OrderTovar.objects.create(
            order=order,
            # tovar не указываем: позиции нет в справочнике товаров.
            # Поле nullable, а снимок name/article/price хранит всё нужное.
            name=item.name or 'Позиция без названия',
            article=code,
            quantity=item.count or 1,
            price=item.price or Decimal('0.00'),
            # Скидку не применяем: цена из заявки уже итоговая для клиента.
            discount=Decimal('0.00'),
            discount_source=OrderTovar.DISCOUNT_SOURCE_MANUAL,
            position=order_position,
        )

        # BEAUTY-PRINT: файлы макетов «переезжают» к товару
        # (см. комментарий в ветке изделия выше).
        item.files.update(order_tovar=tovar)

    # --- Доставка отдельной позицией ---
    if delivery_cost > 0:
        order_position += 1
        OrderTovar.objects.create(
            order=order,
            name='Доставка',
            article='',
            quantity=1,
            price=delivery_cost,
            discount=Decimal('0.00'),
            discount_source=OrderTovar.DISCOUNT_SOURCE_MANUAL,
            position=order_position,
        )

    # --- Служебные пометки для менеджера ---
    notes = []
    if client_created:
        notes.append('Клиент создан автоматически из заявки с сайта')
    if missing_proschets:
        notes.append(
            'Просчёты не найдены, добавлены как товары: ' + ', '.join(missing_proschets)
        )

    if notes:
        prefix = (web_order.manager_comment + '\n') if web_order.manager_comment else ''
        web_order.manager_comment = prefix + '\n'.join(notes)

    # --- Помечаем заявку конвертированной ---
    web_order.status = WebOrder.STATUS_CONVERTED
    web_order.converted_order_id = order.id
    web_order.save(update_fields=[
        'status', 'converted_order_id', 'manager_comment', 'updated_at',
    ])

    return order



# ============================================================================
# СТАТУСЫ ДЛЯ САЙТА (bukva-a.ru)
# ============================================================================

# Подписи статусов — те же слова, что клиент видел в Moguta.
# Ключ — короткий код (удобно передавать в JSON и использовать в JS).
# Пять статусов, которые видит клиент в ЛК сайта (согласовано с заказчиком):
# Отменён / В обработке / В работе / В доставке / Выполнен.
# Отдельного «Готов к выдаче» нет: в терминологии Moguta это и есть «Выполнен».
SITE_STATUS_LABELS = {
    'processing': 'В обработке',
    'in_work': 'В работе',
    'delivering': 'В доставке',
    'done': 'Выполнен',
    'cancelled': 'Отменен',
}

# Подписи оплаты — для ЛК сайта.
SITE_PAY_LABELS = {
    'paid': 'Оплачен',
    'unpaid': 'Не оплачен',
}


def _get_linked_order(web_order):
    """
    Возвращает заказ orders.Order, созданный из этой заявки, или None.

    ЗАЧЕМ ОТДЕЛЬНАЯ ФУНКЦИЯ: заказ нужен и для статуса производства,
    и для статуса оплаты. Обращаться к базе дважды незачем.
    """
    if not web_order.converted_order_id:
        return None

    # is_deleted=False: удалённый заказ не должен влиять на то, что
    # видит клиент на сайте.
    return Order.objects.filter(
        pk=web_order.converted_order_id,
        is_deleted=False,
    ).first()


def get_site_status_code(web_order):
    """
    Считает статус производства для сайта. Возвращает КОД из SITE_STATUS_LABELS.

    ЭТО НЕ ОТДЕЛЬНОЕ ПОЛЕ, А ВЫЧИСЛЕНИЕ — намеренно:
    хранить копию статуса значит рано или поздно получить две разные
    правды. Здесь единственные источники — web_orders.WebOrder (отклонена
    или нет) и orders.Order (статус, наличие доставки, назначен ли курьер).

    ПРАВИЛА (согласованы с заказчиком):
        заявка отклонена                          → Отменен
        заказа ещё нет                            → В обработке
        заказ «Принят»                            → В обработке
        заказ «В работе»                          → В работе
        заказ «Готов», без доставки                → Выполнен
        заказ «Готов», доставка, курьер не назначен → В работе
        заказ «Готов», доставка, курьер назначен    → В доставке
        заказ «Выдан» (передан курьеру)            → Выполнен

    ПРО УПРОЩЕНИЕ: факт вручения клиенту мы не отслеживаем. Считается,
    что «Выдан» = передан курьеру, и для клиента это «Выполнен».
    Так договорились осознанно.
    """
    # --- 1. Заявка удалена ---
    # Менеджер убрал заявку (а с ней и заказ). Для клиента это отмена:
    # иначе он увидит заказ, которого больше нет в производстве.
    if web_order.is_deleted:
        return 'cancelled'

    # --- 2. Отклонённая заявка ---
    # Клиент должен узнать, что заказ не принят, иначе он будет ждать
    # производства, которого не будет.
    if web_order.status == WebOrder.STATUS_REJECTED:
        return 'cancelled'

    order = _get_linked_order(web_order)

    # --- 3. Заказ был, но удалён ---
    # Отличаем от «заказа ещё нет» по converted_order_id: если он заполнен,
    # значит заказ создавали и потом удалили. Для клиента это тоже отмена.
    if order is None and web_order.converted_order_id:
        return 'cancelled'

    # --- 4. Заказа ещё нет ---
    if order is None:
        return 'processing'

    # --- 3. Статусы заказа ---
    if order.status == Order.STATUS_COMPLETED:
        return 'done'

    if order.status == Order.STATUS_READY:
        if order.is_delivery:
            # Готово, но доставка ещё не организована — для клиента работа
            # продолжается. Как только курьер назначен, показываем «В доставке».
            return 'delivering' if order.is_courier_ordered else 'in_work'
        # Самовывоз: изделие готово и ждёт клиента.
        # Для клиента это «Выполнен» — в терминологии Moguta «выполнен»
        # и означает «готов к выдаче». Отдельного статуса не заводим:
        # в ЛК ровно пять значений, согласованных с заказчиком.
        return 'done'

    if order.status == Order.STATUS_IN_PROGRESS:
        return 'in_work'

    # Остался только STATUS_ACCEPTED.
    return 'processing'

def get_order_layout_status(web_order):
    """
    Сводный статус макета по всем позициям заявки.

    ПРАВИЛА (от старшего к младшему):
        есть «содержит ошибки»  → «содержит ошибки»;
        все «проверен»          → «проверен»;
        есть «на проверке»      → «на проверке»;
        иначе                   → «не загружен».

    Почему ошибки важнее всего: если хоть один макет нельзя печатать,
    заказ в работу не пойдёт, и клиент должен это видеть.

    Возвращает None, если у заявки нет позиций — тогда вызывающий код
    решает сам, что показать.
    """
    statuses = list(web_order.items.values_list('layout_status', flat=True))

    if not statuses:
        return None

    if WebOrderItem.LAYOUT_ERRORS in statuses:
        return WebOrderItem.LAYOUT_ERRORS

    if all(status == WebOrderItem.LAYOUT_CHECKED for status in statuses):
        return WebOrderItem.LAYOUT_CHECKED

    if WebOrderItem.LAYOUT_CHECKING in statuses:
        return WebOrderItem.LAYOUT_CHECKING

    return WebOrderItem.LAYOUT_NOT_LOADED

def get_site_status_payload(web_order):
    """
    Собирает всё, что нужно отдать сайту по одной заявке.

    Возвращает словарь:
        {
            'status': 'in_work',          # код статуса производства
            'status_label': 'В работе',   # готовая подпись для ЛК
            'pay': 'unpaid',              # код оплаты
            'pay_label': 'Не оплачен',
            'layout': 'checked',          # код статуса макета
            'layout_label': 'Проверен',
            'pay_link': 'https://...',    # может быть пустым
            'invoice_url': 'https://...', # может быть пустым
            'order_number': 'ORD-77',     # номер в ИС (для отладки)
            'moguta_number': 'M-01060',
            'customer_type': 'yur',       # тип плательщика из заявки
            'requisites': 'ИНН ...',      # реквизиты юрлица из заявки
            'company_name': 'ООО ...',    # название организации
        }

    Оплата берётся из orders.Order.is_paid; если заказа ещё нет —
    считаем «Не оплачен».

    ЗАЧЕМ customer_type И requisites:
    На сайте личный кабинет показывает модалку смены способа оплаты и
    фильтрует список способов по типу плательщика. Раньше тип определялся
    по заполненности доп. поля «Реквизиты» (op_fields[2]) — и для заказов,
    где реквизиты ушли в yur_info, а не в доп. поле, получалось «физ. лицо».
    Из-за этого в списке не было «Оплаты по счёту», и текущий способ
    оплаты не подсвечивался.

    Здесь тип плательщика берётся из самой заявки — он приходит с сайта
    из $_POST['customer'] и сохраняется без домыслов. Значения совпадают
    с тем, что ждёт JS сайта: 'fiz' и 'yur'.
    """
    order = _get_linked_order(web_order)

    status_code = get_site_status_code(web_order)

    # Оплата: единственный источник — флаг заказа.
    pay_code = 'paid' if (order and order.is_paid) else 'unpaid'

    # Макет, ссылка и счёт живут в SiteOrderStatus.
    # Записи может не быть (например, заявка пришла до появления этой
    # модели) — тогда отдаём значения по умолчанию, а не падаем.
    site_status = SiteOrderStatus.objects.filter(web_order=web_order).first()

    if site_status is not None:
        pay_link = site_status.pay_link or ''
        # Вместо прямой ссылки на /media/ — подписанная, с ограниченным
        # сроком. Прежняя ссылка была относительной («/media/…»), поэтому
        # на домене сайта она вообще не работала, а файл при этом был
        # открыт по прямому адресу на ИС.
        from .upload_tokens import make_invoice_token

        invoice_url = '%s/web-orders/invoices/%d/download/?token=%s' % (
            getattr(settings, 'WEB_ORDER_PUBLIC_BASE_URL', 'https://beauty-print.ru'),
            site_status.id,
            make_invoice_token(site_status.id),
        ) if site_status.invoice_file else ''
    else:
        pay_link = ''
        invoice_url = ''

    # Статус макета считаем по ПОЗИЦИЯМ: у каждой позиции свой макет
    # и своя проверка. Общий статус заявки — производная от них.
    # Если позиций нет (старая заявка), падаем на значение из
    # SiteOrderStatus — так поведение не ухудшается.
    layout_code = get_order_layout_status(web_order)

    if layout_code is None:
        if site_status is not None:
            layout_code = site_status.layout_status
        else:
            layout_code = SiteOrderStatus.LAYOUT_NOT_LOADED

    LAYOUT_LABELS = dict(WebOrderItem.LAYOUT_STATUS_CHOICES)
    layout_label = LAYOUT_LABELS.get(layout_code, 'Не загружен')

    return {
        'status': status_code,
        'status_label': SITE_STATUS_LABELS.get(status_code, ''),
        'pay': pay_code,
        'pay_label': SITE_PAY_LABELS.get(pay_code, ''),
        'layout': layout_code,
        'layout_label': layout_label,
        'pay_link': pay_link,
        'invoice_url': invoice_url,
        'order_number': order.number if order else '',
        'moguta_number': web_order.moguta_order_number or '',
        # Тип плательщика и реквизиты — для модалки смены оплаты в ЛК.
        # Показываем ровно то, что клиент выбрал при оформлении: если он
        # указал юрлицо, ЛК должен открыть модалку с юрлицом, а не гадать
        # по заполненности полей.
        'customer_type': web_order.customer_type or WebOrder.CUSTOMER_FIZ,
        'requisites': web_order.requisites or '',
        'company_name': web_order.company_name or '',
    }