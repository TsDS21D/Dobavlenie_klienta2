"""
Модели приложения "web_orders" (Входящие заявки с сайта Moguta).
ИДЕЯ ПРИЛОЖЕНИЯ:
Заявки с сайта bukva-a.ru сначала попадают сюда как «сырые» данные.
Менеджер просматривает их в интерфейсе этого приложения, при необходимости
редактирует, привязывает к существующему клиенту (или создаёт нового)
и конвертирует в полноценный Order приложения "orders".
СОСТАВ МОДЕЛЕЙ:
WebOrder      — входящая заявка (контактные данные, доставка, оплата, сумма).
WebOrderItem  — позиция заявки (товар из корзины Moguta).
ВСЕ ЗАЯВКИ — МЯГКОЕ УДАЛЕНИЕ (is_deleted), как в orders.
"""
from decimal import Decimal

from django.conf import settings
from django.db import models


class WebOrder(models.Model):
    """
    Входящая заявка с сайта Moguta (bukva-a.ru).
    Хранит «сырой» снимок заказа на момент оформления,
    а также служебные поля для обработки менеджером.
    """

    # ===== СТАТУСЫ ЗАЯВКИ =====
    STATUS_NEW = 'new'
    STATUS_PROCESSING = 'processing'
    STATUS_CONVERTED = 'converted'
    STATUS_REJECTED = 'rejected'
    STATUS_ERROR = 'error'

    STATUS_CHOICES = [
        (STATUS_NEW, 'Новая'),
        (STATUS_PROCESSING, 'В работе'),
        (STATUS_CONVERTED, 'Конвертирована'),
        (STATUS_REJECTED, 'Отклонена'),
        (STATUS_ERROR, 'Ошибка'),
    ]

    # ===== ТИП ПЛАТЕЛЬЩИКА =====
    CUSTOMER_FIZ = 'fiz'
    CUSTOMER_YUR = 'yur'
    CUSTOMER_CHOICES = [
        (CUSTOMER_FIZ, 'Физ. лицо'),
        (CUSTOMER_YUR, 'Юр. лицо'),
    ]

    # ===== ДАННЫЕ ИЗ MOGUTA (трассировка) =====
    moguta_order_id = models.IntegerField(
        verbose_name='ID заказа в Moguta',
        null=True,
        blank=True,
        help_text='Внутренний ID заказа в базе Moguta (для трассировки)',
    )
    moguta_order_number = models.CharField(
        verbose_name='Номер заказа в Moguta',
        max_length=50,
        blank=True,
        default='',
        help_text='Номер заказа на сайте (например, ORD-123)',
    )
    site = models.CharField(
        verbose_name='Источник',
        max_length=100,
        default='bukva-a.ru',
        help_text='Домен сайта-источника (на случай нескольких сайтов)',
    )

    # ===== КОНТАКТНЫЕ ДАННЫЕ =====
    fio = models.CharField(
        verbose_name='Контактное лицо',
        max_length=255,
        blank=True,
        default='',
    )
    email = models.EmailField(
        verbose_name='Email',
        blank=True,
        default='',
    )
    phone = models.CharField(
        verbose_name='Телефон',
        max_length=50,
        blank=True,
        default='',
    )
    customer_type = models.CharField(
        verbose_name='Тип плательщика',
        max_length=10,
        choices=CUSTOMER_CHOICES,
        default=CUSTOMER_FIZ,
    )
    requisites = models.TextField(
        verbose_name='Реквизиты',
        blank=True,
        default='',
        help_text='Реквизиты одним текстом (для юр. лиц)',
    )
    # Название организации (только для юрлиц).
    #
    # ЗАЧЕМ: при конвертации заявки в заказ из этого значения создаётся
    # baza_klientov.LegalEntity.name — то есть «на кого выставлять счёт».
    # Без него у юрлица остаётся только ФИО контактного лица, и счёт
    # выставить не на кого.
    #
    # ОТКУДА БЕРЁТСЯ: на сайте это стандартное поле формы заказа
    # yur_info[nameyur] (в профиле — «Название компании»). Для физлица
    # поле в форму не выводится, поэтому там всегда пустая строка.
    #
    # ПОЧЕМУ max_length=255, а не 500: названия организаций редко длиннее
    # 100 символов, 255 — с большим запасом и совпадает с длины других
    # текстовых полей заявки (fio, delivery_name).
    company_name = models.CharField(
        verbose_name='Название компании',
        max_length=255,
        blank=True,
        default='',
        help_text='Название организации из формы заказа (только для юрлиц)',
    )
    address = models.TextField(
        verbose_name='Адрес доставки',
        blank=True,
        default='',
    )

    # ===== ДОСТАВКА И ОПЛАТА =====
    delivery_name = models.CharField(
        verbose_name='Способ доставки',
        max_length=255,
        blank=True,
        default='',
    )
    # Подтверждена ли стоимость доставки менеджером.
    # False — в ЛК клиента цена показывается с пометкой «(предварительно,
    #         если доставка в пределах МКАД)»;
    # True  — цена обычная, кнопка «Подтвердить» в карточке неактивна.
    # При изменении доставки самим клиентом флаг сбрасывается.
    delivery_confirmed = models.BooleanField(
        verbose_name='Доставка подтверждена',
        default=False,
    )

    delivery_cost = models.DecimalField(
        verbose_name='Стоимость доставки',
        max_digits=10,
        decimal_places=2,
        default=Decimal('0.00'),
    )
    payment_name = models.CharField(
        verbose_name='Способ оплаты',
        max_length=255,
        blank=True,
        default='',
    )
    comment = models.TextField(
        verbose_name='Комментарий клиента',
        blank=True,
        default='',
    )

    # ===== СУММА =====
    total_summ = models.DecimalField(
        verbose_name='Итоговая сумма',
        max_digits=12,
        decimal_places=2,
        default=Decimal('0.00'),
    )

    # ===== ДАТЫ =====
    add_date = models.DateTimeField(
        verbose_name='Дата создания на сайте',
        null=True,
        blank=True,
        help_text='Дата оформления заказа на сайте Moguta',
    )
    created_at = models.DateTimeField(
        verbose_name='Дата получения',
        auto_now_add=True,
    )
    updated_at = models.DateTimeField(
        verbose_name='Дата обновления',
        auto_now=True,
    )

    # ===== СТАТУС И ОБРАБОТКА =====
    status = models.CharField(
        verbose_name='Статус',
        max_length=20,
        choices=STATUS_CHOICES,
        default=STATUS_NEW,
    )
    suggested_client_id = models.IntegerField(
        verbose_name='Найденный клиент (ID)',
        null=True,
        blank=True,
        help_text='ID клиента из baza_klientov, найденный по email/телефону',
    )
    converted_order_id = models.IntegerField(
        verbose_name='Созданный заказ (ID)',
        null=True,
        blank=True,
        help_text='ID заказа в orders.Order после конвертации',
    )
    manager_comment = models.TextField(
        verbose_name='Комментарий менеджера',
        blank=True,
        default='',
    )

    # ===== СЫРОЙ JSON =====
    raw_payload = models.JSONField(
        verbose_name='Сырой JSON',
        null=True,
        blank=True,
        help_text='Исходные данные от Moguta (для отладки и повторной конвертации)',
    )
    # ===== ДОПОЛНИТЕЛЬНЫЕ ПОЛЯ ЗАКАЗА ИЗ MOGUTA =====
    #
    # ЗАЧЕМ ЭТО НУЖНО:
    # В Moguta у заказа есть «Дополнительные поля» (Настройки → Дополнительные
    # поля), которыми менеджеры пользуются каждый день. На 15.11.2026 это:
    #   ID 2 — Реквизиты (textarea, дублирует профиль клиента);
    #   ID 3 — Статус производства (В обработке / В работе / В доставке /
    #          Выполнен / Отменен);
    #   ID 4 — Статус макета (Не загружен / На проверке / Проверен /
    #          Содержит ошибки);
    #   ID 5 — Статус оплаты (Не оплачен / Оплачен);
    #   ID 6 — Ссылка на оплату (ручная);
    #   ID 7 — Счёт на оплату (PDF);
    #   ID 8 — Доставка согласована (галочка).
    #
    # Это СНИМОК на момент оформления заказа. Он не заменяет обратную
    # синхронизацию статусов (её пока нет): если менеджер потом поменяет
    # статус в админке Moguta, здесь останется старое значение — и это
    # нормально, снимок и должен быть снимком.
    #
    # ПОЧЕМУ JSONField, а не отдельные колонки:
    # набор полей задаётся в админке Moguta и может измениться в любой
    # момент (добавят ID 9). JSON переживёт это без миграции; отдельные
    # поля пришлось бы добавлять под каждый новый ID.
    #
    # ПОЧЕМУ null=True и blank=True:
    # старые заявки (и заявки от других источников) придут без этого поля —
    # падать из-за этого нельзя. Структура внутри — как отдаёт Moguta,
    # то есть словарь с ключами-ID: {"3": {"value": "В обработке"}, ...}.
    op_fields = models.JSONField(
        verbose_name='Доп. поля Moguta',
        null=True,
        blank=True,
        help_text='Снимок дополнительных полей заказа из Moguta (статусы, ссылка на оплату, счёт)',
    )

    # ===== МЯГКОЕ УДАЛЕНИЕ =====
    is_deleted = models.BooleanField(
        verbose_name='Удалена',
        default=False,
    )

    class Meta:
        verbose_name = 'Входящая заявка'
        verbose_name_plural = 'Входящие заявки'
        ordering = ['-created_at']

        # ===== ЗАЩИТА ОТ ДУБЛЕЙ НА УРОВНЕ БД =====
        #
        # ЗАЧЕМ: проверка через filter().first() в views.py ловит только
        # ПОСЛЕДОВАТЕЛЬНЫЕ повторы. Если клиент дважды кликнет «Оформить
        # заказ», два запроса придут одновременно, оба пройдут проверку
        # (заявки ещё нет) и оба создадут запись — получим два дубля.
        # Уникальный индекс в базе закрывает эту гонку: второй INSERT
        # просто не пройдёт, Django бросит IntegrityError.
        #
        # ПОЧЕМУ ИНДЕКС ЧАСТИЧНЫЙ (condition):
        # в приложении мягкое удаление (is_deleted). Если заявку удалили,
        # а сайт пришлёт тот же заказ повторно — новая заявка должна
        # создаться. Поэтому индекс действует только для неудалённых.
        #
        # ПОЧЕМУ site В КЛЮЧЕ:
        # поле site заведено «на случай нескольких сайтов». Уникальность
        # считается в рамках источника, иначе одинаковые moguta_order_id
        # с разных сайтов конфликтовали бы между собой.
        constraints = [
            models.UniqueConstraint(
                fields=['site', 'moguta_order_id'],
                condition=models.Q(is_deleted=False),
                name='uniq_weborder_site_moguta_active',
            ),
        ]

    def __str__(self):
        """Строковое представление: «Заявка #123 от Иванов И.И.»."""
        fio = self.fio or self.email or 'аноним'
        return f'Заявка #{self.id} от {fio}'

    @property
    def pays_by_invoice(self):
        """
        Клиент выбрал оплату по счёту.

        Ориентируемся на название способа оплаты, а не на тип плательщика:
        юрлицо тоже может выбрать «Оплата картой по ссылке». Учитываем оба
        написания — «счёт» и «счет».
        """
        name = (self.payment_name or '').lower()
        return 'счёт' in name or 'счет' in name


    @property
    def is_pickup(self):
        """
        Самовывоз — доставку не считаем и не подтверждаем.

        Проверяем по названию способа получения: у самовывоза в нём всегда
        есть слово «самовывоз». Стоимость 0 бывает и у бесплатной доставки,
        поэтому ориентироваться только на неё нельзя.
        """
        return 'самовывоз' in (self.delivery_name or '').lower()



