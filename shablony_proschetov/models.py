# shablony_proschetov/models.py
"""
Модели приложения "Справочник шаблонов просчётов" (shablony_proschetov).

Приложение решает одну задачу: хранить «библиотеку» типовых просчётов
типографии в виде дерева категорий (например: "Визитки" → "Меловка 350 г").
Из шаблона одной кнопкой создаётся реальный просчёт (calculator.Proschet)
со всеми вложенными объектами (печатные компоненты, доп. работы, ламинация,
вычисления листов).

СОСТАВ МОДЕЛЕЙ:
1. TemplateCategory      — узел дерева категорий (MPTT).
2. ProschetTemplate      — сам шаблон (название, категория, комментарий, тираж).
3. TemplatePrintComponent — копия calculator.PrintComponent (принтер, бумага, тип и режим печати).
4. TemplateAdditionalWork — копия calculator.AdditionalWork (формулы 1–6).
5. TemplateLaminate       — копия calculator.Laminate (вкл/выкл, ламинатор, плёнка, сторона).
6. TemplateVichisliniya   — копия vichisliniya_listov.VichisliniyaListovModel (одностраничный режим).
7. TemplateMultipage      — копия vichisliniya_listov.VichisliniyaMultipageModel (брошюры).

Все копии — самостоятельные таблицы, а не JSON. Так они удобно
редактируются в админке через inlines и не зависят от изменений в
исходных моделях.
"""

# ===== СТАНДАРТНЫЕ ИМПОРТЫ =====
from decimal import Decimal                       # Точные десятичные числа (денежные суммы, размеры)
from django.db import models                      # Базовый модуль моделей Django
from django.conf import settings                  # Доступ к AUTH_USER_MODEL (FK на пользователя)
from mptt.models import MPTTModel, TreeForeignKey # MPTT-дерево (Modified Preorder Tree Traversal)

# ===== ИМПОРТ CHOICES ИЗ СУЩЕСТВУЮЩИХ МОДЕЛЕЙ =====
# Импортируем классы моделей, чтобы переиспользовать их choices (единый источник правды).
# Ссылки на сами модели в FK ниже даются строками ('app.Model'), поэтому циклических
# импортов не будет: на этапе загрузки этих файлов calculator уже загружен (см. INSTALLED_APPS).
from calculator.models_list_proschet import PrintComponent          # PRINT_TYPE_CHOICES, PRINT_MODE_CHOICES
from calculator.models_lamination import Laminate                   # SIDE_CHOICES
from vichisliniya_listov.models import VichisliniyaListovModel      # VICHISLINIYA_LISTOV_COLOR_CHOICES, _ORIENTATION_CHOICES
from vichisliniya_listov.multipage_models import VichisliniyaMultipageModel  # ORIENTATION_CHOICES
from spravochnik_dopolnitelnyh_rabot.models import Work


# ============================================================================
# МОДЕЛЬ 1: КАТЕГОРИЯ ШАБЛОНОВ (УЗЕЛ ДЕРЕВА)
# ============================================================================

