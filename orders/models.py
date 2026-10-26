# orders/models.py
"""
Модели приложения "orders" (Заказы и изделия).

ИДЕЯ ПРИЛОЖЕНИЯ:
    Просчёт (calculator.Proschet) — динамическая сущность: цена всё время
    пересчитывается. Пока клиент думает — просчёт может устареть, подорожать.

    Когда клиент решил делать заказ, из просчёта одним действием создаётся
    Изделие (Product). Изделие — это ЗАМОРОЖЕННЫЙ снимок всех параметров
    просчёта (компоненты, работы, ламинация, вычисления листов) вместе
    с зафиксированной на момент создания ценой.

    Изделие всегда принадлежит какому-то Заказу (Order). У заказа есть
    клиент (обязательный) и может быть несколько изделий.

    Из изделия обратно можно создать новый просчёт — тогда цена
    пересчитается на актуальные справочники.

СОСТАВ МОДЕЛЕЙ:
1. Order                    — заказ (клиент, номер, комментарий, даты).
2. Product                  — изделие (снимок просчёта + фиксированная цена).
3. ProductPrintComponent    — снимок печатного компонента.
4. ProductAdditionalWork    — снимок дополнительной работы.
5. ProductLaminate          — снимок ламинации.
6. ProductVichisliniya      — снимок одностраничного расчёта листов.
7. ProductMultipage         — снимок многостраничного расчёта листов.

Все снимки — отдельные таблицы (не JSON), по аналогии с приложением
"shablony_proschetov". Так их удобно редактировать в админке и надёжно хранить.

ВАЖНО ПРО ЦЕНЫ:
    В calculator.PrintComponent поля sheet_count / runs_count /
    total_circulation_price — это СВОЙСТВА (пересчитываются «на лету»).
    Здесь это СОХРАНЯЕМЫЕ поля. Они фиксируются при создании изделия
    и больше не меняются, даже если справочники подорожают.
"""

# ===== СТАНДАРТНЫЕ ИМПОРТЫ =====
from decimal import Decimal                              # Точные десятичные числа
from datetime import timedelta                           # Сдвиг даты на N дней

# ===== ИМПОРТЫ DJANGO =====
from django.conf import settings                         # Доступ к AUTH_USER_MODEL
from django.db import models                             # Базовый модуль моделей Django
from django.utils import timezone                        # Работа с часовыми поясами

# ===== ИМПОРТ CHOICES ИЗ СУЩЕСТВУЮЩИХ МОДЕЛЕЙ =====
# Переиспользуем choices из рабочих моделей, чтобы был единый источник правды.
# Ссылки на сами модели в FK даются строками ('app.Model'), поэтому
# циклических импортов не возникнет.
from calculator.models_list_proschet import PrintComponent          # PRINT_TYPE_CHOICES, PRINT_MODE_CHOICES
from calculator.models_lamination import Laminate                   # SIDE_CHOICES
from vichisliniya_listov.models import VichisliniyaListovModel      # VICHISLINIYA_LISTOV_COLOR_CHOICES, _ORIENTATION_CHOICES
from vichisliniya_listov.multipage_models import VichisliniyaMultipageModel  # ORIENTATION_CHOICES
from spravochnik_dopolnitelnyh_rabot.models import Work             # FORMULA_CHOICES

# ============================================================================
# ВСПОМОГАТЕЛЬНАЯ ФУНКЦИЯ: ДЕФОЛТНАЯ ДАТА ГОТОВНОСТИ
# ============================================================================

def default_ready_datetime():
    """
    Возвращает дату и время готовности заказа по умолчанию:
    15:00 следующего рабочего дня (пн–пт) в текущем часовом поясе проекта
    (по TIME_ZONE = 'Europe/Moscow' — как на странице /counter/).

    Логика повторяет JS-функцию getNextBusinessDay() из counter/index.js:
      - берём «завтра» в московском времени;
      - если это суббота или воскресенье — сдвигаем вперёд до понедельника;
      - выставляем время 15:00:00.

    Функция объявлена на уровне модуля, чтобы Django мог использовать её
    как `default` для поля модели. Такая функция должна быть вызываемой
    без аргументов — это требование Django.
    """
    # Текущий момент в московском времени (aware datetime).
    now_local = timezone.localtime(timezone.now())

    # «Завтра» в том же часовом поясе.
    next_day = now_local + timedelta(days=1)

    # weekday(): 0 — пн, …, 5 — сб, 6 — вс.
    # Пропускаем выходные — сдвигаем на следующий день.
    while next_day.weekday() >= 5:
        next_day = next_day + timedelta(days=1)

    # Ставим 15:00:00 (микросекунды тоже обнуляем — чтобы значение было «ровным»).
    return next_day.replace(hour=15, minute=0, second=0, microsecond=0)

# ============================================================================
# МОДЕЛЬ 1: ЗАКАЗ (ORDER)
# ============================================================================