class WebOrderItem(models.Model):
    """
    Позиция входящей заявки (товар из корзины Moguta).
    Одна заявка может содержать несколько позиций.
    """
    web_order = models.ForeignKey(
        WebOrder,
        verbose_name='Заявка',
        on_delete=models.CASCADE,
        related_name='items',
    )
    name = models.CharField(
        verbose_name='Название товара',
        max_length=255,
    )
    # ===== КЛЮЧ СТРОКИ КОРЗИНЫ С САЙТА =====
    # line_uid — уникальный ключ строки корзины, который сайт присваивает
    # при добавлении товара (например, ln6afe015c033162489).
    #
    # ЗАЧЕМ:
    # до этого файлы привязывались к позиции заявки по её ПОРЯДКОВОМУ НОМЕРУ,
    # потому что в order_content ключа не было. Любое добавление или удаление
    # позиции в ИС сдвигало нумерацию, и файлы могли «переехать» к чужому
    # изделию. С ключом привязка устойчива: позиция находится по нему
    # независимо от порядка.
    #
    # Пустая строка — нормальный случай: у старых позиций ключа нет,
    # для них остаётся сопоставление по порядку.
    line_uid = models.CharField(
        verbose_name='Ключ строки корзины',
        max_length=64,
        blank=True,
        default='',
        db_index=True,
        help_text='line_uid строки корзины Moguta: устойчивая привязка файлов к позиции',
    )

    # Артикул товара в Moguta. Приходит с сайта в JSON, в поле items[].code.
    #
    # ЗАЧЕМ ОН НУЖЕН:
    # Это единственный ключ, по которому входящую заявку можно связать с
    # реальным просчётом (Proschet) при конвертации в заказ.
    #   - товар, созданный из веб-калькулятора, имеет код вида "PR-42",
    #     и по нему мы найдём просчёт (Proschet.number);
    #   - обычный товар каталога имеет свой артикул Moguta (например,
    #     "CN1_107"), просчёта за ним нет — такая позиция при конвертации
    #     станет строкой OrderTovar, а не изделием.
    #
    # ПОЧЕМУ blank=True и default='':
    # старые заявки (и заявки от других источников) могут прийти без кода,
    # падать из-за этого нельзя.
    code = models.CharField(
        verbose_name='Артикул в Moguta',
        max_length=100,
        blank=True,
        default='',
        help_text='Код товара из Moguta. Для товаров веб-калькулятора — номер просчёта PR-NN',
    )

    count = models.IntegerField(
        verbose_name='Количество',
        default=1,
    )
    price = models.DecimalField(
        verbose_name='Цена за единицу',
        max_digits=10,
        decimal_places=2,
        default=Decimal('0.00'),
    )
    property = models.CharField(
        verbose_name='Свойства/характеристики',
        max_length=500,
        blank=True,
        default='',
        help_text='Характеристики товара из корзины Moguta',
    )
    # ===== СТАТУС МАКЕТА ПОЗИЦИИ =====
    # Значения те же, что у SiteOrderStatus, чтобы клиент видел одинаковые
    # формулировки и в карточке заказа, и в ЛК.
    #
    # ПОЧЕМУ НА ПОЗИЦИИ, А НЕ НА ЗАЯВКЕ:
    # в заявке бывает несколько изделий, и макеты у них проверяются
    # по отдельности. Один общий статус скрывал бы, что половина готова.
    LAYOUT_NOT_LOADED = 'not_loaded'
    LAYOUT_CHECKING = 'checking'
    LAYOUT_CHECKED = 'checked'
    LAYOUT_ERRORS = 'errors'

    LAYOUT_STATUS_CHOICES = [
        (LAYOUT_NOT_LOADED, 'Не загружен'),
        (LAYOUT_CHECKING, 'На проверке'),
        (LAYOUT_CHECKED, 'Проверен'),
        (LAYOUT_ERRORS, 'Содержит ошибки'),
    ]

    layout_status = models.CharField(
        verbose_name='Статус макета',
        max_length=20,
        choices=LAYOUT_STATUS_CHOICES,
        default=LAYOUT_NOT_LOADED,
        help_text='Меняется автоматически при загрузке файла клиентом, '
                  'менеджер может переопределить вручную',
    )

    def mark_layout_checking(self):
        """
        Переводит позицию в статус «на проверке».

        ВЫЗЫВАЕТСЯ ТОЛЬКО ПРИ ЗАГРУЗКЕ ФАЙЛА КЛИЕНТОМ.
        Любой новый файл от клиента означает «нужно смотреть заново»,
        поэтому даже статус «проверен» сбрасывается: иначе можно
        напечатать старый утверждённый макет, пока рядом лежит
        свежий, ещё не проверенный.

        Файлы, загруженные менеджером, статус не меняют — он сам
        решает, что с ними делать.
        """
        if self.layout_status != self.LAYOUT_CHECKING:
            self.layout_status = self.LAYOUT_CHECKING
            self.save(update_fields=['layout_status'])

    total_price = models.DecimalField(
        verbose_name='Итоговая цена позиции',
        max_digits=12,
        decimal_places=2,
        default=Decimal('0.00'),
    )

    class Meta:
        verbose_name = 'Позиция заявки'
        verbose_name_plural = 'Позиции заявок'
        ordering = ['id']

    def __str__(self):
        """Строковое представление: «Визитки × 1000»."""
        return f'{self.name} × {self.count}'



