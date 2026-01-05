"""
models.py для приложения sklad
Модели для древовидной структуры материалов
"""

from django.db import models
from django.core.validators import MinValueValidator
from mptt.models import MPTTModel, TreeForeignKey  # Импортируем компоненты для деревьев


class Category(MPTTModel):
    """
    Модель "Категория" - древовидная структура папок для материалов
    Наследуется от MPTTModel для поддержки иерархии
    
    MPTT (Modified Preorder Tree Traversal) - эффективный алгоритм
    для работы с деревьями в реляционных базах данных
    
    Пример структуры:
    - Бумага (корневая категория)
      ├── Меловка (подкатегория)
      │   ├── Меловка 130 г/кв.м (материал)
      │   └── Меловка 150 г/кв.м (материал)
      └── Дизайнерская (подкатегория)
          └── Дизайнерская 200 г/кв.м (материал)
    """
    
    # Название категории (папки)
    name = models.CharField(
        max_length=100,
        verbose_name='Название категории',
        help_text='Введите название категории (например: "Бумага", "Меловка")',
    )
    
    # Родительская категория (создает иерархию)
    # TreeForeignKey - специальное поле для связи с родительским узлом
    # null=True, blank=True - корневые категории не имеют родителя
    # related_name='children' - позволяет обращаться к дочерним категориям
    parent = TreeForeignKey(
        'self',  # Ссылка на ту же модель (рекурсивная связь)
        on_delete=models.CASCADE,  # При удалении родителя удаляются все потомки
        null=True,  # Может быть пустым (для корневых категорий)
        blank=True,  # Разрешаем пустое значение в формах
        verbose_name='Родительская категория',
        help_text='Выберите родительскую категорию (оставьте пустым для корневой)',
        related_name='children'  # Для обратного доступа: category.children.all()
    )
    
    # Описание категории (необязательное)
    description = models.TextField(
        verbose_name='Описание',
        help_text='Введите описание категории (необязательно)',
        blank=True,  # Поле может быть пустым
        null=True,   # В базе данных может быть NULL
    )
    
    # Дата создания и обновления
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
    
    class MPTTMeta:
        """
        Настройки для MPTT модели
        """
        order_insertion_by = ['name']  # Сортировка дочерних элементов по имени
        verbose_name = 'Категория'  # Человеко-читаемое имя в единственном числе
        verbose_name_plural = 'Категории'  # Человеко-читаемое имя во множественном числе
    
    class Meta:
        """
        Дополнительные настройки модели
        """
        verbose_name = 'Категория'
        verbose_name_plural = 'Категории'
        indexes = [
            models.Index(fields=['name']),  # Индекс для быстрого поиска по имени
        ]
    
    def __str__(self):
        """
        Строковое представление объекта
        Показывает иерархию через отступы
        """
        # Если есть родитель, добавляем отступы для отображения иерархии
        if self.parent:
            return f"  {self.name}"  # Два пробела для отступа
        return self.name  # Корневые категории без отступа
    
    def get_full_path(self):
        """
        Возвращает полный путь категории от корня
        Например: "Бумага / Меловка / Глянцевая"
        """
        ancestors = self.get_ancestors(include_self=True)
        return " / ".join([ancestor.name for ancestor in ancestors])
    
    def get_children_count(self):
        """
        Возвращает количество непосредственных дочерних категорий
        """
        return self.children.count()
    
    def get_materials_count(self):
        """
        Возвращает количество материалов в этой категории
        """
        return self.materials.count()