class Order(models.Model):
    """
    Заказ — объединяющая сущность. Содержит одно или несколько изделий
    одного клиента. Клиент обязателен.
    """

    # Номер заказа (автоматически генерируется в формате ORD-1, ORD-2...).
    number = models.CharField(
        verbose_name='Номер заказа',                     # Человекочитаемое имя поля
        max_length=20,                                   # Хватит с запасом (ORD-999999)
        unique=True,                                     # Номер должен быть уникальным
        blank=True,                                      # В форме можно оставить пустым — заполнится в save()
        help_text='Автоматически генерируется в формате ORD-1, ORD-2 и т.д.'
    )

    # Клиент — НЕобязательный FK на модель baza_klientov.Client.
    # on_delete=PROTECT: нельзя удалить клиента, пока на него ссылается заказ.
    # null=True и blank=True — заказ можно создать без указания клиента.
    client = models.ForeignKey(
        'baza_klientov.Client',                          # Ссылка строкой — избегаем циклического импорта
        verbose_name='Клиент',
        on_delete=models.PROTECT,
        related_name='orders',                           # client.orders.all() — все заказы клиента
        null=True,                                       # В БД поле может быть NULL
        blank=True,                                      # В формах можно оставить пустым
        help_text='Клиент, для которого создан заказ (необязательно)'
    )
    # Юридическое лицо (для счетов и договоров)
    legal_entity = models.ForeignKey(
        'baza_klientov.LegalEntity',
        verbose_name='Юрлицо',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='orders',
        help_text='Юридическое лицо, на которое выставляется счет'
    )

    # Контактное лицо (сотрудник)
    contact_person = models.ForeignKey(
        'baza_klientov.ContactPerson',
        verbose_name='Сотрудник',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='orders',
        help_text='Контактное лицо со стороны клиента'
    )

    # ===== СТАТУСЫ ЗАКАЗА =====
    # Те же четыре статуса, что на странице /counter/ —
    # единый набор для всей системы.
    STATUS_ACCEPTED     = 'accepted'       # Принят — статус по умолчанию
    STATUS_IN_PROGRESS  = 'in_progress'    # В работе
    STATUS_READY        = 'ready'          # Готов
    STATUS_COMPLETED    = 'completed'      # Выдан

    STATUS_CHOICES = [
        (STATUS_ACCEPTED,    'Принят'),
        (STATUS_IN_PROGRESS, 'В работе'),
        (STATUS_READY,       'Готов'),
        (STATUS_COMPLETED,   'Выдан'),
    ]

    # Статус заказа. По умолчанию — «Принят».
    status = models.CharField(
        verbose_name='Статус заказа',
        max_length=20,
        choices=STATUS_CHOICES,
        default=STATUS_ACCEPTED,
        help_text='Текущее состояние заказа'
    )

    # ===== БЛОК ОПЛАТЫ =====
    
    # Флаг: оплачен заказ или нет
    is_paid = models.BooleanField(
        verbose_name='Оплачен',
        default=False,
        help_text='Отметьте, если заказ оплачен'
    )

    # Тип плательщика: Юр.лицо или Физ.лицо
    PAYER_TYPE_CHOICES = [
        ('', '— Не выбран —'),
        ('legal', 'Юр.лицо'),
        ('individual', 'Физ.лицо'),
    ]
    payer_type = models.CharField(
        verbose_name='Тип плательщика',
        max_length=20,
        choices=PAYER_TYPE_CHOICES,
        blank=True,
        default='',
        help_text='Юридическое или физическое лицо'
    )

    # Номер счёта (заполняется, если выбран Юр.лицо)
    invoice_number = models.CharField(
        verbose_name='Счёт №',
        max_length=50,
        blank=True,
        default='',
        help_text='Номер счёта для юридического лица'
    )

    # Способ оплаты (заполняется, если выбрано Физ.лицо)
    PAYMENT_METHOD_CHOICES = [
        ('', '— Не выбран —'),
        ('card', 'Карта'),
        ('yookassa', 'ЮKassa'),
        ('cash', 'Наличные'),
    ]
    payment_method = models.CharField(
        verbose_name='Способ оплаты',
        max_length=20,
        choices=PAYMENT_METHOD_CHOICES,
        blank=True,
        default='',
        help_text='Способ оплаты для физического лица'
    )
    # Статус документов
    DOCUMENTS_STATUS_CHOICES = [
        ('none', 'Не выданы'),
        ('issued', 'Выданы'),
        ('edo', 'В ЭДО'),
    ]
    documents_status = models.CharField(
        verbose_name='Статус документов',
        max_length=20,
        choices=DOCUMENTS_STATUS_CHOICES,
        default='none',
        help_text='Статус закрывающих документов'
    )

    # ===== БЛОК ДОСТАВКИ =====
    
    # Флаг: есть доставка или нет
    is_delivery = models.BooleanField(
        verbose_name='С доставкой',
        default=False,
        help_text='Отметьте, если заказу требуется доставка'
    )

    # Дата доставки (может быть пустой)
    delivery_date = models.DateField(
        verbose_name='Дата доставки',
        null=True,
        blank=True,
        help_text='Планируемая дата доставки'
    )

    # Адрес доставки
    delivery_address = models.CharField(
        verbose_name='Адрес доставки',
        max_length=255,
        blank=True,
        default='',
        help_text='Куда доставлять заказ'
    )
    # Телефон получателя для доставки
    delivery_phone = models.CharField(
        verbose_name='Телефон для доставки',
        max_length=50,
        blank=True,
        default='',
        help_text='Контактный телефон получателя'
    )

    # Статус доставки
    DELIVERY_STATUS_CHOICES = [
        ('pending', 'Доставляется'),
        ('delivered', 'Доставлен'),
    ]
    delivery_status = models.CharField(
        verbose_name='Статус доставки',
        max_length=20,
        choices=DELIVERY_STATUS_CHOICES,
        default='pending',
        help_text='Текущий статус доставки'
    )

    # Дата и время готовности.
    # Дефолт — 15:00 следующего рабочего дня (см. default_ready_datetime).
    # Поле обязательное: заказ всегда имеет срок, даже если создан из просчёта.
    ready_datetime = models.DateTimeField(
        verbose_name='Дата и время готовности',
        default=default_ready_datetime,
        help_text='По умолчанию — 15:00 следующего рабочего дня'
    )


    # Свободный комментарий к заказу (необязательный).
    comment = models.TextField(
        verbose_name='Комментарий',
        blank=True,                                      # Разрешаем пустое значение в форме
        default='',                                      # По умолчанию пустая строка
        help_text='Необязательное текстовое пояснение к заказу'
    )

    # Пользователь, создавший заказ (для истории).
    # SET_NULL — при удалении пользователя заказ остаётся, поле обнуляется.
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,                        # Ссылка на модель пользователя проекта
        verbose_name='Создал',
        on_delete=models.SET_NULL,
        null=True,                                       # Может быть пустым
        blank=True,
        related_name='created_orders',                   # user.created_orders.all()
        help_text='Пользователь, создавший заказ'
    )

    # Метка создания — проставляется один раз при первом сохранении.
    created_at = models.DateTimeField(
        verbose_name='Дата создания',
        auto_now_add=True
    )

    # Метка обновления — обновляется при каждом сохранении.
    updated_at = models.DateTimeField(
        verbose_name='Дата обновления',
        auto_now=True
    )

    # Мягкое удаление (как в других приложениях проекта).
    # Заказы не удаляются физически — скрываются фильтром is_deleted=False.
    is_deleted = models.BooleanField(
        verbose_name='Удалён',
        default=False,
        help_text='Помечает заказ как удалённый'
    )

    class Meta:
        # Имя модели в админке (единственное и множественное число).
        verbose_name = 'Заказ'
        verbose_name_plural = 'Заказы'
        # Сортировка по умолчанию — новые сверху.
        ordering = ['-created_at']

    def __str__(self):
        """
        Строковое представление заказа: «ORD-5: ООО Ромашка».
        Используется в админке, выпадающих списках и логах.
        """
        # Если клиент задан — приписываем его имя.
        if self.client:
            return f"{self.number}: {self.client.name}"
        # Иначе — только номер (на случай, если клиент недоступен).
        return f"{self.number}"


    def get_working_hours_remaining(self):
        """
        Рассчитывает количество рабочих часов до готовности заказа.
        Рабочий график: Пн-Пт с 10:00 до 18:00.
        Выходные и нерабочие часы не учитываются.
        """
        # timezone.now() возвращает время в UTC. 
        # Переводим его в московское (Europe/Moscow), чтобы часы совпадали с реальными.
        now = timezone.localtime(timezone.now())
        
        # Время готовности тоже переводим в московское для корректного сравнения
        ready_dt = timezone.localtime(self.ready_datetime)
        
        # Если время готовности уже прошло — возвращаем 0
        if now >= ready_dt:
            return 0
        
        total_hours = 0
        current = now
        
        # Идём по часам от текущего момента до времени готовности
        while current < ready_dt:
            day_of_week = current.weekday()  # 0 - Пн, 6 - Вс
            hour = current.hour
            
            # Если это будний день (Пн-Пт) и время с 10 до 18 — плюсуем час
            if day_of_week < 5 and 10 <= hour < 18:
                total_hours += 1
            
            current += timedelta(hours=1)
            
        return total_hours

    def save(self, *args, **kwargs):
        """
        Переопределённый метод сохранения.
        Генерирует номер ORD-N, если поле number пустое.
        """
        # Если номер не задан (пустая строка или None) — сгенерировать.
        if not self.number or self.number.strip() == '':
            try:
                # Находим все существующие номера, начинающиеся с "ORD-".
                existing = Order.objects.filter(
                    number__startswith='ORD-'
                ).exclude(
                    number__exact=''
                ).exclude(
                    number__isnull=True
                ).values_list('number', flat=True)

                # Ищем максимальное число среди номеров.
                max_num = 0
                for num_str in existing:
                    try:
                        # Отрезаем префикс "ORD-" и берём число.
                        num_part = num_str.split('-')[1]
                        current_num = int(num_part)
                        if current_num > max_num:
                            max_num = current_num
                    except (ValueError, IndexError, AttributeError):
                        # Если строка битая — просто пропускаем её.
                        continue

                # Формируем следующий номер.
                self.number = f"ORD-{max_num + 1}"
            except Exception:
                # Запасной вариант — просто количество + 1.
                self.number = f"ORD-{Order.objects.count() + 1}"

        # Вызываем оригинальный save() — сохраняем в БД.
        super().save(*args, **kwargs)

    @property
    def total_price(self):
        """
        Общая стоимость заказа (вычисляемое поле, не хранится в БД).
        Сумма total_price всех НЕ удалённых изделий заказа.
        """
        # Decimal('0.00') — точный нуль для финансовых расчётов.
        total = Decimal('0.00')
        # Перебираем изделия, фильтруя удалённые.
        for product in self.products.filter(is_deleted=False):
            total += product.total_price
        return total

    @property
    def formatted_total_price(self):
        """Общая стоимость с символом ₽ и двумя знаками после запятой."""
        return f"{self.total_price:.2f} ₽"