class SiteOrderStatus(models.Model):
    """
    Данные интернет-заказа, которые видит клиент в личном кабинете bukva-a.ru.

    ЗАЧЕМ ОТДЕЛЬНАЯ МОДЕЛЬ, А НЕ ПОЛЯ В orders.Order:
    приложение orders — про производство и бухгалтерию, и его модель нельзя
    трогать без отдельного согласования (это ядро). Всё, что относится
    к интеграции с сайтом, живёт в интеграционном приложении web_orders.
    Так у нас нет ни одной миграции в orders.

    ЧЕГО ЗДЕСЬ НЕТ И ПОЧЕМУ:
        • статус производства для сайта — не храним, он ВЫЧИСЛЯЕТСЯ
          из orders.Order (статус, доставка, курьер) и web_orders.WebOrder
          (отклонена или нет). Хранить копию значит рано или поздно
          получить две разные правды;
        • статус оплаты — тоже вычисляется из orders.Order.is_paid:
          деньги либо пришли, либо нет, дублировать нечего.

    ЧТО ДЕЙСТВИТЕЛЬНО НУЖНО ХРАНИТЬ:
        • статус макета — такого понятия в orders нет вообще;
        • ссылку на оплату — её формирует менеджер вручную (ЮKassa);
        • файл счёта — бухгалтерия загружает PDF для юрлиц.
    """

    # ===== СТАТУС МАКЕТА =====
    # Значения повторяют список из доп. поля Moguta (ID 4), чтобы клиент
    # видел те же слова, что и раньше, и чтобы можно было без потерь
    # перейти с Moguta на ИС как источник данных.
    LAYOUT_NOT_LOADED = 'not_loaded'   # макет ещё не присылали
    LAYOUT_CHECKING = 'checking'       # клиент прислал, мы смотрим
    LAYOUT_CHECKED = 'checked'         # проверен, можно печатать
    LAYOUT_ERRORS = 'errors'           # найдены ошибки, нужно переделать

    LAYOUT_CHOICES = [
        (LAYOUT_NOT_LOADED, 'Не загружен'),
        (LAYOUT_CHECKING, 'На проверке'),
        (LAYOUT_CHECKED, 'Проверен'),
        (LAYOUT_ERRORS, 'Содержит ошибки'),
    ]

    # ===== СВЯЗЬ С ЗАЯВКОЙ =====
    # OneToOne: у каждой заявки ровно одна запись статусов.
    # CASCADE: удалили заявку — статусы для сайта больше не нужны.
    # related_name='site_status' даёт удобное обращение web_order.site_status.
    web_order = models.OneToOneField(
        WebOrder,
        verbose_name='Заявка',
        on_delete=models.CASCADE,
        related_name='site_status',
    )

    layout_status = models.CharField(
        verbose_name='Статус макета',
        max_length=20,
        choices=LAYOUT_CHOICES,
        default=LAYOUT_NOT_LOADED,
        help_text='Что клиент видит в личном кабинете на сайте',
    )

    # ===== ССЫЛКА НА ОПЛАТУ =====
    # Для физлиц: менеджер создаёт платёж в ЮKassa и вставляет ссылку.
    # max_length=500 — ссылки ЮKassa бывают длинными (параметры + подпись).
    pay_link = models.CharField(
        verbose_name='Ссылка на оплату',
        max_length=500,
        blank=True,
        default='',
        help_text='Ссылка на оплату (ЮKassa) для физических лиц',
    )

    # ===== СЧЁТ НА ОПЛАТУ (PDF) =====
    # Для юрлиц: файл, который клиент скачивает из личного кабинета.
    # upload_to — подпапка внутри MEDIA_ROOT (media/web_orders/invoices/).
    # null=True — файла может не быть (счёт ещё не выставили).
    invoice_file = models.FileField(
        verbose_name='Счёт на оплату (PDF)',
        upload_to='web_orders/invoices/',
        blank=True,
        null=True,
        help_text='PDF со счётом для юридических лиц',
    )

    # ===== СЛУЖЕБНОЕ =====
    # auto_now: фиксирует любое изменение — удобно, когда смотришь,
    # давно ли менеджер трогал статусы.
    updated_at = models.DateTimeField(
        verbose_name='Дата обновления',
        auto_now=True,
    )

    class Meta:
        verbose_name = 'Статусы для сайта'
        verbose_name_plural = 'Статусы для сайта'

    def __str__(self):
        """Строковое представление: «Статусы заявки M-01060»."""
        number = self.web_order.moguta_order_number or self.web_order.id
        return 'Статусы заявки %s' % number    
    @property
    def invoice_display_name(self):
        """
        Имя счёта без пути: «Счёт 1044.pdf».

        В шаблоне invoice_file.name показывает «web_orders/invoices/…pdf» —
        это технический путь, а менеджеру нужно человеческое имя.
        """
        if not self.invoice_file:
            return ''
        return self.invoice_file.name.rsplit('/', 1)[-1]

    @property
    def invoice_download_url(self):
        """
        Подписанная ссылка на скачивание счёта.

        Живёт 1 час и действует только на этот счёт. Нужна потому, что
        иначе ссылка ведёт на /media/, где файл открыт любому, кто знает путь.
        """
        if not self.invoice_file:
            return ''

        from django.conf import settings

        from .upload_tokens import make_invoice_token

        return '%s/web-orders/invoices/%d/download/?token=%s' % (
            getattr(settings, 'WEB_ORDER_PUBLIC_BASE_URL', 'https://beauty-print.ru'),
            self.id,
            make_invoice_token(self.id),
        )

