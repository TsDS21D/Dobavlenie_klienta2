# web_calculators/models.py
"""
Модели приложения "Веб-калькуляторы для сайтов".

Это приложение описывает публичные калькуляторы, которые будут размещены
на внешних сайтах (например, bukva-a.ru). Каждый калькулятор — это
описание того, что можно заказать на этом конкретном калькуляторе:
какой принтер используется, какие бумаги, плёнки, работы допустимы,
в каких границах клиент может задать размер и тираж.

СОСТАВ МОДЕЛЕЙ:
1. WebCalculator            — сам калькулятор (визитки, листовки, брошюры).
2. WebCalculatorComponent   — печатный компонент внутри калькулятора
                              (у брошюры их может быть несколько — обложка, блок).
3. WebCalculatorSizePreset  — пресеты размеров (90×50, 85×55 и т.п.).

Плюс правка в существующей модели MultipageBinding (в приложении
vichisliniya_listov) — добавлено поле default_work, чтобы при выборе
способа скрепления автоматически подставлялась нужная работа.

ВСЕ КОММЕНТАРИИ К КАЖДОЙ СТРОКЕ — чтобы новичкам было понятно.
"""

# ===== СТАНДАРТНЫЕ ИМПОРТЫ =====
from decimal import Decimal                     # Для точных числовых значений
from django.db import models                    # Базовый модуль моделей Django
from django.core.validators import MinValueValidator  # Валидатор «не меньше нуля»

# ===== ИМПОРТЫ МОДЕЛЕЙ ИЗ ДРУГИХ ПРИЛОЖЕНИЙ =====
# Эти приложения (devices, sklad, spravochnik) не зависят от web_calculators,
# поэтому циклических импортов не возникнет.
from devices.models import Printer                                            # Принтеры
from sklad.models import Material                                             # Материалы (бумага, плёнка)
from spravochnik_dopolnitelnyh_rabot.models import Work                       # Доп. работы
# Ссылки на MultipageBinding и PrintPrice делаем строками — чтобы не плодить
# импорты и избежать возможных циклических зависимостей в будущем.


# ============================================================================
# МОДЕЛЬ 1: ВЕБ-КАЛЬКУЛЯТОР
# ============================================================================