# ============================================================================
# МОДЕЛЬ 2: ИЗДЕЛИЕ (PRODUCT)
# ============================================================================

class Product(models.Model):
    """
    Изделие — замороженный снимок просчёта.
    Все характеристики (компоненты, работы, ламинация, вычисления листов)
    скопированы в отдельные таблицы-снимки; итоговая цена зафиксирована
    в поле total_price и больше не пересчитывается автоматически.
    """

    # Ссылка на заказ. Обязательная. При удалении заказа изделия удаляются каскадом.
    order = models.ForeignKey(
        Order,
        verbose_name='Заказ',
        on_delete=models.CASCADE,
        related_name='products',                        # order.products.all()
        help_text='Заказ, к которому относится изделие'
    )

    # Исходный просчёт — из которого изделие было создано.
    # SET_NULL: при удалении просчёта изделие остаётся, ссылка обнуляется.
    source_proschet = models.ForeignKey(
        'calculator.Proschet',
        verbose_name='Исходный просчёт',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_products',                 # proschet.created_products.all()
        help_text='Просчёт, из которого было создано изделие'
    )

    # Исходный шаблон — если просчёт, из которого создано изделие,
    # в свою очередь создавался из шаблона. Храним для трассировки цепочки.
    source_template = models.ForeignKey(
        'shablony_proschetov.ProschetTemplate',
        verbose_name='Исходный шаблон',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_products',                 # template.created_products.all()
        help_text='Шаблон, из которого (через просчёт) создано изделие'
    )

    # Название изделия — копируется из proschet.title на момент создания.
    title = models.CharField(
        verbose_name='Название изделия',
        max_length=200,
        help_text='Название, скопированное из просчёта'
    )

    # Тираж — фиксируется на момент создания изделия.
    circulation = models.PositiveIntegerField(
        verbose_name='Тираж',
        default=1,
        help_text='Количество экземпляров, зафиксированное в момент создания'
    )

    # ИТОГОВАЯ ЗАМОРОЖЕННАЯ ЦЕНА изделия.
    # Копируется из proschet.total_price на момент создания и НЕ меняется
    # автоматически при изменении справочников.
    total_price = models.DecimalField(
        verbose_name='Итоговая стоимость',
        max_digits=12,                                   # До 10 знаков до запятой — с большим запасом
        decimal_places=2,                                # Копейки
        default=Decimal('0.00'),
        help_text='Замороженная стоимость изделия на момент создания'
    )

    # ===== ЗАМОРОЖЕННЫЕ МАССА И ОБЪЁМ =====
    # Считаются один раз при создании изделия через общую функцию
    # calculator.utils_mass_volume.calculate_mass_and_volume — чтобы
    # формулы жили в одном месте, а результат не менялся с течением времени.

    # Общая масса изделия (г) на момент создания — с учётом +2% на краску/упаковку.
    frozen_total_mass_g = models.DecimalField(
        verbose_name='Общая масса, г',
        max_digits=14,
        decimal_places=2,
        default=Decimal('0.00'),
        help_text='Замороженная масса изделия (г) на момент создания'
    )

    # Общий объём изделия (см³) на момент создания.
    frozen_total_volume_cm3 = models.DecimalField(
        verbose_name='Общий объём, см³',
        max_digits=14,
        decimal_places=2,
        default=Decimal('0.00'),
        help_text='Замороженный объём изделия (см³) на момент создания'
    )

    # Список стопок по компонентам — снимок на момент создания.
    # Хранится как JSON: [{label, width_mm, height_mm, stack_height_mm, valid}, ...].
    frozen_stacks = models.JSONField(
        verbose_name='Размеры стопок',
        default=list,
        blank=True,
        help_text='Замороженный список стопок по компонентам на момент создания'
    )

    # Метка создания изделия.
    created_at = models.DateTimeField(
        verbose_name='Дата создания',
        auto_now_add=True
    )

    # Метка обновления.
    updated_at = models.DateTimeField(
        verbose_name='Дата обновления',
        auto_now=True
    )

    # Мягкое удаление.
    is_deleted = models.BooleanField(
        verbose_name='Удалён',
        default=False
    )

    class Meta:
        verbose_name = 'Изделие'
        verbose_name_plural = 'Изделия'
        # Сортировка — по дате создания (старые сверху, чтобы номера шли по порядку).
        ordering = ['created_at']

    def __str__(self):
        """Строковое представление: «Изделие #12: Визитки 1000 шт»."""
        return f"Изделие #{self.id}: {self.title} ({self.circulation} шт.)"

    @property
    def formatted_total_price(self):
        """Форматированная цена с ₽."""
        return f"{self.total_price:.2f} ₽"


