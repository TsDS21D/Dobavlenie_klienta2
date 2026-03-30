"""
models.py для приложения sklad
Модели для древовидной структуры материалов (бумага и плёнка)
Содержит:
- Category (категория с MPTT)
- Material (материал с полями для бумаги и плёнки)
"""

# Импортируем необходимые модули Django
from django.db import models                         # Базовые классы моделей
from django.core.validators import MinValueValidator # Валидатор минимального значения
from mptt.models import MPTTModel, TreeForeignKey    # Поддержка деревьев (MPTT)

# Константы для выбора типа категории
CATEGORY_TYPES = (
    ('paper', 'Бумага'),    # Значение в БД и отображаемое имя
    ('film', 'Плёнка'),
)

# Константы для выбора типа материала
MATERIAL_TYPES = (
    ('paper', 'Бумага'),
    ('film', 'Плёнка'),
)


class Category(MPTTModel):
    """
    Модель категории с поддержкой древовидной структуры (MPTT).
    Позволяет создавать вложенные категории для бумаги и плёнки отдельно.
    """

    # Название категории (обязательное, до 100 символов)
    name = models.CharField(
        max_length=100,
        verbose_name='Название категории',
        help_text='Введите название категории (например: "Бумага", "Меловка")',
    )

    # Тип категории: бумага или плёнка – определяет, какие материалы могут быть внутри
    type = models.CharField(
        max_length=20,
        choices=CATEGORY_TYPES,
        default='paper',
        verbose_name='Тип',
        help_text='Выберите тип категории: Бумага или Плёнка',
    )

    # Родительская категория (TreeForeignKey от mptt). null=True означает корневая категория.
    parent = TreeForeignKey(
        'self',
        on_delete=models.CASCADE,    # При удалении родителя удаляются и потомки
        null=True,
        blank=True,
        verbose_name='Родительская категория',
        help_text='Выберите родительскую категорию (оставьте пустым для корневой)',
        related_name='children'      # Обратная связь: category.children.all()
    )

    # Описание (необязательное)
    description = models.TextField(
        verbose_name='Описание',
        blank=True,
        null=True,
    )

    # Дата создания (заполняется автоматически при создании)
    created_at = models.DateTimeField(
        auto_now_add=True,
        verbose_name='Дата создания',
        editable=False,              # Не редактируется в админке
    )

    # Дата последнего обновления (обновляется при каждом сохранении)
    updated_at = models.DateTimeField(
        auto_now=True,
        verbose_name='Дата обновления',
        editable=False,
    )

    class MPTTMeta:
        order_insertion_by = ['name']   # Сортировка дочерних элементов по имени

    class Meta:
        verbose_name = 'Категория'
        verbose_name_plural = 'Категории'
        # Индексы для ускорения поиска
        indexes = [
            models.Index(fields=['name']),
            models.Index(fields=['type']),
        ]

    def __str__(self):
        """Строковое представление: для корневых – просто имя, для дочерних – с отступом."""
        if self.parent:
            return f"  {self.name}"
        return self.name

    def get_full_path(self):
        """Возвращает полный путь к категории, например 'Бумага / Меловка'."""
        ancestors = self.get_ancestors(include_self=True)
        return " / ".join([ancestor.name for ancestor in ancestors])

    def get_children_count(self):
        """Количество непосредственных дочерних категорий."""
        return self.children.count()

    def get_materials_count(self):
        """Количество материалов в этой категории (без учёта подкатегорий)."""
        return self.materials.count()