# ============================================================================
# ФАЙЛЫ МАКЕТОВ, ПРИВЯЗАННЫЕ К ПОЗИЦИИ ЗАЯВКИ
# ============================================================================
# Зачем отдельная модель, а не поле у заявки:
#   • макет относится к КОНКРЕТНОМУ изделию/товару, а не ко всему заказу
#     (у заказа из трёх позиций может быть три разных макета);
#   • файлов на позицию может быть несколько: исходный макет, правка,
#     препресс, ещё правка;
#   • у клиента и менеджера разные права, и нужна история «кто когда что
#     приложил и что прокомментировал».
#
# У позиции «Доставка» файлов быть не может — это не изделие.


def layout_upload_path(instance, filename):
    """
    Куда физически кладём файл: media/web_orders/layouts/ГГГГ/ММ/<uuid>_<имя>.

    ЗАЧЕМ uuid в имени:
        два клиента могут прислать файл с одинаковым названием
        «макет.pdf» — без уникального префикса второй затрёт первый.

    ЗАЧЕМ ГГГГ/ММ:
        чтобы в одной папке не оказалось десятков тысяч файлов
        (это замедляет работу файловой системы и неудобно при бэкапе).
    """
    import os
    import uuid
    from django.utils import timezone

    today = timezone.now()
    ext = os.path.splitext(filename)[1].lower()[:10]
    safe_name = uuid.uuid4().hex

    return f'web_orders/layouts/{today:%Y}/{today:%m}/{safe_name}{ext}'