# ============================================================================
# МОДЕЛЬ 3: СНИМОК ПЕЧАТНОГО КОМПОНЕНТА
# ============================================================================

class ProductPrintComponent(models.Model):
    """
    Снимок одного печатного компонента внутри изделия.
    Структурно повторяет calculator.PrintComponent, но:
    - ссылается на Product, а не на Proschet;
    - числовые результаты (sheet_count, runs_count, total_circulation_price,
      material_price) сохранены как поля-снимки.
    """

    # Ссылка на изделие. Каскадное удаление вместе с изделием.
    product = models.ForeignKey(
        Product,
        verbose_name='Изделие',
        on_delete=models.CASCADE,
        related_name='components',                       # product.components.all()
        help_text='Изделие, к которому относится компонент'
    )

    # Порядковый номер компонента внутри изделия (для стабильной сортировки).
    position = models.PositiveIntegerField(
        verbose_name='Порядок',
        default=0,
        help_text='Чем меньше число, тем выше компонент в списке'
    )

    # Копия номера компонента из просчёта (например, KP-42).
    number = models.CharField(
        verbose_name='Номер компонента',
        max_length=20,
        blank=True,
        default='',
        help_text='Номер из исходного просчёта (KP-N)'
    )

    # Принтер. SET_NULL — при удалении принтера компонент остаётся.
    printer = models.ForeignKey(
        'devices.Printer',
        verbose_name='Принтер',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='product_components',               # printer.product_components.all()
        help_text='Принтер, выбранный для этого компонента'
    )

    # Бумага (sklad.Material, type='paper').
    paper = models.ForeignKey(
        'sklad.Material',
        verbose_name='Бумага',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='product_components',
        limit_choices_to={'type': 'paper'},              # В выпадающем списке — только бумага
        help_text='Бумага, выбранная для этого компонента'
    )

    # Тип печати (цветная / ч/б) — choices берём из PrintComponent.
    print_type = models.CharField(
        verbose_name='Тип печати',
        max_length=10,
        choices=PrintComponent.PRINT_TYPE_CHOICES,
        default='color'
    )

    # Режим печати (односторонняя / двусторонняя) — choices из PrintComponent.
    printing_mode = models.CharField(
        verbose_name='Режим печати',
        max_length=10,
        choices=PrintComponent.PRINT_MODE_CHOICES,
        default='single'
    )

    # Цветность (4+0, 4+4 и т.п.) — свободная строка.
    color_mode = models.CharField(
        verbose_name='Цветность',
        max_length=10,
        default='4+0'
    )

    # Цена за лист, зафиксированная на момент создания изделия.
    price_per_sheet = models.DecimalField(
        verbose_name='Цена за лист, ₽',
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        help_text='Замороженная цена печати одного листа'
    )

    # Флаг «цена рассчитана автоматически» (переносим как есть).
    is_price_calculated = models.BooleanField(
        verbose_name='Цена рассчитана автоматически',
        default=False
    )

    # Общая стоимость компонента за весь тираж (замороженная).
    total_circulation_price = models.DecimalField(
        verbose_name='Общая стоимость компонента, ₽',
        max_digits=12,
        decimal_places=2,
        default=Decimal('0.00')
    )

    # ===== СНИМКИ ВЫЧИСЛЯЕМЫХ ЗНАЧЕНИЙ =====
    # В calculator.PrintComponent это свойства (пересчитываются каждый раз).
    # Здесь сохраняем их как поля, чтобы цена была по-настоящему заморожена.

    # Количество листов (из одностраничного или многостраничного расчёта).
    sheet_count = models.DecimalField(
        verbose_name='Количество листов (снимок)',
        max_digits=12,
        decimal_places=2,
        default=Decimal('0.00'),
        help_text='Количество листов на момент создания изделия'
    )

    # Количество прогонов принтера (учитывает двусторонность).
    runs_count = models.PositiveIntegerField(
        verbose_name='Количество прогонов (снимок)',
        default=0,
        help_text='Количество прогонов принтера на момент создания изделия'
    )

    # Цена материала (бумаги) за лист — снимок.
    material_price = models.DecimalField(
        verbose_name='Цена бумаги за лист, ₽',
        max_digits=10,
        decimal_places=2,
        default=Decimal('0.00'),
        help_text='Цена бумаги за лист на момент создания изделия'
    )

    # Плотность бумаги (г/м²) — снимок, для расчёта массы.
    paper_density = models.DecimalField(
        verbose_name='Плотность бумаги, г/м²',
        max_digits=10,
        decimal_places=2,
        default=Decimal('0.00'),
        help_text='Плотность бумаги (г/м²) на момент создания изделия'
    )

    # Толщина бумаги (мм) — снимок, для расчёта объёма и размера стопки.
    paper_thickness = models.DecimalField(
        verbose_name='Толщина бумаги, мм',
        max_digits=10,
        decimal_places=4,
        default=Decimal('0.0000'),
        help_text='Толщина бумаги (мм) на момент создания изделия'
    )


    # Метка создания снимка.
    created_at = models.DateTimeField(
        verbose_name='Дата создания',
        auto_now_add=True
    )

    class Meta:
        verbose_name = 'Компонент печати (изделие)'
        verbose_name_plural = 'Компоненты печати (изделие)'
        ordering = ['position', 'id']

    def __str__(self):
        """Строковое представление: «KP-42: Xerox / Меловка 350 г»."""
        printer = self.printer.name if self.printer else '—'
        paper = self.paper.name if self.paper else '—'
        return f"{self.number or '#' + str(self.position)}: {printer} / {paper}"

    @property
    def formatted_total_circulation_price(self):
        """Форматированная цена с ₽."""
        return f"{self.total_circulation_price:.2f} ₽"


