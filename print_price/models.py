"""
models.py для приложения print_price
Модели для хранения цен на печать (принтеры) и на ламинирование (ламинаторы).
Каждая запись содержит себестоимость (cost) и наценку (markup_percent),
а цена за единицу (лист) вычисляется автоматически.

ДОБАВЛЕНО: поддержка двух типов печати — цветная (color) и чёрно-белая (bw).
"""

from django.db import models
from django.core.validators import MinValueValidator
from decimal import Decimal

# Импортируем модели устройств из приложения devices
from devices.models import Printer, Laminator


class PrintPrice(models.Model):
    """
    Модель «Цена печати за 1 лист» для принтеров.
    Связывает принтер с тиражом, себестоимостью и наценкой.
    """

    # ---------- НОВОЕ ПОЛЕ: тип печати (цветная / ч/б) ----------
    PRINT_TYPE_CHOICES = [
        ('color', 'Цветная печать'),
        ('bw', 'Чёрно-белая печать'),
    ]

    print_type = models.CharField(
        max_length=10,
        choices=PRINT_TYPE_CHOICES,
        default='color',                     # по умолчанию цветная (для обратной совместимости)
        verbose_name='Тип печати',
        help_text='Выберите тип печати: цветная или чёрно-белая',
    )

    printer = models.ForeignKey(
        Printer,
        on_delete=models.CASCADE,
        verbose_name='Принтер',
        help_text='Выберите принтер, для которого устанавливается цена',
        related_name='print_prices',          # обратная связь: printer.print_prices.all()
    )

    copies = models.PositiveIntegerField(
        verbose_name='Тираж (количество копий)',
        help_text='Введите количество экземпляров для печати',
        default=1,
        validators=[MinValueValidator(1)],
    )

    cost = models.DecimalField(
        verbose_name='Себестоимость (руб.)',
        help_text='Себестоимость печати одного листа при данном тираже (без наценки)',
        max_digits=10,
        decimal_places=2,
        default=0.00,
        validators=[MinValueValidator(0)],
    )

    markup_percent = models.DecimalField(
        verbose_name='Наценка (%)',
        help_text='Процент наценки от себестоимости (например, 20.00)',
        max_digits=5,
        decimal_places=2,
        default=0.00,
        validators=[MinValueValidator(0)],
    )

    price_per_sheet = models.DecimalField(
        verbose_name='Цена за 1 лист (руб.)',
        help_text='Итоговая цена печати одного листа = себестоимость + наценка',
        max_digits=10,
        decimal_places=2,
        default=0.00,
        validators=[MinValueValidator(0)],
    )

    created_at = models.DateTimeField(auto_now_add=True, verbose_name='Дата создания')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='Дата обновления')

    class Meta:
        ordering = ['printer', 'print_type', 'copies']   # сортировка сначала по принтеру, потом по типу печати, потом по тиражу
        verbose_name = 'Цена печати за лист (принтер)'
        verbose_name_plural = 'Цены печати за лист (принтеры)'
        indexes = [
            models.Index(fields=['printer']),
            models.Index(fields=['copies']),
            models.Index(fields=['print_type']),       # добавили индекс для быстрой фильтрации по типу
        ]
        # Уникальность теперь учитывает тип печати: один принтер + один тираж + один тип печати
        unique_together = ['printer', 'copies', 'print_type']

    def __str__(self):
        # Отображаем тип печати в строковом представлении
        type_display = self.get_print_type_display()
        return f"{self.printer.name} ({type_display}): тираж {self.copies} шт. — {self.price_per_sheet:.2f} руб./лист"

    def calculate_price(self):
        """Пересчитывает цену за лист на основе себестоимости и наценки."""
        if self.cost is not None and self.markup_percent is not None:
            self.price_per_sheet = self.cost + (self.cost * self.markup_percent / Decimal('100'))
        else:
            self.price_per_sheet = Decimal('0.00')

    def get_total_price(self):
        """Общая стоимость за весь тираж."""
        return self.price_per_sheet * self.copies

    def get_total_price_display(self):
        return f"{self.get_total_price():.2f} руб."

    def get_copies_display(self):
        return f"{self.copies} шт."

    def get_price_per_sheet_display(self):
        return f"{self.price_per_sheet:.2f} руб./лист"

    def get_cost_display(self):
        return f"{self.cost:.2f} руб."

    def get_markup_percent_display(self):
        return f"{self.markup_percent}%"

    def get_print_type_display(self):
        """Возвращает человеко-читаемое название типа печати."""
        return dict(self.PRINT_TYPE_CHOICES).get(self.print_type, self.print_type)

    def to_dict(self):
        """Преобразует объект в словарь для JSON-ответов (AJAX)."""
        return {
            'id': self.id,
            'printer_id': self.printer.id,
            'printer_name': self.printer.name,
            'print_type': self.print_type,
            'print_type_display': self.get_print_type_display(),
            'copies': self.copies,
            'copies_display': self.get_copies_display(),
            'cost': float(self.cost),
            'cost_display': self.get_cost_display(),
            'markup_percent': float(self.markup_percent),
            'markup_percent_display': self.get_markup_percent_display(),
            'price_per_sheet': float(self.price_per_sheet),
            'price_per_sheet_display': self.get_price_per_sheet_display(),
            'total_price': float(self.get_total_price()),
            'total_price_display': self.get_total_price_display(),
            'created_at': self.created_at.strftime('%d.%m.%Y %H:%M'),
            'updated_at': self.updated_at.strftime('%d.%m.%Y %H:%M'),
        }

    def save(self, *args, **kwargs):
        """Перед сохранением пересчитываем цену за лист."""
        self.calculate_price()
        super().save(*args, **kwargs)