class WebOrderItemFile(models.Model):
    """
    Файл (или ссылка) макета, привязанный к позиции заявки.

    Может содержать либо файл, либо ссылку — хотя бы одно из двух.
    """

    # --- Кто приложил ---
    AUTHOR_CLIENT = 'client'
    AUTHOR_MANAGER = 'manager'
    AUTHOR_CHOICES = [
        (AUTHOR_CLIENT, 'Клиент'),
        (AUTHOR_MANAGER, 'Менеджер'),
    ]

    # --- Что это за файл ---
    KIND_LAYOUT = 'layout'       # исходный макет от клиента
    KIND_PROOF = 'proof'         # исправленная версия клиента
    KIND_PREPRESS = 'prepress'   # файл от менеджера (препресс, доработка)
    KIND_OTHER = 'other'
    KIND_CHOICES = [
        (KIND_LAYOUT, 'Макет'),
        (KIND_PROOF, 'Правка'),
        (KIND_PREPRESS, 'От менеджера'),
        (KIND_OTHER, 'Другое'),
    ]

    item = models.ForeignKey(
        WebOrderItem,
        verbose_name='Позиция заявки',
        on_delete=models.CASCADE,
        related_name='files',
        help_text='Изделие или товар, к которому относится макет',
    )

    file = models.FileField(
        verbose_name='Файл',
        upload_to=layout_upload_path,
        blank=True,
        null=True,
        help_text='Может быть пустым, если вместо файла передана ссылка',
    )

    link_url = models.URLField(
        verbose_name='Ссылка на макет',
        max_length=1000,
        blank=True,
        default='',
        help_text='Если клиент прислал ссылку (Яндекс.Диск, Google Drive и т.п.)',
    )

    comment = models.TextField(
        verbose_name='Комментарий к файлу',
        blank=True,
        default='',
        help_text='Пояснение автора: что это за файл, что исправлено и т.п.',
    )

    kind = models.CharField(
        verbose_name='Тип файла',
        max_length=20,
        choices=KIND_CHOICES,
        default=KIND_LAYOUT,
    )

    author_kind = models.CharField(
        verbose_name='Кто приложил',
        max_length=10,
        choices=AUTHOR_CHOICES,
        default=AUTHOR_CLIENT,
    )

    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name='Сотрудник',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='+',
        help_text='Заполняется, если файл приложил менеджер',
    )

    # Внутренние файлы менеджера клиенту не показываем.
    is_client_visible = models.BooleanField(
        verbose_name='Виден клиенту',
        default=True,
        help_text='Снимите галочку для внутренних файлов',
    )

    # --- Служебная информация о файле (снимок на момент загрузки) ---
    original_name = models.CharField(
        verbose_name='Исходное имя файла',
        max_length=255,
        blank=True,
        default='',
    )
    size = models.PositiveBigIntegerField(
        verbose_name='Размер, байт',
        default=0,
    )
    content_type = models.CharField(
        verbose_name='MIME-тип',
        max_length=100,
        blank=True,
        default='',
    )

    # --- Связь с заказом после конвертации заявки ---
    # Заполняется, когда заявка превращается в заказ: файл «переезжает»
    # к изделию (Product) или к товару (OrderTovar).
    # SET_NULL: если изделие/товар удалят, файл останется в заявке.
    order_product = models.ForeignKey(
        'orders.Product',
        verbose_name='Изделие в заказе',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='layout_files',
    )
    order_tovar = models.ForeignKey(
        'orders.OrderTovar',
        verbose_name='Товар в заказе',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='layout_files',
    )

    created_at = models.DateTimeField(
        verbose_name='Загружен',
        auto_now_add=True,
    )

    class Meta:
        verbose_name = 'Файл макета'
        verbose_name_plural = 'Файлы макетов'
        ordering = ['created_at']

    def __str__(self):
        name = self.original_name or (self.file.name if self.file else self.link_url)
        return f'{name} — {self.item}'

    @property
    def is_link_only(self):
        """True, если файла нет и передан только ссылка."""
        return not self.file and bool(self.link_url)

    @property
    def display_name(self):
        """
        Имя файла для показа в интерфейсе.

        Порядок: сохранённое original_name → имя из хранилища без пути →
        ссылка (если файла нет).

        ЗАЧЕМ: original_name заполняется при загрузке через наш API.
        Если файл добавлен иначе (через админку-inline, импорт, скрипт),
        поле может быть пустым — и тогда в интерфейсе появлялся бы
        технический путь вида «web_orders/layouts/2026/11/<uuid>.pdf».
        Здесь мы это подстраховываем.
        """
        if self.original_name:
            return self.original_name

        if self.file:
            # storage может вернуть путь с подпапками — оставляем только имя.
            return self.file.name.rsplit('/', 1)[-1]

        return self.link_url

    @property
    def display_size(self):
        """
        Размер файла в байтах.

        Если поле size не заполнено (файл добавлен не через наш API),
        читаем размер из хранилища. Исключения глушим: файл мог быть
        удалён с диска — страница заявки не должна падать из-за этого.
        """
        if self.size:
            return self.size

        if self.file:
            try:
                return self.file.size
            except (OSError, ValueError):
                return 0

        return 0