# ============================================================================
# МОДЕЛЬ 4: СНИМОК ДОПОЛНИТЕЛЬНОЙ РАБОТЫ
# ============================================================================

class ProductAdditionalWork(models.Model):
    """
    Снимок одной дополнительной работы внутри компонента изделия.
    Структурно повторяет calculator.AdditionalWork, но с замороженной
    итоговой ценой (total_price).
    """

    # Ссылка на компонент изделия.
    product_component = models.ForeignKey(
        ProductPrintComponent,
        verbose_name='Компонент изделия',
        on_delete=models.CASCADE,
        related_name='works',                            # component.works.all()
        help_text='Компонент, к которому относится эта работа'
    )

    # Ссылка на работу из справочника (может отсутствовать).
    work = models.ForeignKey(
        'spravochnik_dopolnitelnyh_rabot.Work',
        verbose_name='Работа из справочника',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='product_works',
        help_text='Справочная работа, по которой создавался снимок'
    )

    # Копия номера работы из просчёта (например, DR-7).
    number = models.CharField(
        verbose_name='Номер работы',
        max_length=20,
        blank=True,
        default='',
        help_text='Номер из исходного просчёта (DR-N)'
    )

    # Название работы.
    title = models.CharField(
        verbose_name='Название работы',
        max_length=200
    )

    # Себестоимость единицы (без наценки) — снимок.
    cost = models.DecimalField(
        verbose_name='Себестоимость, ₽',
        max_digits=10,
        decimal_places=2,
        default=Decimal('0.00')
    )

    # Наценка в процентах — снимок.
    markup_percent = models.DecimalField(
        verbose_name='Наценка, %',
        max_digits=5,
        decimal_places=2,
        default=Decimal('0.00')
    )

    # Базовая цена — снимок.
    price = models.DecimalField(
        verbose_name='Цена, ₽',
        max_digits=10,
        decimal_places=2,
        default=Decimal('0.00')
    )

    # Количество единиц работы.
    quantity = models.PositiveIntegerField(
        verbose_name='Количество',
        default=1
    )

    # Тип формулы (1–6) — choices из справочника.
    formula_type = models.PositiveSmallIntegerField(
        verbose_name='Формула расчёта',
        choices=Work.FORMULA_CHOICES,
        default=1
    )

    # Количество линий реза (для формул 3 и 4).
    lines_count = models.PositiveIntegerField(
        verbose_name='Линий реза',
        default=1
    )

    # Количество изделий на листе (для формул 5 и 6).
    items_per_sheet = models.PositiveIntegerField(
        verbose_name='Изделий на листе',
        default=1
    )

    # ЗАМОРОЖЕННАЯ итоговая стоимость работы.
    total_price = models.DecimalField(
        verbose_name='Общая стоимость, ₽',
        max_digits=12,
        decimal_places=2,
        default=Decimal('0.00'),
        help_text='Зафиксированная стоимость работы на момент создания изделия'
    )

    # Метка создания.
    created_at = models.DateTimeField(
        verbose_name='Дата создания',
        auto_now_add=True
    )

    # Мягкое удаление (для консистентности с оригиналом).
    is_deleted = models.BooleanField(
        verbose_name='Удалён',
        default=False
    )

    class Meta:
        verbose_name = 'Дополнительная работа (изделие)'
        verbose_name_plural = 'Дополнительные работы (изделие)'
        ordering = ['id']

    def __str__(self):
        """Строковое представление: «DR-7: Биговка»."""
        return f"{self.number or '—'}: {self.title}"


