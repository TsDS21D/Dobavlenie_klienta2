"""
models.py для приложения print_price
Модель для хранения цен на печать (цена за 1 лист) для каждого принтера
"""

from django.db import models
from django.core.validators import MinValueValidator
from devices.models import Printer  # Импортируем модель принтера из приложения devices


class PrintPrice(models.Model):
    """
    Модель "Цена печати за 1 лист"
    
    Связывает принтер с тиражом и ценой за 1 лист при этом тираже.
    Каждая запись: для конкретного принтера, конкретного тиража - цена за 1 лист.
    """
    
    # Связь с принтером (один принтер - много цен)
    printer = models.ForeignKey(
        Printer,
        on_delete=models.CASCADE,  # При удалении принтера удаляем все связанные цены
        verbose_name='Принтер',
        help_text='Выберите принтер для которого устанавливается цена',
        related_name='print_prices',  # Обратная связь: printer.print_prices.all()
    )
    
    # Количество копий (тираж)
    copies = models.PositiveIntegerField(
        verbose_name='Тираж (количество копий)',
        help_text='Введите количество экземпляров для печати',
        default=1,  # Значение по умолчанию: 1 копия
        validators=[
            MinValueValidator(1),  # Минимум 1 копия
        ],
    )
    
    # Цена за 1 лист при данном тираже (в рублях)
    price_per_sheet = models.DecimalField(
        verbose_name='Цена за 1 лист (руб.)',
        help_text='Введите цену печати одного листа при указанном тираже',
        max_digits=10,  # Максимум 10 цифр (включая дробную часть)
        decimal_places=2,  # 2 знака после запятой (копейки)
        default=0.00,  # Значение по умолчанию: 0 рублей
        validators=[
            MinValueValidator(0),  # Цена не может быть отрицательной
        ],
    )
    
    # Дата и время создания записи
    created_at = models.DateTimeField(
        auto_now_add=True,  # Автоматически устанавливается при создании
        verbose_name='Дата создания',
    )
    
    # Дата и время последнего обновления
    updated_at = models.DateTimeField(
        auto_now=True,  # Автоматически обновляется при сохранении
        verbose_name='Дата обновления',
    )
    
    # Метаданные модели
    class Meta:
        # Сортировка по умолчанию: по принтеру, затем по тиражу (от меньшего к большему)
        ordering = ['printer', 'copies']
        
        # Человеко-читаемые имена
        verbose_name = 'Цена печати за лист'
        verbose_name_plural = 'Цены печати за лист'
        
        # Индексы для оптимизации запросов
        indexes = [
            models.Index(fields=['printer']),  # Для быстрого поиска по принтеру
            models.Index(fields=['copies']),   # Для быстрой сортировки по тиражу
        ]
        
        # Уникальность: для одного принтера не может быть двух одинаковых тиражей
        # Это предотвращает дублирование цен для одного и того же тиража
        unique_together = ['printer', 'copies']
    
    def __str__(self):
        """
        Строковое представление объекта
        
        Returns:
            str: Принтер + тираж + цена за лист
        """
        return f"{self.printer.name}: {self.copies} шт. - {self.price_per_sheet} руб./лист"
    
    def get_total_price(self):
        """
        Рассчитывает общую стоимость за тираж
        
        Returns:
            Decimal: Общая стоимость (цена_за_лист * количество_копий)
        """
        # Используем round для точного округления до 2 знаков
        from decimal import Decimal, ROUND_HALF_UP
        total = self.price_per_sheet * self.copies
        return total.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    
    def get_total_price_display(self):
        """
        Возвращает отформатированную общую стоимость
        
        Returns:
            str: Строка вида "250.00 руб."
        """
        total = self.get_total_price()
        return f"{total:.2f} руб."
    
    def get_copies_display(self):
        """
        Возвращает отформатированное количество копий
        
        Returns:
            str: Строка вида "100 шт."
        """
        return f"{self.copies} шт."
    
    def get_price_per_sheet_display(self):
        """
        Возвращает отформатированную цену за 1 лист
        
        Returns:
            str: Строка вида "2.50 руб./лист"
        """
        return f"{self.price_per_sheet:.2f} руб./лист"
    
    def to_dict(self):
        """
        Преобразует объект в словарь для передачи в JSON
        
        Returns:
            dict: Словарь с данными цены
        """
        # Преобразуем Decimal в float для JSON
        price_per_sheet_float = float(self.price_per_sheet)
        # Форматируем до 2 знаков после запятой
        price_per_sheet_formatted = f"{price_per_sheet_float:.2f}"
        
        return {
            'id': self.id,
            'printer_id': self.printer.id,
            'printer_name': self.printer.name,
            'copies': self.copies,
            'copies_display': self.get_copies_display(),
            'price_per_sheet': price_per_sheet_float,
            'price_per_sheet_display': self.get_price_per_sheet_display(),
            'total_price': float(self.get_total_price()),
            'total_price_display': self.get_total_price_display(),
            'created_at': self.created_at.strftime('%d.%m.%Y %H:%M'),
            'updated_at': self.updated_at.strftime('%d.%m.%Y %H:%M'),
        }
    
    def save(self, *args, **kwargs):
        """
        Переопределяем метод сохранения для валидации
        
        Проверяем, что тираж положительный и цена неотрицательная
        """
        # Проверяем, что тираж положительный
        if self.copies <= 0:
            raise ValueError("Количество копий должно быть положительным")
        
        # Проверяем, что цена неотрицательная
        if self.price_per_sheet < 0:
            raise ValueError("Цена не может быть отрицательной")
        
        # Вызываем оригинальный метод save
        super().save(*args, **kwargs)