class Material(models.Model):
    """
    Модель "Материал" - конкретный материал, привязанный к категории
    Например: "Меловка 130 г/кв.м, глянец"
    """
    
    # Название материала
    name = models.CharField(
        max_length=100,
        verbose_name='Название материала',
        help_text='Введите название материала (например: "Меловка 130 г/кв.м, глянец")',
    )
    
    # Категория, к которой принадлежит материал
    # ForeignKey - связь "многие к одному" (много материалов в одной категории)
    category = models.ForeignKey(
        Category,
        on_delete=models.CASCADE,  # При удалении категории удаляются все её материалы
        verbose_name='Категория',
        help_text='Выберите категорию для материала',
        related_name='materials'  # Для обратного доступа: category.materials.all()
    )
    
    # Цена за единицу (лист, рулон и т.д.)
    price = models.DecimalField(
        max_digits=10,  # Максимум 10 цифр
        decimal_places=2,  # 2 знака после запятой (копейки)
        verbose_name='Цена',
        help_text='Введите цену за единицу материала',
        validators=[MinValueValidator(0.01)],  # Минимальная цена 1 копейка
    )
    
    # Единица измерения (лист, рулон, метр и т.д.)
    unit = models.CharField(
        max_length=20,
        verbose_name='Единица измерения',
        help_text='Введите единицу измерения (например: "лист", "рулон", "метр")',
        default='лист',  # Значение по умолчанию
    )
    
    # Плотность (для бумаги)
    density = models.IntegerField(
        verbose_name='Плотность (г/кв.м)',
        help_text='Введите плотность материала в г/кв.м (только для бумаги)',
        null=True,  # Может быть пустым
        blank=True,  # Разрешаем пустое значение в формах
    )
    
    # Количество на складе (ТОЛЬКО ЦЕЛЫЕ ЧИСЛА)
    quantity = models.IntegerField(
        verbose_name='Количество на складе',
        help_text='Введите целое количество материала на складе',
        default=0,  # По умолчанию 0
        validators=[MinValueValidator(0)],  # Запрещаем отрицательные значения
    )

    # Минимальный остаток (ТОЛЬКО ЦЕЛЫЕ ЧИСЛА)
    min_quantity = models.IntegerField(
        verbose_name='Минимальный остаток',
        help_text='Минимальное целое количество, при котором нужно заказывать',
        default=10,  # По умолчанию 10
        validators=[MinValueValidator(0)],  # Запрещаем отрицательные значения
    )
    
    # Дополнительные характеристики (JSON поле)
    # Можно хранить любые дополнительные параметры
    characteristics = models.JSONField(
        verbose_name='Характеристики',
        help_text='Дополнительные характеристики материала в формате JSON',
        null=True,
        blank=True,
        default=dict,  # По умолчанию пустой словарь
    )
    
    # Примечание
    notes = models.TextField(
        verbose_name='Примечание',
        help_text='Дополнительные примечания о материале',
        blank=True,
        null=True,
    )
    
    # Флаг активности (можно временно скрыть материал)
    is_active = models.BooleanField(
        verbose_name='Активен',
        help_text='Отметьте, если материал активен и доступен для использования',
        default=True,
    )
    
    # Дата создания и обновления
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
        """
        Дополнительные настройки модели
        """
        ordering = ['name']  # Сортировка по умолчанию
        verbose_name = 'Материал'
        verbose_name_plural = 'Материалы'
        indexes = [
            models.Index(fields=['name']),
            models.Index(fields=['price']),
            models.Index(fields=['is_active']),
        ]
    
    def __str__(self):
        """
        Строковое представление материала
        """
        return f"{self.name} ({self.price} руб./{self.unit})"
    
    def get_full_name(self):
        """
        Возвращает полное имя материала с категорией
        """
        return f"{self.category.name} - {self.name}"
    
    def get_price_display(self):
        """
        Возвращает отформатированную цену
        """
        return f"{self.price:.2f} руб./{self.unit}"
    
    def get_quantity_status(self):
        """
        Возвращает статус количества на складе
        """
        if self.quantity <= 0:
            return 'danger', 'Нет в наличии'
        elif self.quantity <= self.min_quantity:
            return 'warning', f'Мало ({self.quantity})'
        else:
            return 'success', f'В наличии ({self.quantity})'
    
    def to_dict(self):
        """
        Преобразует объект в словарь для JSON
        """
        return {
            'id': self.id,
            'name': self.name,
            'category_id': self.category.id,
            'category_name': self.category.name,
            'price': float(self.price),
            'unit': self.unit,
            'density': self.density,
            'quantity': float(self.quantity),
            'min_quantity': float(self.min_quantity),
            'price_display': self.get_price_display(),
            'quantity_status': self.get_quantity_status(),
            'is_active': self.is_active,
            'created_at': self.created_at.strftime('%d.%m.%Y %H:%M'),
            'updated_at': self.updated_at.strftime('%d.%m.%Y %H:%M'),
        }