# ============================================================================
# МОДЕЛЬ 5: СНИМОК ЛАМИНАЦИИ
# ============================================================================

class ProductLaminate(models.Model):
    """
    Снимок ламинации для компонента изделия.
    Один-к-одному с ProductPrintComponent, как и в calculator.Laminate.
    Все рассчитанные стоимости сохранены как поля.
    """

    # Ссылка на компонент (1:1).
    product_component = models.OneToOneField(
        ProductPrintComponent,
        verbose_name='Компонент изделия',
        on_delete=models.CASCADE,
        related_name='lamination',                       # component.lamination
        help_text='Компонент, к которому привязана ламинация'
    )

    # Включена ли ламинация.
    is_enabled = models.BooleanField(
        verbose_name='Ламинация включена',
        default=False
    )

    # Сторона ламинации — choices из calculator.Laminate.
    side = models.CharField(
        verbose_name='Сторона ламинации',
        max_length=10,
        choices=Laminate.SIDE_CHOICES,
        default='single'
    )

    # Ламинатор (devices.Laminator).
    laminator = models.ForeignKey(
        'devices.Laminator',
        verbose_name='Ламинатор',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='product_laminations',
        help_text='Ламинатор, выбранный для этого компонента'
    )

    # Плёнка (sklad.Material, type='film').
    film = models.ForeignKey(
        'sklad.Material',
        verbose_name='Плёнка',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='product_laminations',
        limit_choices_to={'type': 'film'},
        help_text='Плёнка, выбранная для ламинации'
    )

    # ===== СНИМКИ РАСЧЁТНЫХ ЗНАЧЕНИЙ =====

    # Себестоимость работы ламинатора за лист (снимок).
    laminator_cost = models.DecimalField(
        verbose_name='Себестоимость ламинатора, ₽/лист',
        max_digits=10,
        decimal_places=2,
        default=Decimal('0.00')
    )

    # Наценка ламинатора (%) — снимок.
    laminator_markup = models.DecimalField(
        verbose_name='Наценка ламинатора, %',
        max_digits=5,
        decimal_places=2,
        default=Decimal('0.00')
    )

    # Итоговая цена ламинатора за лист — снимок.
    laminator_price = models.DecimalField(
        verbose_name='Цена ламинатора, ₽/лист',
        max_digits=10,
        decimal_places=2,
        default=Decimal('0.00')
    )

    # Цена плёнки за лист — снимок.
    film_price = models.DecimalField(
        verbose_name='Цена плёнки, ₽/лист',
        max_digits=10,
        decimal_places=2,
        default=Decimal('0.00')
    )
    # Толщина плёнки (мкм) — снимок, для расчёта массы/объёма и размера стопки.
    film_thickness = models.DecimalField(
        verbose_name='Толщина плёнки, мкм',
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        help_text='Толщина плёнки (мкм) на момент создания изделия'
    )



    # Общая стоимость ламинации для всего тиража — снимок.
    total_price = models.DecimalField(
        verbose_name='Общая стоимость ламинации, ₽',
        max_digits=12,
        decimal_places=2,
        default=Decimal('0.00')
    )

    # Метки времени.
    created_at = models.DateTimeField(
        verbose_name='Дата создания',
        auto_now_add=True
    )
    updated_at = models.DateTimeField(
        verbose_name='Дата обновления',
        auto_now=True
    )

    class Meta:
        verbose_name = 'Ламинация (изделие)'
        verbose_name_plural = 'Ламинации (изделие)'

    def __str__(self):
        """Строковое представление ламинации."""
        if self.is_enabled and self.laminator and self.film:
            return f"Ламинация: {self.laminator.name} + {self.film.name}"
        return "Ламинация (выключена)"