class TemplateCategory(MPTTModel):
    """
    Узел дерева категорий для шаблонов просчётов.
    Произвольная вложенность реализуется библиотекой django-mptt.

    Поля:
    - name        — название узла ("Визитки", "Брошюры А4", "Меловка 350 г" и т.п.).
    - parent      — ссылка на родительский узел (None для корня).
    - description — опциональное описание.
    - order       — порядок сортировки среди братьев (чем меньше, тем выше).
    - created_at / updated_at — служебные метки времени.
    """

    # Название категории. Максимум 200 символов — как у Proschet.title.
    name = models.CharField(
        verbose_name='Название категории',
        max_length=200,
        help_text='Например: "Визитки", "Брошюры А4", "Меловка 350 г"'
    )

    # Ссылка на родителя. TreeForeignKey — специальный FK из MPTT,
    # он автоматически рисует дерево в админке.
    # null=True и blank=True позволяют создавать корневые категории.
    parent = TreeForeignKey(
        'self',                              # ссылка на эту же модель
        verbose_name='Родительская категория',
        on_delete=models.CASCADE,            # при удалении родителя удаляются и потомки
        null=True,
        blank=True,
        related_name='children',             # category.children.all() — дочерние узлы
        db_index=True,
        help_text='Оставьте пустым, чтобы создать корневую категорию'
    )

    # Опциональное описание категории.
    description = models.TextField(
        verbose_name='Описание',
        blank=True,
        default='',
        help_text='Необязательное текстовое пояснение к категории'
    )

    # Порядок сортировки среди братьев внутри одной родительской категории.
    order = models.PositiveIntegerField(
        verbose_name='Порядок',
        default=0,
        help_text='Чем меньше число, тем выше категория в списке'
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

    class MPTTMeta:
        # Сортировка узлов среди братьев — по order, затем по имени.
        order_insertion_by = ['order', 'name']

    class Meta:
        verbose_name = 'Категория шаблонов'
        verbose_name_plural = 'Категории шаблонов'

    def __str__(self):
        """Строковое представление — используется в админке и в выпадающих списках."""
        return self.name


# ============================================================================
# МОДЕЛЬ 2: ШАБЛОН ПРОСЧЁТА
# ============================================================================

class ProschetTemplate(models.Model):
    """
    Шаблон просчёта — «рецепт» типового заказа.

    Поля:
    - name             — название шаблона (то, что увидит пользователь).
    - category         — FK на категорию (в каком узле дерева лежит шаблон).
    - comment          — текстовый комментарий (участвует в поиске).
    - circulation      — типовой тираж (значение по умолчанию).
    - source_proschet  — FK на просчёт, из которого шаблон был создан (может быть NULL).
    - created_by       — пользователь-создатель (только для истории).
    - created_at / updated_at — служебные метки времени.
    """

    # Название шаблона.
    name = models.CharField(
        verbose_name='Название шаблона',
        max_length=200,
        help_text='Например: "Визитки 90×50 односторонние цветные на меловке 350 г"'
    )

    # Категория, к которой привязан шаблон.
    # on_delete=PROTECT: нельзя удалить категорию, пока в ней есть шаблоны.
    category = models.ForeignKey(
        TemplateCategory,
        verbose_name='Категория',
        on_delete=models.PROTECT,
        related_name='templates',
        help_text='В какой ветке дерева лежит этот шаблон'
    )

    # Свободный комментарий (используется в поиске по справочнику).
    comment = models.TextField(
        verbose_name='Комментарий',
        blank=True,
        default='',
        help_text='Например, для каких клиентов используется шаблон'
    )

    # Типовой тираж — при создании просчёта из шаблона будет подставлен по умолчанию.
    circulation = models.PositiveIntegerField(
        verbose_name='Типовой тираж',
        default=100,
        help_text='Количество экземпляров, подставляемое по умолчанию'
    )

    # Просчёт, из которого шаблон был создан (для трассировки).
    # SET_NULL — при удалении просчёта шаблон остаётся.
    source_proschet = models.ForeignKey(
        'calculator.Proschet',
        verbose_name='Исходный просчёт',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_templates',
        help_text='Просчёт, из которого был создан шаблон (необязательно)'
    )

    # Пользователь, создавший шаблон (для истории).
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name='Создал',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_templates',
        help_text='Пользователь, создавший шаблон'
    )

    created_at = models.DateTimeField(
        verbose_name='Дата создания',
        auto_now_add=True
    )

    updated_at = models.DateTimeField(
        verbose_name='Дата обновления',
        auto_now=True
    )

    class Meta:
        verbose_name = 'Шаблон просчёта'
        verbose_name_plural = 'Шаблоны просчётов'
        # Сортировка — по категории, затем по имени.
        ordering = ['category', 'name']

    def __str__(self):
        return f"{self.name} ({self.category.name})"


# ============================================================================
# МОДЕЛЬ 3: КОПИЯ ПЕЧАТНОГО КОМПОНЕНТА
# ============================================================================