class WebOrderItemFileComment(models.Model):
    """
    Комментарий к файлу макета — диалог клиента и менеджера.

    Отдельная модель, а не поле у файла, потому что комментариев может быть
    несколько с обеих сторон: клиент просит поправить, менеджер отвечает,
    клиент прикладывает новую версию и т.д.
    """

    AUTHOR_CLIENT = WebOrderItemFile.AUTHOR_CLIENT
    AUTHOR_MANAGER = WebOrderItemFile.AUTHOR_MANAGER
    AUTHOR_CHOICES = WebOrderItemFile.AUTHOR_CHOICES

    file = models.ForeignKey(
        WebOrderItemFile,
        verbose_name='Файл',
        on_delete=models.CASCADE,
        related_name='comments',
    )

    text = models.TextField(
        verbose_name='Текст комментария',
    )

    author_kind = models.CharField(
        verbose_name='Кто написал',
        max_length=10,
        choices=AUTHOR_CHOICES,
        default=AUTHOR_CLIENT,
    )

    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name='Сотрудник',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='+',
    )

    is_client_visible = models.BooleanField(
        verbose_name='Виден клиенту',
        default=True,
    )

    created_at = models.DateTimeField(
        verbose_name='Написан',
        auto_now_add=True,
    )

    class Meta:
        verbose_name = 'Комментарий к файлу'
        verbose_name_plural = 'Комментарии к файлам'
        ordering = ['created_at']

    def __str__(self):
        return f'{self.author_kind}: {self.text[:40]}'

