"""
models.py для приложения spravochnik_dopolnitelnyh_rabot.

Добавлены поля себестоимости (cost) и процента наценки (markup_percent)
в модель Work. Поле price теперь вычисляется при сохранении на основе
cost и markup_percent.
"""

from django.db import models
from django.core.validators import MinValueValidator
from decimal import Decimal

class Work(models.Model):
    """
    Модель «Работа» – хранит информацию о дополнительной работе типографии.
    Добавлены поля cost (себестоимость) и markup_percent (процент наценки).
    Цена (price) пересчитывается автоматически при сохранении.
    """

    # Типы формул для расчёта стоимости работы
    FORMULA_CHOICES = [
        (1, 'Фиксированная цена'),
        (2, 'Тираж × Цена (интерполяция по тиражу)'),
        (3, 'Цена × Тираж × (Количество резов × Коэффициент)'),
        (4, 'Количество листов × Цена × Количество резов (логарифмическая)'),
        (5, 'Количество изделий на листе × Цена × Количество листов'),
        (6, 'Количество изделий на листе × Цена × Тираж'),
    ]

    # Варианты методов интерполяции (аналогично принтерам в print_price)
    INTERPOLATION_CHOICES = [
        ('linear', 'Линейная'),
        ('logarithmic', 'Логарифмическая'),
    ]

    name = models.CharField(
        max_length=255,
        verbose_name='Название работы',
        help_text='Введите наименование дополнительной работы'
    )

    # ===== НОВЫЕ ПОЛЯ ДЛЯ СЕБЕСТОИМОСТИ И НАЦЕНКИ =====
    cost = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0.00,
        verbose_name='Себестоимость (руб)',
        validators=[MinValueValidator(0)],
        help_text='Себестоимость работы (без наценки)'
    )

    markup_percent = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0.00,
        verbose_name='Наценка (%)',
        validators=[MinValueValidator(0)],
        help_text='Процент наценки от себестоимости (например, 20.00)'
    )

    # Поле price теперь не является редактируемым напрямую, оно вычисляется
    # при сохранении. Сохраняем его в БД для совместимости с существующим кодом.
    price = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        verbose_name='Цена (руб)',
        validators=[MinValueValidator(0)],
        help_text='Итоговая цена = себестоимость + наценка (рассчитывается автоматически)'
    )
    # ===== КОНЕЦ НОВЫХ ПОЛЕЙ =====

    formula_type = models.PositiveSmallIntegerField(
        choices=FORMULA_CHOICES,
        default=1,
        verbose_name='Формула расчёта',
        help_text='Выберите формулу для вычисления стоимости'
    )

    interpolation_method = models.CharField(
        max_length=20,
        choices=INTERPOLATION_CHOICES,
        default='linear',
        verbose_name='Метод интерполяции цены',
        help_text='Способ расчёта цены для произвольного количества листов между опорными точками'
    )

    k_lines = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=2.0,
        verbose_name='Коэффициент резов',
        help_text='Коэффициент, усиливающий влияние количества резов в формуле 4'
    )

    default_lines_count = models.PositiveIntegerField(
        default=1,
        verbose_name='Количество линий реза (по умолчанию)',
        help_text='Используется для формул, где требуется количество линий реза'
    )

    default_items_per_sheet = models.PositiveIntegerField(
        default=1,
        verbose_name='Количество изделий на листе (по умолчанию)',
        help_text='Используется для формул, где требуется количество изделий на листе'
    )

    created_at = models.DateTimeField(
        auto_now_add=True,
        verbose_name='Дата создания'
    )

    updated_at = models.DateTimeField(
        auto_now=True,
        verbose_name='Дата обновления'
    )

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Дополнительная работа'
        verbose_name_plural = 'Дополнительные работы'
        indexes = [
            models.Index(fields=['name']),
            models.Index(fields=['created_at']),
        ]

    def __str__(self):
        return f"{self.name} – {self.price} руб."

    def save(self, *args, **kwargs):
        """
        Переопределённый метод сохранения:
        - Если указаны cost и markup_percent, пересчитываем price.
        - Вызываем родительский save.
        """
        # Пересчёт цены на основе себестоимости и наценки
        if self.cost is not None and self.markup_percent is not None:
            # price = cost + cost * (markup_percent / 100)
            self.price = self.cost + (self.cost * self.markup_percent / Decimal('100'))
        super().save(*args, **kwargs)

    def to_dict(self):
        """Преобразует объект в словарь для JSON (AJAX)."""
        return {
            'id': self.id,
            'name': self.name,
            'cost': str(self.cost),
            'cost_display': f"{self.cost:.2f} руб.",
            'markup_percent': str(self.markup_percent),
            'markup_percent_display': f"{self.markup_percent}%",
            'price': str(self.price),
            'price_display': f"{self.price} руб.",
            'formula_type': self.formula_type,
            'formula_display': self.get_formula_type_display(),
            'interpolation_method': self.interpolation_method,
            'interpolation_method_display': self.get_interpolation_method_display(),
            'k_lines': str(self.k_lines),
            'default_lines_count': self.default_lines_count,
            'default_items_per_sheet': self.default_items_per_sheet,
            'created_at': self.created_at.strftime('%d.%m.%Y %H:%M'),
            'updated_at': self.updated_at.strftime('%d.%m.%Y %H:%M'),
        }


