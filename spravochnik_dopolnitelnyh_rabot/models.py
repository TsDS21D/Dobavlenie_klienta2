"""
models.py для приложения spravochnik_dopolnitelnyh_rabot.
Добавлена модель WorkPrice (опорные точки цены в зависимости от количества листов)
и поле interpolation_method в модель Work.
Также добавлена модель WorkCirculationPrice для цен по тиражу.
"""

from django.db import models
from django.core.validators import MinValueValidator

class Work(models.Model):
    """
    Модель «Работа» – хранит информацию о дополнительной работе типографии.
    Добавлено поле interpolation_method для выбора метода интерполяции цены.
    ДОБАВЛЕНО: поле k_lines – коэффициент усиления влияния резов для формулы 4.
    """

    # Типы формул для расчёта стоимости работы (без изменений)
    FORMULA_CHOICES = [
        (1, 'Фиксированная цена'),                         # без изменений
        (2, 'Тираж × Цена (интерполяция по тиражу)'),
        (3, 'Цена × Тираж × (Количество резов × Коэффициент)'),  # новая логика
        (4, 'Количество листов × Цена × Количество резов (логарифмическая)'), # старая логарифмическая
        (5, 'Количество изделий на листе × Цена × Количество листов'),        # без изменений
        (6, 'Количество изделий на листе × Цена × Тираж'),                    # без изменений
    ]

    # ВАРИАНТЫ МЕТОДОВ ИНТЕРПОЛЯЦИИ (аналогично принтерам в print_price)
    INTERPOLATION_CHOICES = [
        ('linear', 'Линейная'),
        ('logarithmic', 'Логарифмическая'),
    ]

    name = models.CharField(
        max_length=255,
        verbose_name='Название работы',
        help_text='Введите наименование дополнительной работы'
    )

    price = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        verbose_name='Цена (руб)',
        validators=[MinValueValidator(0)],
        help_text='Базовая цена (может быть интерполирована при расчёте)'
    )

    formula_type = models.PositiveSmallIntegerField(
        choices=FORMULA_CHOICES,
        default=1,
        verbose_name='Формула расчёта',
        help_text='Выберите формулу для вычисления стоимости'
    )

    # НОВОЕ ПОЛЕ: метод интерполяции цены по количеству листов
    interpolation_method = models.CharField(
        max_length=20,
        choices=INTERPOLATION_CHOICES,
        default='linear',
        verbose_name='Метод интерполяции цены',
        help_text='Способ расчёта цены для произвольного количества листов между опорными точками'
    )

    # ===== ДОБАВЛЕНО: коэффициент усиления влияния резов для формулы 4 =====
    k_lines = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=2.0,
        verbose_name='Коэффициент резов',
        help_text='Коэффициент, усиливающий влияние количества резов в формуле 4. Чем больше, тем сильнее влияние.'
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

    def to_dict(self):
        """Преобразует объект в словарь для JSON (AJAX)."""
        return {
            'id': self.id,
            'name': self.name,
            'price': str(self.price),
            'price_display': f"{self.price} руб.",
            'formula_type': self.formula_type,
            'formula_display': self.get_formula_type_display(),
            'interpolation_method': self.interpolation_method,
            'interpolation_method_display': self.get_interpolation_method_display(),
            'k_lines': str(self.k_lines),                      # ДОБАВЛЕНО
            'default_lines_count': self.default_lines_count,
            'default_items_per_sheet': self.default_items_per_sheet,
            'created_at': self.created_at.strftime('%d.%m.%Y %H:%M'),
            'updated_at': self.updated_at.strftime('%d.%m.%Y %H:%M'),
        }


class WorkPrice(models.Model):
    """
    Модель «Цена работы в зависимости от количества листов» (опорные точки).
    Связывает работу с количеством листов и ценой за это количество.
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
        help_text='Цена работы при данном количестве листов',
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


# НОВАЯ МОДЕЛЬ: цены работы в зависимости от тиража
class WorkCirculationPrice(models.Model):
    """
    Модель «Цена работы в зависимости от тиража» (опорные точки).
    Связывает работу с количеством экземпляров (тиражом) и ценой за это количество.
    Используется для формул, где цена зависит от тиража (например, формула 3).
    """
    work = models.ForeignKey(
        Work,
        on_delete=models.CASCADE,
        verbose_name='Работа',
        related_name='circulation_prices'   # имя related_name для доступа work.circulation_prices.all()
    )
    circulation = models.PositiveIntegerField(
        verbose_name='Тираж',
        help_text='Количество экземпляров (тираж) для опорной точки',
        validators=[MinValueValidator(1)],
    )
    price = models.DecimalField(
        verbose_name='Цена (руб.)',
        help_text='Цена работы при данном тираже',
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
        # Уникальность: для одной работы не может быть двух одинаковых тиражей
        unique_together = ['work', 'circulation']

    def __str__(self):
        return f"{self.work.name}: тираж {self.circulation} – {self.price} руб."

    def get_price_display(self):
        """Возвращает отформатированную цену."""
        return f"{self.price:.2f} руб."

    def get_circulation_display(self):
        """Возвращает отформатированный тираж."""
        return f"{self.circulation} экз."

    def to_dict(self):
        """Преобразует объект в словарь для JSON (AJAX)."""
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