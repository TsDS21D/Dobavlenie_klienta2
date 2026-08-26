"""
models.py для приложения sklad
Модели для древовидной структуры материалов (бумага и плёнка)

Содержит:
- Category (категория с MPTT)
- Material (материал с полями для бумаги и плёнки)

ИСПРАВЛЕНИЯ (унификация ценообразования):
- Удалено поле price (готовая цена) для бумаги.
- Добавлены поля cost (себестоимость) и markup_percent (наценка в %) для бумаги.
- Поле unit (единица измерения) теперь общее для всех типов материалов.
- Метод get_price() унифицирован: цена = cost * (1 + markup_percent/100) для всех.
- Поля cost и markup_percent обязательны для всех материалов (валидация).
"""

# Импортируем необходимые модули Django
from django.db import models                         # Базовые классы моделей
from django.core.validators import MinValueValidator # Валидатор минимального значения
from mptt.models import MPTTModel, TreeForeignKey    # Поддержка деревьев (MPTT)
from decimal import Decimal                          # Для точных вычислений с деньгами

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
    
    Общие поля для всех типов:
    - name, category, type, unit, quantity, min_quantity, notes, is_active, created_at, updated_at.
    - cost (себестоимость за единицу), markup_percent (наценка в %) – для вычисления цены.
    
    Специфические поля:
    - для бумаги: density (г/кв.м), paper_thickness (мм)
    - для плёнки: thickness (мкм)
    
    Цена вычисляется единообразно: cost * (1 + markup_percent/100)
    """

    # --- Общие поля для всех типов ---
    name = models.CharField(
        max_length=100,
        verbose_name='Название материала',
    )

    category = models.ForeignKey(
        Category,
        on_delete=models.CASCADE,
        verbose_name='Категория',
        related_name='materials'
    )

    type = models.CharField(
        max_length=20,
        choices=MATERIAL_TYPES,
        default='paper',
        verbose_name='Тип материала',
        help_text='Выберите тип материала: Бумага или Плёнка',
    )

    # Единица измерения (общая для всех) – например, лист, рулон, метр, кг
    unit = models.CharField(
        max_length=20,
        verbose_name='Единица измерения',
        default='лист',
    )

    # --- Поля для ценообразования (общие для всех типов) ---
    cost = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        verbose_name='Себестоимость (руб.)',
        null=True,          # разрешаем NULL
        blank=True,         # разрешаем пустоту в формах
        validators=[MinValueValidator(0)],
        help_text='Закупочная стоимость единицы материала',
    )

    markup_percent = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        verbose_name='Наценка (%)',
        null=True,
        blank=True,
        validators=[MinValueValidator(0)],
        help_text='Процент наценки от себестоимости',
    )

    # --- Специфические поля для бумаги ---
    density = models.IntegerField(
        verbose_name='Плотность (г/кв.м)',
        null=True,
        blank=True,
        help_text='Плотность бумаги в граммах на квадратный метр (только для бумаги)',
    )

    paper_thickness = models.DecimalField(
        max_digits=8,
        decimal_places=3,
        verbose_name='Толщина бумаги (мм)',
        null=True,
        blank=True,
        help_text='Толщина бумаги в миллиметрах (только для бумаги)',
        validators=[MinValueValidator(0.001)],
    )

    # --- Специфические поля для плёнки ---
    thickness = models.PositiveSmallIntegerField(
        verbose_name='Толщина (мкм)',
        null=True,
        blank=True,
        help_text='Толщина плёнки в микронах (только для плёнки)',
        validators=[MinValueValidator(1)],
    )

    # --- Складские поля ---
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
        ordering = ['name']
        verbose_name = 'Материал'
        verbose_name_plural = 'Материалы'
        indexes = [
            models.Index(fields=['name']),
            models.Index(fields=['type']),
            models.Index(fields=['is_active']),
        ]

    def __str__(self):
        """Строковое представление: название и цена."""
        return f"{self.name} ({self.get_price_display()})"

    def get_price_display(self):
        """Отформатированная цена с единицей измерения."""
        return f"{self.get_price():.2f} руб./{self.unit}"

    def get_price(self):
        """
        Возвращает розничную цену на основе себестоимости и наценки.
        Формула: cost * (1 + markup_percent/100)
        Если почему-то cost или markup_percent отсутствуют (None), возвращает 0.
        """
        if self.cost is not None and self.markup_percent is not None:
            return self.cost * (1 + self.markup_percent / 100)
        return Decimal('0')

    def get_markup_amount(self):
        """Наценка в рублях (полезно для отчётности)."""
        if self.cost is not None and self.markup_percent is not None:
            return self.cost * self.markup_percent / 100
        return Decimal('0')

    def get_full_name(self):
        """Полное имя: 'Категория - Название'."""
        return f"{self.category.name} - {self.name}"

    def get_quantity_status(self):
        """
        Возвращает статус остатка: ('danger', 'Нет в наличии'),
        ('warning', 'Мало'), ('success', 'В наличии').
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
        Включает все поля, включая вычисляемую цену.
        """
        return {
            'id': self.id,
            'name': self.name,
            'category_id': self.category.id,
            'category_name': self.category.name,
            'type': self.type,
            'price': float(self.get_price()),               # вычисленная цена
            'price_display': self.get_price_display(),
            'unit': self.unit,
            'cost': float(self.cost) if self.cost else None,
            'markup_percent': float(self.markup_percent) if self.markup_percent else None,
            'markup_amount': float(self.get_markup_amount()),
            # поля для бумаги
            'density': self.density,
            'paper_thickness': float(self.paper_thickness) if self.paper_thickness else None,
            # поле для плёнки
            'thickness': self.thickness,
            # складские
            'quantity': self.quantity,
            'min_quantity': self.min_quantity,
            'quantity_status': self.get_quantity_status(),
            'is_active': self.is_active,
            'created_at': self.created_at.strftime('%d.%m.%Y %H:%M:%S'),
            'updated_at': self.updated_at.strftime('%d.%m.%Y %H:%M:%S'),
        }