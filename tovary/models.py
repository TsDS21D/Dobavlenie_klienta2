# tovary/models.py
"""
Модели приложения "tovary" (Справочник товаров).

Содержит:
  • Tovar      — товар из справочника (штампы, оснастка, услуги).
  • Category   — древовидная категория товаров (mptt, произвольная глубина).

При добавлении товара в заказ создаётся снимок в orders.OrderTovar.
"""

from decimal import Decimal

from django.db import models
from mptt.models import MPTTModel, TreeForeignKey


# ============================================================================
# МОДЕЛЬ 1: КАТЕГОРИЯ ТОВАРОВ (ДЕРЕВО)
# ============================================================================

class Category(MPTTModel):
    """
    Древовидная категория товаров.

    Использует mptt — библиотеку для работы с деревьями (уже подключена
    в проекте, применяется в shablony_proschetov).

    Глубина — произвольная. Каждая категория может быть корневой
    (parent=None) или вложенной в любую другую.

    Удаление — мягкое (is_deleted=True). Если в категории есть товары,
    удаление запрещается на уровне вью (см. views.py).

    Товар можно положить в категорию-родитель — не только в листья.
    Это допускается и не ограничивается.
    """

    name = models.CharField(
        verbose_name='Название',
        max_length=100,
    )

    parent = TreeForeignKey(
        'self',
        verbose_name='Родительская категория',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='children',
        help_text='Если не указана — категория корневая'
    )

    is_deleted = models.BooleanField(
        verbose_name='Удалена',
        default=False,
    )

    created_at = models.DateTimeField(
        verbose_name='Дата создания',
        auto_now_add=True,
    )
    updated_at = models.DateTimeField(
        verbose_name='Дата обновления',
        auto_now=True,
    )

    class MPTTMeta:
        # При добавлении новой категории сортируем внутри родителя по имени.
        order_insertion_by = ['name']

    class Meta:
        verbose_name = 'Категория товаров'
        verbose_name_plural = 'Категории товаров'

    def __str__(self):
        return self.name


# ============================================================================
# МОДЕЛЬ 2: ТОВАР
# ============================================================================

class Tovar(models.Model):
    """
    Товар из справочника.

    На этом шаге мы готовим переход с CharField-категории на дерево.
    Поэтому пока в модели ДВА поля категории:
      • category_old — старое (CharField), будет удалено после data-миграции.
      • category     — новое (TreeForeignKey), пока пустое.

    После data-миграции (см. следующую миграцию) мы удалим category_old
    и оставим только category.
    """

    name = models.CharField(
        verbose_name='Название',
        max_length=200,
        help_text='Например: «Штамп», «Оснастка trodat 4642», «Доставка»'
    )

    # НОВОЕ ПОЛЕ: категория из дерева. Пока nullable — заполним в data-миграции.
    category = TreeForeignKey(
        Category,
        verbose_name='Категория',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='tovary',
        help_text='Категория из дерева'
    )

    # СТАРОЕ ПОЛЕ: сохраняем как есть, чтобы можно было перенести данные
    # в data-миграции. После переноса — удалим.
    category_old = models.CharField(
        verbose_name='Категория (старая, строка)',
        max_length=100,
        blank=True,
        default='',
    )

    article = models.CharField(
        verbose_name='Артикул',
        max_length=50,
        blank=True,
        default='',
        help_text='Внутренний артикул товара (необязательно)'
    )

    price = models.DecimalField(
        verbose_name='Цена, ₽',
        max_digits=12,
        decimal_places=2,
        default=Decimal('0.00'),
        help_text='Цена по умолчанию за единицу товара'
    )

    unit = models.CharField(
        verbose_name='Единица',
        max_length=20,
        default='шт.',
        help_text='Например: «шт.», «уп.», «м»'
    )

    is_deleted = models.BooleanField(
        verbose_name='Удалён',
        default=False,
        help_text='Помечает товар как удалённый (скрывается из списков)'
    )

    created_at = models.DateTimeField(
        verbose_name='Дата создания',
        auto_now_add=True,
    )
    updated_at = models.DateTimeField(
        verbose_name='Дата обновления',
        auto_now=True,
    )

    class Meta:
        verbose_name = 'Товар'
        verbose_name_plural = 'Товары'
        ordering = ['name', 'id']

    def __str__(self):
        if self.article:
            return f"{self.name} (арт. {self.article})"
        return self.name

    @property
    def formatted_price(self):
        return f"{self.price:.2f} ₽"