# ============================================================================
# ПРОМЕЖУТОЧНЫЕ ФАЙЛЫ КЛИЕНТА (ДО ОФОРМЛЕНИЯ ЗАКАЗА)
# ============================================================================
# Зачем нужны:
#   Клиент прикладывает макет на сайте ДО оформления заказа. В этот момент
#   в ИС нет ни заявки, ни позиции — файл некуда прикрепить. Поэтому он
#   сначала лежит здесь, в «промежуточной» таблице, привязанный к корзине
#   (cart_token) и к строке корзины (line_uid).
#
#   Когда сайт пришлёт заявку, ИС найдёт эти файлы по токену корзины и
#   перенесёт их в WebOrderItemFile, привязав к нужной позиции.
#
# Почему line_uid, а не номер позиции:
#   клиент может удалить строку корзины, и нумерация сдвинется.
#   line_uid — уникальный ключ строки, он не меняется (см. models/cart.php).
#
# Невостребованные записи (клиент не оформил заказ) удаляются командой
# очистки по возрасту — иначе брошенные корзины забьют диск.


def pending_upload_path(instance, filename):
    """
    Куда физически кладём файл до оформления заказа:
    media/web_orders/pending/ГГГГ/ММ/<uuid><расширение>.

    Имя генерируется, а не берётся из файла: два клиента могут прислать
    «макет.pdf», а имя от пользователя нельзя пускать в путь.
    """
    import os
    import uuid
    from django.utils import timezone

    today = timezone.now()
    ext = os.path.splitext(filename)[1].lower()[:10]

    return f'web_orders/pending/{today:%Y}/{today:%m}/{uuid.uuid4().hex}{ext}'