class Material(models.Model):
    """
    Модель материала. Поддерживает два типа: бумага и плёнка.
    Для бумаги: цена, единица измерения, плотность (г/кв.м), толщина (мм).
    Для плёнки: себестоимость, наценка (%), толщина (мкм).
    """

    # --- Общие поля для всех типов ---
    name = models.CharField(
        max_length=100,
        verbose_name='Название материала',
    )

    # Связь с категорией (каждый материал принадлежит одной категории)
    category = models.ForeignKey(
        Category,
        on_delete=models.CASCADE,          # При удалении категории удаляются все её материалы
        verbose_name='Категория',
        related_name='materials'           # category.materials.all()
    )

    # Тип материала (дублируется из категории для удобства фильтрации)
    type = models.CharField(
        max_length=20,
        choices=MATERIAL_TYPES,
        default='paper',
        verbose_name='Тип материала',
        help_text='Выберите тип материала: Бумага или Плёнка',
    )

    # --- Поля для бумаги ---
    price = models.DecimalField(
        max_digits=10,          # Максимум 10 цифр всего
        decimal_places=2,       # Из них 2 после запятой (копейки)
        verbose_name='Цена',
        validators=[MinValueValidator(0.01)],
        blank=True,
        null=True,              # Для плёнки цена вычисляется, поэтому может быть null
    )

    unit = models.CharField(
        max_length=20,
        verbose_name='Единица измерения',
        default='лист',
    )

    # Плотность бумаги (г/кв.м) – уже существовало, но могло не отображаться
    density = models.IntegerField(
        verbose_name='Плотность (г/кв.м)',
        null=True,
        blank=True,
        help_text='Плотность бумаги в граммах на квадратный метр',
    )

    # НОВОЕ поле: толщина бумаги в миллиметрах (для расчёта объёма)
    paper_thickness = models.DecimalField(
        max_digits=8,
        decimal_places=3,
        verbose_name='Толщина бумаги (мм)',
        null=True,
        blank=True,
        help_text='Толщина бумаги в миллиметрах (например, 0.1 для 100 мкм)',
        validators=[MinValueValidator(0.001)],
    )

    # --- Поля для плёнки ---
    cost = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        verbose_name='Себестоимость',
        null=True,
        blank=True,
        help_text='Закупочная стоимость единицы',
    )

    markup_percent = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        verbose_name='Наценка (%)',
        null=True,
        blank=True,
        help_text='Процент наценки (от себестоимости)',
    )

    thickness = models.PositiveSmallIntegerField(
        verbose_name='Толщина (мкм)',
        null=True,
        blank=True,
        help_text='Толщина плёнки в микронах',
    )

    # --- Складские поля (общие) ---
    quantity = models.IntegerField(
        verbose_name='Количество на складе',
        default=0,
        validators=[MinValueValidator(0)],
    )

    min_quantity = models.IntegerField(
        verbose_name='Минимальный остаток',
        default=10,
        validators=[MinValueValidator(0)],
    )

    characteristics = models.JSONField(
        verbose_name='Характеристики',
        null=True,
        blank=True,
        default=dict,
    )

    notes = models.TextField(
        verbose_name='Примечание',
        blank=True,
        null=True,
    )

    is_active = models.BooleanField(
        verbose_name='Активен',
        default=True,
    )

    created_at = models.DateTimeField(
        auto_now_add=True,
        verbose_name='Дата создания',
        editable=False,
    )

    updated_at = models.DateTimeField(
        auto_now=True,
        verbose_name='Дата обновления',
        editable=False,
    )

    class Meta:
        ordering = ['name']               # Сортировка по умолчанию – по имени
        verbose_name = 'Материал'
        verbose_name_plural = 'Материалы'
        indexes = [
            models.Index(fields=['name']),
            models.Index(fields=['price']),
            models.Index(fields=['is_active']),
            models.Index(fields=['type']),
        ]

    def __str__(self):
        """Строковое представление: название и цена."""
        return f"{self.name} ({self.get_price_display()})"

    def get_price_display(self):
        """Отформатированная цена с единицей измерения."""
        return f"{self.get_price():.2f} руб./{self.unit}"

    def get_price(self):
        """
        Возвращает цену в зависимости от типа:
        - бумага: поле price (если не задано, то 0)
        - плёнка: себестоимость * (1 + наценка/100)
        """
        if self.type == 'paper':
            return self.price if self.price is not None else 0
        else:
            if self.cost is not None and self.markup_percent is not None:
                return self.cost * (1 + self.markup_percent / 100)
            return 0

    def get_markup_amount(self):
        """Наценка в рублях для плёнки (полезно для отчётности)."""
        if self.type == 'film' and self.cost is not None and self.markup_percent is not None:
            return self.cost * self.markup_percent / 100
        return 0

    def get_full_name(self):
        """Полное имя: 'Категория - Название'."""
        return f"{self.category.name} - {self.name}"

    def get_quantity_status(self):
        """
        Возвращает статус остатка: ('danger', 'Нет в наличии'), ('warning', 'Мало'), ('success', 'В наличии').
        Используется для цветовой индикации.
        """
        if self.quantity <= 0:
            return 'danger', 'Нет в наличии'
        elif self.quantity <= self.min_quantity:
            return 'warning', f'Мало ({self.quantity})'
        else:
            return 'success', f'В наличии ({self.quantity})'

    def to_dict(self):
        """
        Преобразует объект в словарь для JSON-ответов (AJAX API).
        Включает все поля, включая density и paper_thickness.
        """
        return {
            'id': self.id,
            'name': self.name,
            'category_id': self.category.id,
            'category_name': self.category.name,
            'type': self.type,
            'price': float(self.get_price()),
            'price_display': self.get_price_display(),
            'unit': self.unit,
            'density': self.density,                     # плотность бумаги
            'paper_thickness': float(self.paper_thickness) if self.paper_thickness else None,
            'quantity': self.quantity,
            'min_quantity': self.min_quantity,
            'quantity_status': self.get_quantity_status(),
            'is_active': self.is_active,
            # поля для плёнки
            'cost': float(self.cost) if self.cost else None,
            'markup_percent': float(self.markup_percent) if self.markup_percent else None,
            'markup_amount': float(self.get_markup_amount()),
            'thickness': self.thickness,
            'created_at': self.created_at.strftime('%d.%m.%Y %H:%M'),
            'updated_at': self.updated_at.strftime('%d.%m.%Y %M:%S'),
        }