# ============================================================================
# МОДЕЛЬ 6: СНИМОК ОДНОСТРАНИЧНОГО РАСЧЁТА ЛИСТОВ
# ============================================================================

class ProductVichisliniya(models.Model):
    """
    Снимок одностраничного расчёта листов для компонента изделия.
    Повторяет vichisliniya_listov.VichisliniyaListovModel один-в-один
    по структуре полей, включая polosa_count, cuts_count и все fit_*.
    Хранит и входные параметры (размеры, зазор, ориентация), и вычисленные
    результаты (list_count, cuts_count), зафиксированные на момент создания.
    """

    # Ссылка на компонент (1:1).
    product_component = models.OneToOneField(
        ProductPrintComponent,
        verbose_name='Компонент изделия',
        on_delete=models.CASCADE,
        related_name='vichisliniya',                     # component.vichisliniya
        help_text='Компонент, к которому привязан одностраничный расчёт'
    )

    # Зазор (вылеты) между изделиями (мм).
    vyleta = models.PositiveIntegerField(
        verbose_name='Зазор, мм',
        default=1
    )

    # Количество полос (в оригинале — input-параметр, сохраняем как есть).
    polosa_count = models.PositiveIntegerField(
        verbose_name='Количество полос',
        default=1
    )

    # Цветность — choices из оригинальной модели.
    color = models.CharField(
        verbose_name='Цветность',
        max_length=10,
        choices=VichisliniyaListovModel.VICHISLINIYA_LISTOV_COLOR_CHOICES,
        default='4+0'
    )

    # Размеры одного изделия (мм).
    item_width = models.DecimalField(
        verbose_name='Ширина изделия, мм',
        max_digits=6,
        decimal_places=2,
        default=Decimal('90.00')
    )
    item_height = models.DecimalField(
        verbose_name='Высота изделия, мм',
        max_digits=6,
        decimal_places=2,
        default=Decimal('50.00')
    )

    # Поля размещения изделий на листе (снимок рассчитанных значений).
    fit_horizontal = models.PositiveIntegerField(verbose_name='По горизонтали', default=0)
    fit_vertical = models.PositiveIntegerField(verbose_name='По вертикали', default=0)
    fit_total = models.PositiveIntegerField(verbose_name='Всего на листе', default=0)
    fit_landscape_total = models.PositiveIntegerField(verbose_name='Альбомная ориентация', default=0)
    fit_portrait_total = models.PositiveIntegerField(verbose_name='Портретная ориентация', default=0)

    # Выбранная ориентация — choices из оригинала.
    fit_selected_orientation = models.CharField(
        verbose_name='Выбранная ориентация',
        max_length=10,
        choices=VichisliniyaListovModel.VICHISLINIYA_LISTOV_ORIENTATION_CHOICES,
        default='auto'
    )

    # Количество листов — СНИМОК. Это ключевой замороженный результат.
    list_count = models.DecimalField(
        verbose_name='Количество листов (снимок)',
        max_digits=12,
        decimal_places=2,
        default=Decimal('0.00')
    )

    # Количество резов — СНИМОК.
    cuts_count = models.PositiveIntegerField(
        verbose_name='Количество резов (снимок)',
        default=0
    )

    # Метка создания.
    created_at = models.DateTimeField(
        verbose_name='Дата создания',
        auto_now_add=True
    )

    class Meta:
        verbose_name = 'Вычисление листов (изделие, одностраничное)'
        verbose_name_plural = 'Вычисления листов (изделие, одностраничное)'

    def __str__(self):
        """Строковое представление."""
        return f"Одностраничное: {self.item_width}×{self.item_height} мм"