class WorkPrice(models.Model):
    """
    Модель «Цена работы в зависимости от количества листов» (опорные точки).
    Остаётся без изменений, но цены в этой таблице считаются уже с наценкой,
    т.е. пользователь должен вводить итоговую цену (а не себестоимость).
    """
    work = models.ForeignKey(
        Work,
        on_delete=models.CASCADE,
        verbose_name='Работа',
        related_name='work_prices',
    )
    sheets = models.PositiveIntegerField(
        verbose_name='Количество листов',
        help_text='Введите количество листов для опорной точки',
        validators=[MinValueValidator(1)],
    )
    price = models.DecimalField(
        verbose_name='Цена (руб.)',
        help_text='Итоговая цена работы при данном количестве листов (включая наценку)',
        max_digits=10,
        decimal_places=2,
        default=0.00,
        validators=[MinValueValidator(0)],
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='Дата создания')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='Дата обновления')

    class Meta:
        ordering = ['work', 'sheets']
        verbose_name = 'Цена работы за листы'
        verbose_name_plural = 'Цены работы за листы'
        indexes = [
            models.Index(fields=['work']),
            models.Index(fields=['sheets']),
        ]
        unique_together = ['work', 'sheets']

    def __str__(self):
        return f"{self.work.name}: {self.sheets} лист. - {self.price} руб."

    def get_price_display(self):
        return f"{self.price:.2f} руб."

    def get_sheets_display(self):
        return f"{self.sheets} лист."

    def to_dict(self):
        return {
            'id': self.id,
            'work_id': self.work.id,
            'work_name': self.work.name,
            'sheets': self.sheets,
            'sheets_display': self.get_sheets_display(),
            'price': float(self.price),
            'price_display': self.get_price_display(),
            'created_at': self.created_at.strftime('%d.%m.%Y %H:%M'),
            'updated_at': self.updated_at.strftime('%d.%m.%Y %H:%M'),
        }

    def save(self, *args, **kwargs):
        if self.sheets <= 0:
            raise ValueError("Количество листов должно быть положительным")
        if self.price < 0:
            raise ValueError("Цена не может быть отрицательной")
        super().save(*args, **kwargs)


class WorkCirculationPrice(models.Model):
    """
    Модель «Цена работы в зависимости от тиража» (опорные точки).
    Аналогично WorkPrice, но для тиража.
    """
    work = models.ForeignKey(
        Work,
        on_delete=models.CASCADE,
        verbose_name='Работа',
        related_name='circulation_prices'
    )
    circulation = models.PositiveIntegerField(
        verbose_name='Тираж',
        help_text='Количество экземпляров (тираж) для опорной точки',
        validators=[MinValueValidator(1)],
    )
    price = models.DecimalField(
        verbose_name='Цена (руб.)',
        help_text='Итоговая цена работы при данном тираже (включая наценку)',
        max_digits=10,
        decimal_places=2,
        default=0.00,
        validators=[MinValueValidator(0)],
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='Дата создания')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='Дата обновления')

    class Meta:
        ordering = ['work', 'circulation']
        verbose_name = 'Цена работы за тираж'
        verbose_name_plural = 'Цены работы за тираж'
        indexes = [
            models.Index(fields=['work']),
            models.Index(fields=['circulation']),
        ]
        unique_together = ['work', 'circulation']

    def __str__(self):
        return f"{self.work.name}: тираж {self.circulation} – {self.price} руб."

    def get_price_display(self):
        return f"{self.price:.2f} руб."

    def get_circulation_display(self):
        return f"{self.circulation} экз."

    def to_dict(self):
        return {
            'id': self.id,
            'work_id': self.work.id,
            'work_name': self.work.name,
            'circulation': self.circulation,
            'circulation_display': self.get_circulation_display(),
            'price': float(self.price),
            'price_display': self.get_price_display(),
            'created_at': self.created_at.strftime('%d.%m.%Y %H:%M'),
            'updated_at': self.updated_at.strftime('%d.%m.%Y %H:%M'),
        }