"""
models.py
Модели базы данных для приложения devices.
Здесь определяем структуру таблиц для хранения информации об устройствах типографии.
"""

from django.db import models
from django.core.validators import MinValueValidator


class Printer(models.Model):
    """
    Модель Printer (Принтер) - основная сущность приложения devices.
    Хранит информацию о принтерах/печатных устройствах в типографии.
    
    Содержит поля:
    - название принтера
    - формат листа (текстовое название, например "SRA3")
    - ширину листа в миллиметрах
    - высоту листа в миллиметрах
    - поля (незапечатываемые области листа) в миллиметрах
    - коэффициент увеличения при двусторонней печати
    """
    
    # Название принтера - основное поле для идентификации устройства
    name = models.CharField(
        max_length=200,                    # Максимальная длина 200 символов
        verbose_name='Название принтера',  # Человеко-читаемое имя поля
        help_text='Введите название принтера (например, "RICOH Pro C7200S")',  # Подсказка для пользователя
        unique=True,                       # Уникальность названия - не может быть двух одинаковых принтеров
    )
    
    # Формат листа - текстовое обозначение формата (например, SRA3, A4, A3+)
    sheet_format = models.CharField(
        max_length=50,                     # Максимальная длина 50 символов
        verbose_name='Формат листа',       # Человеко-читаемое имя поля
        help_text='Введите обозначение формата (например, "SRA3", "A4", "A3+")',  # Подсказка для пользователя
    )
    
    # Ширина листа в миллиметрах - числовое значение
    width_mm = models.IntegerField(
        verbose_name='Ширина (мм)',        # Человеко-читаемое имя поля
        help_text='Введите ширину листа в миллиметрах (например, 320)',  # Подсказка для пользователя
        validators=[MinValueValidator(1)], # Валидатор: ширина должна быть не меньше 1 мм
    )
    
    # Высота листа в миллиметрах - числовое значение
    height_mm = models.IntegerField(
        verbose_name='Высота (мм)',        # Человеко-читаемое имя поля
        help_text='Введите высоту листа в миллиметрах (например, 450)',  # Подсказка для пользователя
        validators=[MinValueValidator(1)], # Валидатор: высота должна быть не меньше 1 мм
    )
    
    # Поля (незапечатываемые области) листа в миллиметрах - числовое значение
    margin_mm = models.IntegerField(
        verbose_name='Поля (мм)',          # Человеко-читаемое имя поля
        help_text='Введите размер незапечатываемых полей листа в миллиметрах (обычно 5)',  # Подсказка для пользователя
        default=5,                         # Значение по умолчанию: 5 мм
        validators=[MinValueValidator(0)], # Валидатор: поля должны быть не меньше 0 мм
    )
    
    # Коэффициент увеличения при двусторонней печати - дробное число
    duplex_coefficient = models.FloatField(
        verbose_name='Коэффициент двусторонней печати',  # Человеко-читаемое имя поля
        help_text='Введите коэффициент увеличения при двусторонней печати (обычно 2.0)',  # Подсказка для пользователя
        default=2.0,                      # Значение по умолчанию: 2.0
        validators=[MinValueValidator(1.0)], # Валидатор: коэффициент должен быть не меньше 1.0
    )
    
    class Meta:
        """
        Мета-класс для дополнительных настроек модели.
        
        Attributes:
            ordering (list): Порядок сортировки по умолчанию
            verbose_name (str): Единственное число для отображения
            verbose_name_plural (str): Множественное число для отображения
            indexes (list): Индексы для оптимизации запросов
        """
        
        # Сортировка по имени в алфавитном порядке
        ordering = ['name']
        
        # Человеко-читаемые имена для админ-панели
        verbose_name = 'Принтер'
        verbose_name_plural = 'Принтеры'
        
        # Индексы для ускорения поиска
        indexes = [
            models.Index(fields=['name']),           # Индекс для поиска по имени
            models.Index(fields=['sheet_format']),   # Индекс для поиска по формату
        ]
    
    def __str__(self):
        """
        Строковое представление объекта принтера.
        
        Returns:
            str: Название принтера и его формат
        """
        return f"{self.name} ({self.sheet_format})"
    
    def get_dimensions_display(self):
        """
        Возвращает строку с размерами принтера в читаемом формате.
        
        Returns:
            str: Строка вида "320×450 мм"
        """
        return f"{self.width_mm}×{self.height_mm} мм"
    
    def get_margin_display(self):
        """
        Возвращает строку с размерами полей.
        
        Returns:
            str: Строка вида "5 мм"
        """
        return f"{self.margin_mm} мм"
    
    def get_duplex_display(self):
        """
        Возвращает строку с коэффициентом двусторонней печати.
        
        Returns:
            str: Строка вида "2.0"
        """
        # Форматируем число: если целое, то без десятичной части, иначе с одной цифрой после запятой
        if self.duplex_coefficient.is_integer():
            return f"{int(self.duplex_coefficient)}"
        else:
            return f"{self.duplex_coefficient:.1f}"
    
    def to_dict(self):
        """
        Преобразует объект принтера в словарь для передачи в шаблон или JSON.
        
        Returns:
            dict: Словарь с данными принтера
        """
        return {
            'id': self.id,
            'name': self.name,
            'sheet_format': self.sheet_format,
            'width_mm': self.width_mm,
            'height_mm': self.height_mm,
            'margin_mm': self.margin_mm,
            'duplex_coefficient': self.duplex_coefficient,
            'dimensions_display': self.get_dimensions_display(),
            'margin_display': self.get_margin_display(),
            'duplex_display': self.get_duplex_display(),
        }