class TemplatePrintComponent(models.Model):
    """
    Копия одного печатного компонента внутри шаблона.
    Структура повторяет calculator.PrintComponent, но без вычислимых полей:
    цены и количества листов будут пересчитаны в момент создания просчёта.
    """

    # Ссылка на родительский шаблон.
    template = models.ForeignKey(
        ProschetTemplate,
        verbose_name='Шаблон',
        on_delete=models.CASCADE,
        related_name='components',
        help_text='Шаблон, к которому относится этот компонент'
    )

    # Порядковый номер компонента внутри шаблона (для стабильной сортировки).
    order = models.PositiveIntegerField(
        verbose_name='Порядок',
        default=0,
        help_text='Чем меньше число, тем выше компонент в списке'
    )

    # Принтер (devices.Printer).
    # SET_NULL — при удалении принтера поле обнуляется, шаблон остаётся.
    printer = models.ForeignKey(
        'devices.Printer',
        verbose_name='Принтер',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='template_print_components',
        help_text='Принтер, выбранный для этого компонента'
    )

    # Бумага (sklad.Material, type='paper').
    paper = models.ForeignKey(
        'sklad.Material',
        verbose_name='Бумага',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='template_print_components',
        limit_choices_to={'type': 'paper'},   # в выпадающем списке — только бумага
        help_text='Бумага, выбранная для этого компонента'
    )

    # Тип печати (цветная / чёрно-белая). Choices берём из PrintComponent.
    print_type = models.CharField(
        verbose_name='Тип печати',
        max_length=10,
        choices=PrintComponent.PRINT_TYPE_CHOICES,
        default='color',
        help_text='Цветная или чёрно-белая печать'
    )

    # Режим печати (односторонняя / двусторонняя). Choices берём из PrintComponent.
    printing_mode = models.CharField(
        verbose_name='Режим печати',
        max_length=10,
        choices=PrintComponent.PRINT_MODE_CHOICES,
        default='single',
        help_text='Односторонняя или двусторонняя печать'
    )

    class Meta:
        verbose_name = 'Компонент печати (шаблон)'
        verbose_name_plural = 'Компоненты печати (шаблон)'
        ordering = ['order', 'id']

    def __str__(self):
        printer = self.printer.name if self.printer else '—'
        paper = self.paper.name if self.paper else '—'
        return f"#{self.order}: {printer} / {paper}"


# ============================================================================
# МОДЕЛЬ 4: КОПИЯ ДОПОЛНИТЕЛЬНОЙ РАБОТЫ
# ============================================================================