# ============================================================================
# МОДЕЛЬ 7: СНИМОК МНОГОСТРАНИЧНОГО РАСЧЁТА ЛИСТОВ
# ============================================================================

class ProductMultipage(models.Model):
    """
    Снимок многостраничного расчёта (брошюры) для компонента изделия.
    Повторяет vichisliniya_listov.VichisliniyaMultipageModel один-в-один
    по структуре полей, включая binding, booklet_orientation, sheet_count,
    is_active.
    """

    # Ссылка на компонент (1:1).
    product_component = models.OneToOneField(
        ProductPrintComponent,
        verbose_name='Компонент изделия',
        on_delete=models.CASCADE,
        related_name='multipage',                        # component.multipage
        help_text='Компонент, к которому привязан многостраничный расчёт'
    )

    # Способ скрепления (MultipageBinding).
    binding = models.ForeignKey(
        'vichisliniya_listov.MultipageBinding',
        verbose_name='Способ скрепления',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='product_multipages',
        help_text='Способ скрепления брошюры'
    )

    # Количество страниц в готовой брошюре.
    total_pages = models.PositiveIntegerField(
        verbose_name='Количество страниц',
        default=4
    )

    # Количество экземпляров.
    copies = models.PositiveIntegerField(
        verbose_name='Количество экземпляров',
        default=1
    )

    # Размеры страницы (мм).
    finished_width = models.DecimalField(
        verbose_name='Ширина страницы, мм',
        max_digits=6,
        decimal_places=2,
        default=Decimal('210.00')
    )
    finished_height = models.DecimalField(
        verbose_name='Высота страницы, мм',
        max_digits=6,
        decimal_places=2,
        default=Decimal('297.00')
    )

    # Зазор (мм).
    vyleta = models.PositiveIntegerField(
        verbose_name='Зазор, мм',
        default=1
    )

    # Цветность — choices из оригинала.
    color = models.CharField(
        verbose_name='Цветность',
        max_length=10,
        choices=VichisliniyaListovModel.VICHISLINIYA_LISTOV_COLOR_CHOICES,
        default='4+0'
    )

    # Ориентация брошюры — choices из Multipage.
    booklet_orientation = models.CharField(
        verbose_name='Ориентация брошюры',
        max_length=10,
        choices=VichisliniyaMultipageModel.ORIENTATION_CHOICES,
        default='portrait'
    )

    # Размещение страниц на листе (снимок).
    fit_horizontal = models.PositiveIntegerField(verbose_name='По горизонтали', default=0)
    fit_vertical = models.PositiveIntegerField(verbose_name='По вертикали', default=0)
    fit_total = models.PositiveIntegerField(verbose_name='Всего на одной стороне', default=0)
    fit_landscape_total = models.PositiveIntegerField(verbose_name='Альбомная ориентация', default=0)
    fit_portrait_total = models.PositiveIntegerField(verbose_name='Портретная ориентация', default=0)

    # Выбранная ориентация размещения.
    fit_selected_orientation = models.CharField(
        verbose_name='Выбранная ориентация',
        max_length=10,
        choices=VichisliniyaListovModel.VICHISLINIYA_LISTOV_ORIENTATION_CHOICES,
        default='auto'
    )

    # Количество листов — СНИМОК.
    sheet_count = models.DecimalField(
        verbose_name='Количество листов (снимок)',
        max_digits=12,
        decimal_places=2,
        default=Decimal('0.00')
    )

    # Был ли активен многостраничный режим в момент снимка.
    is_active = models.BooleanField(
        verbose_name='Многостраничный режим активен',
        default=False
    )

    # Метка создания.
    created_at = models.DateTimeField(
        verbose_name='Дата создания',
        auto_now_add=True
    )

    class Meta:
        verbose_name = 'Вычисление листов (изделие, многостраничное)'
        verbose_name_plural = 'Вычисления листов (изделие, многостраничное)'

    def __str__(self):
        """Строковое представление."""
        return f"Многостраничное: {self.total_pages} стр."