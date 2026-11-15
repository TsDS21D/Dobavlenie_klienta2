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