class TemplateAdditionalWork(models.Model):
    """
    Копия одной дополнительной работы внутри компонента шаблона.
    Структура повторяет calculator.AdditionalWork.
    """

    # Ссылка на родительский компонент шаблона.
    template_component = models.ForeignKey(
        TemplatePrintComponent,
        verbose_name='Компонент шаблона',
        on_delete=models.CASCADE,
        related_name='works',
        help_text='Компонент, к которому относится эта работа'
    )

    # Ссылка на запись в справочнике работ (может отсутствовать).
    work = models.ForeignKey(
        'spravochnik_dopolnitelnyh_rabot.Work',
        verbose_name='Работа из справочника',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='template_works',
        help_text='Ссылка на шаблон работы в справочнике'
    )

    # Название работы (автоматически копируется из справочника в save()).
    # blank=True — разрешаем оставить пустым в форме: Django не будет требовать ввода,
    # а save() сам подставит название из связанной Work.
    title = models.CharField(
        verbose_name='Название работы',
        max_length=200,
        blank=True,
        default=''
    )

    # Себестоимость единицы работы без наценки.
    cost = models.DecimalField(
        verbose_name='Себестоимость, ₽',
        max_digits=10,
        decimal_places=2,
        default=Decimal('0.00')
    )

    # Наценка в процентах.
    markup_percent = models.DecimalField(
        verbose_name='Наценка, %',
        max_digits=5,
        decimal_places=2,
        default=Decimal('0.00')
    )

    # Базовая цена (с наценкой, до применения формул).
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

    # Тип формулы расчёта (1–6). Choices берём из справочника работ.
    formula_type = models.PositiveSmallIntegerField(
        verbose_name='Формула расчёта',
        choices=Work.FORMULA_CHOICES,   # choices берём из справочника работ
        default=1
    )

    # Количество линий реза (используется в формулах 3 и 4).
    lines_count = models.PositiveIntegerField(
        verbose_name='Количество линий реза',
        default=1
    )

    # Количество изделий на листе (используется в формулах 5 и 6).
    items_per_sheet = models.PositiveIntegerField(
        verbose_name='Изделий на листе',
        default=1
    )

    def save(self, *args, **kwargs):
        """
        Перед сохранением — синхронизируем поля с записью из справочника Work.

        Логика полностью повторяет поведение calculator.AdditionalWork.save():
        когда выбрана работа из справочника, её параметры (название, себестоимость,
        наценка, цена, формула, количество линий реза, изделий на листе)
        автоматически подставляются в наш экземпляр.

        Если работа не выбрана (work=None) — оставляем поля как есть,
        чтобы можно было создавать произвольные работы вручную.
        """
        # Если привязана работа из справочника — копируем её параметры.
        if self.work_id:
            source = self.work                          # Достаём объект Work из БД.
            self.title = source.name                    # Название работы.
            self.cost = source.cost                     # Себестоимость.
            self.markup_percent = source.markup_percent # Процент наценки.
            self.price = source.price                   # Базовая цена.
            self.formula_type = source.formula_type     # Тип формулы (1–6).
            self.lines_count = source.default_lines_count        # Линии реза.
            self.items_per_sheet = source.default_items_per_sheet # Изделий на листе.

        # Вызываем стандартный save() родителя — сохраняем объект в БД.
        super().save(*args, **kwargs)


    class Meta:
        verbose_name = 'Дополнительная работа (шаблон)'
        verbose_name_plural = 'Дополнительные работы (шаблон)'
        ordering = ['id']

    def __str__(self):
        return self.title


# ============================================================================
# МОДЕЛЬ 5: КОПИЯ ЛАМИНАЦИИ
# ============================================================================

class TemplateLaminate(models.Model):
    """
    Копия настроек ламинации для компонента шаблона.
    Один-к-одному с TemplatePrintComponent — как и в calculator.Laminate.
    """

    # Ссылка на компонент шаблона (1:1).
    template_component = models.OneToOneField(
        TemplatePrintComponent,
        verbose_name='Компонент шаблона',
        on_delete=models.CASCADE,
        related_name='lamination',
        help_text='Компонент, к которому привязана ламинация'
    )

    # Включена ли ламинация.
    is_enabled = models.BooleanField(
        verbose_name='Ламинация включена',
        default=False
    )

    # Сторона ламинации (одно-/двусторонняя). Choices берём из calculator.Laminate.
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
        related_name='template_laminations',
        help_text='Ламинатор, выбранный для этого компонента'
    )

    # Плёнка (sklad.Material, type='film').
    film = models.ForeignKey(
        'sklad.Material',
        verbose_name='Плёнка',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='template_laminations',
        limit_choices_to={'type': 'film'},
        help_text='Плёнка, выбранная для ламинации'
    )

    class Meta:
        verbose_name = 'Ламинация (шаблон)'
        verbose_name_plural = 'Ламинации (шаблон)'

    def __str__(self):
        if self.is_enabled and self.laminator and self.film:
            return f"Ламинация: {self.laminator.name} + {self.film.name}"
        return "Ламинация (выключена)"


# ============================================================================
# МОДЕЛЬ 6: КОПИЯ ОДНОСТРАНИЧНЫХ ВЫЧИСЛЕНИЙ ЛИСТОВ
# ============================================================================