class WebCalculator(models.Model):
    """
    Один публичный калькулятор на внешнем сайте.
    Например, "Простые визитки" (slug: vizitki) или "Брошюры A4" (slug: broshyury-a4).
    """

    # ===== ВАРИАНТЫ ТИПА ИЗДЕЛИЯ =====
    # Эти значения определяют, как считать листы:
    # - single   — одностраничное изделие (одна страница = один лист)
    # - multipage — многостраничное (брошюра), количество листов зависит
    #               от выбранного способа скрепления и кратности страниц
    PRODUCT_TYPE_SINGLE = 'single'
    PRODUCT_TYPE_MULTIPAGE = 'multipage'
    PRODUCT_TYPE_CHOICES = [
        (PRODUCT_TYPE_SINGLE, 'Одностраничное изделие'),
        (PRODUCT_TYPE_MULTIPAGE, 'Многостраничное изделие (брошюра)'),
    ]

    # Название калькулятора — то, что видит админ в списке.
    name = models.CharField(
        verbose_name='Название калькулятора',
        max_length=200,
        help_text='Например: "Простые визитки", "Листовки А5", "Брошюры А4 на скрепку"',
    )

    # Slug — короткое латинское имя для URL (используется в публичном API).
    # Должно быть уникальным. Например: vizitki, listovki, broshyury-a4.
    slug = models.SlugField(
        verbose_name='Идентификатор (slug)',
        max_length=100,
        unique=True,
        help_text='Латинскими буквами, без пробелов. Используется в URL: /web-calc/<slug>/',
    )

    # Тип изделия — одностраничный или многостраничный.
    product_type = models.CharField(
        verbose_name='Тип изделия',
        max_length=20,
        choices=PRODUCT_TYPE_CHOICES,
        default=PRODUCT_TYPE_SINGLE,
    )

    # Минимальный и максимальный тираж, который может заказать клиент.
    min_circulation = models.PositiveIntegerField(
        verbose_name='Минимальный тираж',
        default=50,
        validators=[MinValueValidator(1)],
    )
    max_circulation = models.PositiveIntegerField(
        verbose_name='Максимальный тираж',
        default=5000,
        validators=[MinValueValidator(1)],
    )

    # Тираж, который подставляется в калькуляторе по умолчанию.
    # При сохранении округляется до кратного circulation_step
    # и зажимается в [min_circulation, max_circulation].
    default_circulation = models.PositiveIntegerField(
        verbose_name='Тираж по умолчанию',
        default=100,
        validators=[MinValueValidator(1)],
        help_text='Значение, которое клиент увидит в калькуляторе при открытии',
    )

    # Шаг кратности тиража. Тираж должен быть кратен этому числу.
    # Например, для визиток — 50. Клиент может ввести 74, но при расчёте
    # тираж округлится до ближайшего кратного: 74 → 50, 75 → 100.
    circulation_step = models.PositiveIntegerField(
        verbose_name='Шаг тиража',
        default=50,
        validators=[MinValueValidator(1)],
        help_text='Тираж округляется до ближайшего кратного этому шагу',
    )



    # Включён ли калькулятор. Выключенные не отдаются в API.
    is_active = models.BooleanField(
        verbose_name='Активен',
        default=True,
        help_text='Если снять галочку — калькулятор перестанет отвечать на API-запросы',
    )

    # Свободный комментарий для админа (не показывается клиенту).
    comment = models.TextField(
        verbose_name='Комментарий',
        blank=True,
        default='',
    )

    # Порядок сортировки в админке.
    order = models.PositiveIntegerField(
        verbose_name='Порядок',
        default=0,
        help_text='Чем меньше число, тем выше калькулятор в списке',
    )

    # Служебные метки.
    created_at = models.DateTimeField(verbose_name='Дата создания', auto_now_add=True)
    updated_at = models.DateTimeField(verbose_name='Дата обновления', auto_now=True)

    def save(self, *args, **kwargs):
        """
        Переопределённый save():

        1. Округляет min_circulation и max_circulation до ближайших кратных
           circulation_step (min — вверх, max — вниз).
        2. Округляет default_circulation до ближайшего кратного шагу
           и зажимает его в границы [min_circulation, max_circulation].
        """
        step = self.circulation_step or 1

        if step > 0:
            # Округление min вверх до кратного: 1 → 50, 60 → 100.
            self.min_circulation = ((self.min_circulation + step - 1) // step) * step
            # Округление max вниз до кратного: 1024 → 1000.
            self.max_circulation = (self.max_circulation // step) * step
            # Защита от ситуации, когда после округления max < min.
            if self.max_circulation < self.min_circulation:
                self.max_circulation = self.min_circulation

            # Округление default до ближайшего кратного.
            if self.default_circulation:
                self.default_circulation = round(self.default_circulation / step) * step

        # Зажимаем default в границы.
        if self.default_circulation < self.min_circulation:
            self.default_circulation = self.min_circulation
        if self.default_circulation > self.max_circulation:
            self.default_circulation = (self.max_circulation // step) * step

        super().save(*args, **kwargs)



    class Meta:
        ordering = ['order', 'name']
        verbose_name = 'Веб-калькулятор'
        verbose_name_plural = 'Веб-калькуляторы'

    def __str__(self):
        return f"{self.name} ({self.slug})"


# ============================================================================
# МОДЕЛЬ 2: ПЕЧАТНЫЙ КОМПОНЕНТ ВЕБ-КАЛЬКУЛЯТОРА
# ============================================================================

class WebCalculatorComponent(models.Model):
    """
    Один печатный компонент внутри веб-калькулятора.

    Для визиток/листовок компонент обычно один. Для брошюр — два
    (обложка + внутренний блок), у каждого свой принтер, свои бумаги,
    своя цветность, свой диапазон размеров и своя ламинация.

    Дополнительные работы (включая скрепление) привязаны к конкретному
    компоненту — так же, как в основном калькуляторе beauty-print.ru.
    """

    # Ссылка на калькулятор.
    calculator = models.ForeignKey(
        WebCalculator,
        verbose_name='Калькулятор',
        on_delete=models.CASCADE,
        related_name='components',
    )

    # Название компонента (используется в интерфейсе сайта).
    name = models.CharField(
        verbose_name='Название компонента',
        max_length=100,
        default='Основной',
        help_text='Например: "Обложка", "Внутренний блок", "Основной"',
    )

    # Порядок отображения. Первый по порядку компонент — «ответственный»
    # за скрепление (для брошюр).
    order = models.PositiveIntegerField(
        verbose_name='Порядок',
        default=1,
    )

    # Принтер, на котором печатается этот компонент.
    printer = models.ForeignKey(
        Printer,
        verbose_name='Принтер',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='web_calculator_components',
    )

    # ===== РАЗРЕШЁННЫЕ КОМБИНАЦИИ ПЕЧАТИ =====
    # Четыре галочки: каждая означает, что клиент может выбрать эту комбинацию.
    # Клиент на сайте сначала выбирает цветность+сторонность из разрешённых.
    allow_color_single = models.BooleanField(
        verbose_name='Цветная односторонняя',
        default=False,
    )
    allow_color_duplex = models.BooleanField(
        verbose_name='Цветная двусторонняя',
        default=False,
    )
    allow_bw_single = models.BooleanField(
        verbose_name='Ч/б односторонняя',
        default=False,
    )
    allow_bw_duplex = models.BooleanField(
        verbose_name='Ч/б двусторонняя',
        default=False,
    )

    # ===== БУМАГИ, ДОСТУПНЫЕ КЛИЕНТУ =====
    # M2M — список материалов из склада с типом 'paper'.
    allowed_papers = models.ManyToManyField(
        Material,
        verbose_name='Доступные бумаги',
        blank=True,
        related_name='web_calculator_components_as_paper',
        limit_choices_to={'type': 'paper'},
        help_text='Материалы из склада с типом "бумага", которые клиент может выбрать',
    )

    # ===== ЛАМИНАЦИЯ =====
    # Флаг, разрешена ли ламинация вообще для этого компонента.
    # Если у компонента ламинация выключена — клиент на сайте её не увидит.
    lamination_enabled = models.BooleanField(
        verbose_name='Ламинация разрешена',
        default=False,
    )
    # Ламинатор, на котором выполняется ламинация этого компонента.
    # У одного компонента он один. Если у брошюры обложка ламинируется,
    # а блок — нет, то здесь поле заполняется только у обложки.
    laminator = models.ForeignKey(
        'devices.Laminator',
        verbose_name='Ламинатор',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='web_calculator_components',
        help_text='Заполняется только если ламинация разрешена',
    )
    # Если ламинация разрешена, эти два флага определяют доступные стороны.
    allow_lamination_single = models.BooleanField(
        verbose_name='Ламинация односторонняя',
        default=False,
    )
    allow_lamination_duplex = models.BooleanField(
        verbose_name='Ламинация двусторонняя',
        default=False,
    )
    # Список плёнок (материалы с типом 'film').
    allowed_films = models.ManyToManyField(
        Material,
        verbose_name='Доступные плёнки',
        blank=True,
        related_name='web_calculator_components_as_film',
        limit_choices_to={'type': 'film'},
        help_text='Материалы из склада с типом "плёнка", которые клиент может выбрать',
    )


    # ===== ДИАПАЗОН РАЗМЕРОВ =====
    # Клиент может задать ширину/высоту в этих границах (мм).
    min_width_mm = models.DecimalField(
        verbose_name='Мин. ширина (мм)',
        max_digits=6,
        decimal_places=2,
        default=Decimal('60.00'),
    )
    max_width_mm = models.DecimalField(
        verbose_name='Макс. ширина (мм)',
        max_digits=6,
        decimal_places=2,
        default=Decimal('120.00'),
    )
    min_height_mm = models.DecimalField(
        verbose_name='Мин. высота (мм)',
        max_digits=6,
        decimal_places=2,
        default=Decimal('40.00'),
    )
    max_height_mm = models.DecimalField(
        verbose_name='Макс. высота (мм)',
        max_digits=6,
        decimal_places=2,
        default=Decimal('120.00'),
    )

    # ===== СКРЕПЛЕНИЕ (для многостраничных изделий) =====
    # Заполняется только у того компонента, который «отвечает» за скрепление
    # (как правило, у обложки). У остальных компонентов пусто.
    binding = models.ForeignKey(
        'vichisliniya_listov.MultipageBinding',
        verbose_name='Способ скрепления',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='web_calculator_components',
        help_text='Только для многостраничных изделий. Заполняется у компонента-обложки.',
    )

    # ===== ДОПОЛНИТЕЛЬНЫЕ ПАРАМЕТРЫ ДЛЯ МНОГОСТРАНИЧНЫХ =====
    # Разрешённые ориентации брошюры.
    allow_booklet_portrait = models.BooleanField(
        verbose_name='Ориентация портретная разрешена',
        default=True,
    )
    allow_booklet_landscape = models.BooleanField(
        verbose_name='Ориентация альбомная разрешена',
        default=False,
    )
    # Диапазон допустимого количества страниц в брошюре.
    min_pages = models.PositiveIntegerField(
        verbose_name='Мин. страниц',
        default=4,
        validators=[MinValueValidator(1)],
    )
    max_pages = models.PositiveIntegerField(
        verbose_name='Макс. страниц',
        default=64,
        validators=[MinValueValidator(1)],
    )

    class Meta:
        ordering = ['calculator', 'order', 'id']
        verbose_name = 'Компонент веб-калькулятора'
        verbose_name_plural = 'Компоненты веб-калькулятора'

    def __str__(self):
        return f"{self.calculator.name} → {self.name}"


# ============================================================================
# МОДЕЛЬ 3: ПРЕСЕТ РАЗМЕРА
# ============================================================================

class WebCalculatorSizePreset(models.Model):
    """
    Готовый размер-пресет для компонента.
    Например: 90×50 мм с меткой "90×50", 85×55 мм с меткой "85×55".

    Клиент на сайте выбирает один из пресетов или вводит размер вручную —
    в этом случае мы валидируем его по min/max из компонента.
    """

    # Ссылка на компонент.
    component = models.ForeignKey(
        WebCalculatorComponent,
        verbose_name='Компонент',
        on_delete=models.CASCADE,
        related_name='size_presets',
    )

    # Размеры пресета.
    width_mm = models.DecimalField(
        verbose_name='Ширина (мм)',
        max_digits=6,
        decimal_places=2,
    )
    height_mm = models.DecimalField(
        verbose_name='Высота (мм)',
        max_digits=6,
        decimal_places=2,
    )

    # Отображаемая метка. Если пусто — API сформирует её автоматически.
    label = models.CharField(
        verbose_name='Подпись',
        max_length=50,
        blank=True,
        default='',
        help_text='Например: "90×50". Если оставить пусто — сформируется автоматически.',
    )

    # Порядок сортировки в выпадающем списке.
    order = models.PositiveIntegerField(
        verbose_name='Порядок',
        default=0,
    )

    class Meta:
        ordering = ['component', 'order', 'width_mm', 'height_mm']
        verbose_name = 'Пресет размера'
        verbose_name_plural = 'Пресеты размеров'

    def __str__(self):
        return self.label or f"{self.width_mm}×{self.height_mm}"



# ============================================================================
# МОДЕЛЬ 4: РАБОТА ВЕБ-КАЛЬКУЛЯТОРА (промежуточная)
# ============================================================================

class WebCalculatorComponentWork(models.Model):
    """
    Связь «компонент ↔ работа» с дополнительным флагом.

    Каждая запись — одна работа, привязанная к компоненту веб-калькулятора.

    Флаг is_always_on определяет поведение в калькуляторе:
    - False — работа опциональная: клиент видит галочку, сам решает.
    - True  — работа всегда включена: галочки в калькуляторе нет, но
      стоимость работы всегда прибавляется к итогу.

    Пример: для визиток «Приладка резки» и «Резка листовок» — всегда включены,
    а «Скругление углов» — опциональная.
    """

    # Ссылка на компонент веб-калькулятора.
    component = models.ForeignKey(
        WebCalculatorComponent,
        verbose_name='Компонент',
        on_delete=models.CASCADE,
        related_name='works',                       # comp.works.all()
        help_text='Компонент, к которому относится работа',
    )

    # Ссылка на работу из справочника.
    work = models.ForeignKey(
        Work,
        verbose_name='Работа',
        on_delete=models.CASCADE,
        related_name='web_calculator_works',
    )

    # ===== УСЛОВИЕ СРАБАТЫВАНИЯ РАБОТЫ =====
    # Определяет, показывать ли работу галочкой в калькуляторе и при каких
    # условиях она участвует в расчёте.
    TRIGGER_OPTIONAL = 'optional'      # опциональная: клиент ставит галочку
    TRIGGER_ALWAYS = 'always'          # всегда включена: галочки нет, всегда в расчёте
    TRIGGER_LAMINATION = 'lamination'  # включается, если выбрана ламинация
    TRIGGER_CHOICES = [
        (TRIGGER_OPTIONAL, 'Опционально (галочка в калькуляторе)'),
        (TRIGGER_ALWAYS, 'Всегда включена'),
        (TRIGGER_LAMINATION, 'При ламинации'),
    ]

    trigger = models.CharField(
        verbose_name='Условие',
        max_length=20,
        choices=TRIGGER_CHOICES,
        default=TRIGGER_OPTIONAL,
        help_text='Когда работа участвует в расчёте',
    )

    # ===== ВИЗУАЛЬНЫЙ ЭФФЕКТ (для предпросмотра в калькуляторе) =====
    # Определяет, как работа влияет на SVG-превью размера в калькуляторе.
    # Например, «Скругление углов» рисует прямоугольник со скруглениями.
    # Если работа никак не влияет на превью — оставьте 'none'.
    PREVIEW_NONE = 'none'
    PREVIEW_ROUNDED_CORNERS = 'rounded_corners'
    PREVIEW_EFFECT_CHOICES = [
        (PREVIEW_NONE, 'Без эффекта'),
        (PREVIEW_ROUNDED_CORNERS, 'Скруглённые углы'),
    ]

    preview_effect = models.CharField(
        verbose_name='Эффект в превью',
        max_length=30,
        choices=PREVIEW_EFFECT_CHOICES,
        default=PREVIEW_NONE,
        help_text='Визуальный эффект, отображаемый на схеме в калькуляторе',
    )


    # Порядок отображения (для опциональных работ — в каком порядке идут галочки).
    order = models.PositiveIntegerField(
        verbose_name='Порядок',
        default=0,
    )

    class Meta:
        ordering = ['component', 'order', 'id']
        # Одна и та же работа у одного компонента не может быть дважды.
        unique_together = ['component', 'work']
        verbose_name = 'Работа веб-калькулятора'
        verbose_name_plural = 'Работы веб-калькулятора'

    def __str__(self):
        # Для читаемости показываем триггер в квадратных скобках.
        if self.trigger == self.TRIGGER_ALWAYS:
            flag = ' [всегда]'
        elif self.trigger == self.TRIGGER_LAMINATION:
            flag = ' [при ламинации]'
        else:
            flag = ''
        return f"{self.component.name} → {self.work.name}{flag}"

# ============================================================================
# МОДЕЛЬ 5: ПРЕСЕТ ТИРАЖА
# ============================================================================

class WebCalculatorCirculationPreset(models.Model):
    """
    Готовый пресет тиража. Например: 50, 100, 200, 500.
    Клиент в калькуляторе либо выбирает один из пресетов, либо вводит
    свой тираж (кратный circulation_step).
    """

    # Ссылка на веб-калькулятор.
    calculator = models.ForeignKey(
        WebCalculator,
        verbose_name='Калькулятор',
        on_delete=models.CASCADE,
        related_name='circulation_presets',
    )

    # Значение тиража. Должно быть кратно circulation_step калькулятора,
    # но это проверяет админка/API, а не сама модель.
    value = models.PositiveIntegerField(
        verbose_name='Тираж (шт.)',
        validators=[MinValueValidator(1)],
    )

    # Порядок сортировки в выпадающем списке.
    order = models.PositiveIntegerField(
        verbose_name='Порядок',
        default=0,
    )

    class Meta:
        ordering = ['calculator', 'order', 'value']
        unique_together = ['calculator', 'value']
        verbose_name = 'Пресет тиража'
        verbose_name_plural = 'Пресеты тиража'

    def __str__(self):
        return f"{self.value} шт."    