# ==================== МОДЕЛЬ ДЛЯ ЛАМИНАТОРОВ (НЕ ТРОГАЕМ) ====================

class LaminatorPrice(models.Model):
    """
    Модель «Цена ламинирования за 1 лист» для ламинаторов.
    Полностью аналогична PrintPrice, но связана с Laminator.
    (без изменений, оставляем как было)
    """

    laminator = models.ForeignKey(
        Laminator,
        on_delete=models.CASCADE,
        verbose_name='Ламинатор',
        help_text='Выберите ламинатор, для которого устанавливается цена',
        related_name='laminator_prices',
    )

    copies = models.PositiveIntegerField(
        verbose_name='Тираж (количество копий)',
        help_text='Введите количество экземпляров для ламинирования',
        default=1,
        validators=[MinValueValidator(1)],
    )

    cost = models.DecimalField(
        verbose_name='Себестоимость (руб.)',
        help_text='Себестоимость ламинирования одного листа при данном тираже (без наценки)',
        max_digits=10,
        decimal_places=2,
        default=0.00,
        validators=[MinValueValidator(0)],
    )

    markup_percent = models.DecimalField(
        verbose_name='Наценка (%)',
        help_text='Процент наценки от себестоимости',
        max_digits=5,
        decimal_places=2,
        default=0.00,
        validators=[MinValueValidator(0)],
    )

    price_per_sheet = models.DecimalField(
        verbose_name='Цена за 1 лист (руб.)',
        help_text='Итоговая цена ламинирования одного листа = себестоимость + наценка',
        max_digits=10,
        decimal_places=2,
        default=0.00,
        validators=[MinValueValidator(0)],
    )

    created_at = models.DateTimeField(auto_now_add=True, verbose_name='Дата создания')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='Дата обновления')

    class Meta:
        ordering = ['laminator', 'copies']
        verbose_name = 'Цена ламинирования за лист (ламинатор)'
        verbose_name_plural = 'Цены ламинирования за лист (ламинаторы)'
        indexes = [
            models.Index(fields=['laminator']),
            models.Index(fields=['copies']),
        ]
        unique_together = ['laminator', 'copies']

    def __str__(self):
        return f"{self.laminator.name}: тираж {self.copies} шт. — {self.price_per_sheet:.2f} руб./лист"

    def calculate_price(self):
        if self.cost is not None and self.markup_percent is not None:
            self.price_per_sheet = self.cost + (self.cost * self.markup_percent / Decimal('100'))
        else:
            self.price_per_sheet = Decimal('0.00')

    def get_total_price(self):
        return self.price_per_sheet * self.copies

    def get_total_price_display(self):
        return f"{self.get_total_price():.2f} руб."

    def get_copies_display(self):
        return f"{self.copies} шт."

    def get_price_per_sheet_display(self):
        return f"{self.price_per_sheet:.2f} руб./лист"

    def get_cost_display(self):
        return f"{self.cost:.2f} руб."

    def get_markup_percent_display(self):
        return f"{self.markup_percent}%"

    def to_dict(self):
        return {
            'id': self.id,
            'laminator_id': self.laminator.id,
            'laminator_name': self.laminator.name,
            'copies': self.copies,
            'copies_display': self.get_copies_display(),
            'cost': float(self.cost),
            'cost_display': self.get_cost_display(),
            'markup_percent': float(self.markup_percent),
            'markup_percent_display': self.get_markup_percent_display(),
            'price_per_sheet': float(self.price_per_sheet),
            'price_per_sheet_display': self.get_price_per_sheet_display(),
            'total_price': float(self.get_total_price()),
            'total_price_display': self.get_total_price_display(),
            'created_at': self.created_at.strftime('%d.%m.%Y %H:%M'),
            'updated_at': self.updated_at.strftime('%d.%m.%Y %H:%M'),
        }

    def save(self, *args, **kwargs):
        self.calculate_price()
        super().save(*args, **kwargs)