class TemplateVichisliniya(models.Model):
    """
    Копия одностраничного расчёта листов для компонента шаблона.
    Соответствует vichisliniya_listov.VichisliniyaListovModel.
    Хранит только входные параметры (размеры, зазор, ориентация);
    количество листов и резов будет пересчитано при создании просчёта.
    """

    # Ссылка на компонент шаблона (1:1).
    template_component = models.OneToOneField(
        TemplatePrintComponent,
        verbose_name='Компонент шаблона',
        on_delete=models.CASCADE,
        related_name='vichisliniya',
        help_text='Компонент, к которому привязан одностраничный расчёт'
    )

    # Зазор между изделиями (мм).
    vyleta = models.PositiveIntegerField(
        verbose_name='Зазор, мм',
        default=1
    )

    # Цветность. Choices берём из VichisliniyaListovModel.
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

    # Поля размещения изделий на листе (рассчитываются автоматически).
    fit_horizontal = models.PositiveIntegerField(verbose_name='По горизонтали', default=0)
    fit_vertical = models.PositiveIntegerField(verbose_name='По вертикали', default=0)
    fit_total = models.PositiveIntegerField(verbose_name='Всего на листе', default=0)
    fit_landscape_total = models.PositiveIntegerField(verbose_name='Альбомная ориентация', default=0)
    fit_portrait_total = models.PositiveIntegerField(verbose_name='Портретная ориентация', default=0)

    # Выбранная ориентация. Choices берём из VichisliniyaListovModel.
    fit_selected_orientation = models.CharField(
        verbose_name='Выбранная ориентация',
        max_length=10,
        choices=VichisliniyaListovModel.VICHISLINIYA_LISTOV_ORIENTATION_CHOICES,
        default='auto'
    )

    # Количество резов — пересчитывается автоматически, но храним для полноты.
    cuts_count = models.PositiveIntegerField(
        verbose_name='Количество резов',
        default=0
    )

    class Meta:
        verbose_name = 'Вычисление листов (шаблон, одностраничное)'
        verbose_name_plural = 'Вычисления листов (шаблон, одностраничное)'

    def __str__(self):
        return f"Одностраничное: {self.item_width}×{self.item_height} мм"


# ============================================================================
# МОДЕЛЬ 7: КОПИЯ МНОГОСТРАНИЧНЫХ ВЫЧИСЛЕНИЙ
# ============================================================================

class TemplateMultipage(models.Model):
    """
    Копия многостраничного расчёта (брошюра) для компонента шаблона.
    Соответствует vichisliniya_listov.VichisliniyaMultipageModel.
    """

    # Ссылка на компонент шаблона (1:1).
    template_component = models.OneToOneField(
        TemplatePrintComponent,
        verbose_name='Компонент шаблона',
        on_delete=models.CASCADE,
        related_name='multipage',
        help_text='Компонент, к которому привязан многостраничный расчёт'
    )

    # Способ скрепления (скрепка / пружина / КБС).
    binding = models.ForeignKey(
        'vichisliniya_listov.MultipageBinding',
        verbose_name='Способ скрепления',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='template_multipages',
        help_text='Способ скрепления брошюры'
    )

    # Количество страниц в готовой брошюре.
    total_pages = models.PositiveIntegerField(
        verbose_name='Количество страниц',
        default=4
    )

    # Количество экземпляров (обычно совпадает с тиражом шаблона).
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

    # Зазор между страницами (мм).
    vyleta = models.PositiveIntegerField(
        verbose_name='Зазор, мм',
        default=1
    )

    # Цветность. Choices берём из VichisliniyaListovModel.
    color = models.CharField(
        verbose_name='Цветность',
        max_length=10,
        choices=VichisliniyaListovModel.VICHISLINIYA_LISTOV_COLOR_CHOICES,
        default='4+0'
    )

    # Ориентация готовой брошюры. Choices берём из VichisliniyaMultipageModel.
    booklet_orientation = models.CharField(
        verbose_name='Ориентация брошюры',
        max_length=10,
        choices=VichisliniyaMultipageModel.ORIENTATION_CHOICES,
        default='portrait'
    )

    # Поля размещения страниц на листе (на одной стороне).
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

    # Активен ли многостраничный режим (для данного компонента шаблона).
    is_active = models.BooleanField(
        verbose_name='Многостраничный режим активен',
        default=False
    )

    class Meta:
        verbose_name = 'Вычисление листов (шаблон, многостраничное)'
        verbose_name_plural = 'Вычисления листов (шаблон, многостраничное)'

    def __str__(self):
        return f"Многостраничное: {self.total_pages} стр."