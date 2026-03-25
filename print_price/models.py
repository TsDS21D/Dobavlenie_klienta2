"""
models.py для приложения print_price
Модель для хранения цен на печать (себестоимость и наценка) для каждого принтера.
Теперь каждая запись содержит себестоимость (cost) и наценку (markup_percent),
а цена за лист (price_per_sheet) вычисляется автоматически.
"""

from django.db import models
from django.core.validators import MinValueValidator
from decimal import Decimal
from devices.models import Printer  # Импортируем модель принтера из приложения devices


class PrintPrice(models.Model):
    """
    Модель «Цена печати за 1 лист» с себестоимостью и наценкой.
    Связывает принтер с тиражом, себестоимостью и наценкой.
    Цена за лист рассчитывается как cost + cost * (markup_percent / 100)
    """

    # Связь с принтером (один принтер – много цен)
    printer = models.ForeignKey(
        Printer,
        on_delete=models.CASCADE,               # При удалении принтера удаляются все связанные цены
        verbose_name='Принтер',
        help_text='Выберите принтер, для которого устанавливается цена',
        related_name='print_prices',            # Обратная связь: printer.print_prices.all()
    )

    # Количество копий (тираж) – опорная точка
    copies = models.PositiveIntegerField(
        verbose_name='Тираж (количество копий)',
        help_text='Введите количество экземпляров для печати',
        default=1,
        validators=[MinValueValidator(1)],      # Тираж не может быть меньше 1
    )

    # ===== НОВЫЕ ПОЛЯ: себестоимость и наценка =====
    cost = models.DecimalField(
        verbose_name='Себестоимость (руб.)',
        help_text='Себестоимость печати одного листа при данном тираже (без наценки)',
        max_digits=10,                          # Всего цифр: 10 (например, 1234567.89)
        decimal_places=2,                       # Два знака после запятой (копейки)
        default=0.00,
        validators=[MinValueValidator(0)],       # Себестоимость не может быть отрицательной
    )

    markup_percent = models.DecimalField(
        verbose_name='Наценка (%)',
        help_text='Процент наценки от себестоимости (например, 20.00)',
        max_digits=5,
        decimal_places=2,
        default=0.00,
        validators=[MinValueValidator(0)],       # Наценка не может быть отрицательной
    )

    # ===== ВЫЧИСЛЯЕМОЕ ПОЛЕ: цена за лист с наценкой =====
    # Храним в базе для удобства, но пересчитываем при сохранении
    price_per_sheet = models.DecimalField(
        verbose_name='Цена за 1 лист (руб.)',
        help_text='Итоговая цена печати одного листа = себестоимость + наценка',
        max_digits=10,
        decimal_places=2,
        default=0.00,
        validators=[MinValueValidator(0)],
    )

    # Дата и время создания записи
    created_at = models.DateTimeField(
        auto_now_add=True,
        verbose_name='Дата создания',
    )

    # Дата и время последнего обновления
    updated_at = models.DateTimeField(
        auto_now=True,
        verbose_name='Дата обновления',
    )

    class Meta:
        # Сортировка по умолчанию: по принтеру, затем по тиражу
        ordering = ['printer', 'copies']

        # Человеко-читаемые имена
        verbose_name = 'Цена печати за лист'
        verbose_name_plural = 'Цены печати за лист'

        # Индексы для ускорения запросов
        indexes = [
            models.Index(fields=['printer']),
            models.Index(fields=['copies']),
        ]

        # Уникальность: для одного принтера не может быть двух одинаковых тиражей
        unique_together = ['printer', 'copies']

    def __str__(self):
        """
        Строковое представление объекта
        """
        return f"{self.printer.name}: тираж {self.copies} шт. — себест. {self.cost:.2f} руб., наценка {self.markup_percent}% -> {self.price_per_sheet:.2f} руб./лист"

    def calculate_price(self):
        """
        Пересчитывает цену за лист на основе себестоимости и наценки.
        Используется в методе save().
        """
        if self.cost is not None and self.markup_percent is not None:
            # price = cost + cost * (markup_percent / 100)
            self.price_per_sheet = self.cost + (self.cost * self.markup_percent / Decimal('100'))
        else:
            self.price_per_sheet = Decimal('0.00')

    def get_total_price(self):
        """
        Рассчитывает общую стоимость за тираж: цена_за_лист * тираж
        """
        return self.price_per_sheet * self.copies

    def get_total_price_display(self):
        """
        Возвращает отформатированную общую стоимость
        """
        total = self.get_total_price()
        return f"{total:.2f} руб."

    def get_copies_display(self):
        """
        Возвращает отформатированное количество копий
        """
        return f"{self.copies} шт."

    def get_price_per_sheet_display(self):
        """
        Возвращает отформатированную цену за лист
        """
        return f"{self.price_per_sheet:.2f} руб./лист"

    def get_cost_display(self):
        """
        Отформатированная себестоимость
        """
        return f"{self.cost:.2f} руб."

    def get_markup_percent_display(self):
        """
        Отформатированная наценка
        """
        return f"{self.markup_percent}%"

    def to_dict(self):
        """
        Преобразует объект в словарь для передачи в JSON (используется в AJAX)
        """
        return {
            'id': self.id,
            'printer_id': self.printer.id,
            'printer_name': self.printer.name,
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
        """
        Переопределяем метод сохранения:
        1. Пересчитываем price_per_sheet на основе cost и markup_percent
        2. Сохраняем объект
        """
        # Если есть себестоимость и наценка, пересчитываем цену
        if self.cost is not None and self.markup_percent is not None:
            self.calculate_price()
        super().save(*args, **kwargs)