class WebOrderPendingFile(models.Model):
    """
    Файл, загруженный клиентом на сайте до оформления заказа.

    Связь с будущей заявкой — через два поля:
        cart_token — идентификатор корзины (выдаётся при загрузке токена);
        line_uid   — уникальный ключ строки корзины на сайте.
    """

    cart_token = models.CharField(
        verbose_name='Токен корзины',
        max_length=64,
        db_index=True,
        help_text='Идентификатор корзины на сайте, выданный при получении токена загрузки',
    )

    line_uid = models.CharField(
        verbose_name='Ключ строки корзины',
        max_length=64,
        blank=True,
        default='',
        db_index=True,
        help_text='line_uid строки корзины (см. Models_Cart::addToCart на сайте)',
    )

    file = models.FileField(
        verbose_name='Файл',
        upload_to=pending_upload_path,
        blank=True,
        null=True,
    )

    link_url = models.URLField(
        verbose_name='Ссылка на макет',
        max_length=1000,
        blank=True,
        default='',
    )

    comment = models.TextField(
        verbose_name='Комментарий клиента',
        blank=True,
        default='',
    )

    kind = models.CharField(
        verbose_name='Тип файла',
        max_length=20,
        choices=WebOrderItemFile.KIND_CHOICES,
        default=WebOrderItemFile.KIND_LAYOUT,
    )

    original_name = models.CharField(
        verbose_name='Исходное имя файла',
        max_length=255,
        blank=True,
        default='',
    )

    size = models.PositiveBigIntegerField(
        verbose_name='Размер, байт',
        default=0,
    )

    content_type = models.CharField(
        verbose_name='MIME-тип',
        max_length=100,
        blank=True,
        default='',
    )

    created_at = models.DateTimeField(
        verbose_name='Загружен',
        auto_now_add=True,
        db_index=True,
    )

    class Meta:
        verbose_name = 'Промежуточный файл клиента'
        verbose_name_plural = 'Промежуточные файлы клиентов'
        ordering = ['created_at']

    def __str__(self):
        name = self.original_name or (self.file.name if self.file else self.link_url)
        return f'{name} — корзина {self.cart_token[:8]}…'

    @property
    def display_name(self):
        """Имя для показа: исходное, иначе имя из хранилища без пути."""
        if self.original_name:
            return self.original_name
        if self.file:
            return self.file.name.rsplit('/', 1)[-1]
        return self.link_url

    @property
    def display_size(self):
        """Размер: из поля, иначе из хранилища."""
        if self.size:
            return self.size
        if self.file:
            try:
                return self.file.size
            except (OSError, ValueError):
                return 0
        return 0

# ============================================================================
# ВЫДАЧА НОМЕРОВ ЗАКАЗОВ ДЛЯ САЙТА
# ============================================================================
# ЗАЧЕМ ОТДЕЛЬНАЯ ТАБЛИЦА, А НЕ ПОЛЕ У ЗАЯВКИ:
# сайт просит номер ДО создания заказа, то есть заявки в этот момент
# ещё не существует. Записать номер некуда, кроме своей таблицы.
#
# ЗАЧЕМ cart_token:
# идемпотентность. Клиент нажал «Оформить заказ», ответ по сети потерялся,
# браузер повторил запрос. Без ключа второй запрос выдал бы второй номер,
# и в нумерации появилась бы лишняя дыра (и клиент мог бы получить два
# разных номера). С ключом повтор возвращает тот же номер.


class OrderNumberAllocation(models.Model):
    """
    Выданный номер заказа, ожидающий оформления на сайте.

    Запись живёт бессрочно: номер, выданный клиенту, не переиспользуется,
    даже если заказ так и не был создан (решение согласовано — дыры
    в нумерации заказов допустимы).
    """

    # Ключ корзины: по нему повторный запрос получает тот же номер.
    cart_token = models.CharField(
        verbose_name='Ключ корзины (cart_token)',
        max_length=64,
        unique=True,
        help_text='Идентификатор корзины сайта, по которому выдаётся номер',
    )

    # Сам номер. Строкой, а не целым: номера старых заказов содержат
    # префиксы (ORD-, M-), и поле должно быть совместимо с ними.
    number = models.CharField(
        verbose_name='Номер заказа',
        max_length=20,
    )

    # Когда номер выдан: полезно для разбора «почему в нумерации дыра».
    created_at = models.DateTimeField(
        verbose_name='Выдан',
        auto_now_add=True,
        db_index=True,
    )

    class Meta:
        verbose_name = 'Выданный номер заказа'
        verbose_name_plural = 'Выданные номера заказов'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.number} ({self.cart_token})'    