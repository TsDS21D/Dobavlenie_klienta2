"""
models.py для приложения devices
Модели базы данных для хранения информации о принтерах/устройствах типографии
"""

from django.db import models
from django.core.validators import MinValueValidator, MaxValueValidator
from sheet_formats.models import SheetFormat  # Импортируем модель форматов


class Printer(models.Model):
    """
    Модель "Принтер" - хранит информацию о печатных устройствах
    
    Каждый принтер связан с форматом листа из приложения sheet_formats
    """
    
    # Название принтера (уникальное)
    name = models.CharField(
        max_length=200,
        verbose_name='Название принтера',
        help_text='Введите уникальное название принтера',
        unique=True,
    )
    
    # Связь с форматом листа (ForeignKey вместо CharField)
    # При удалении формата устанавливаем защиту (нельзя удалить формат, если он используется)
    sheet_format = models.ForeignKey(
        SheetFormat,
        on_delete=models.PROTECT,  # Защита от удаления используемого формата
        verbose_name='Формат листа',
        help_text='Выберите формат листа из списка созданных форматов',
        related_name='printers',  # Обратная связь: формат.printers.all()
    )
    
    # Поля (незапечатываемые области) листа в миллиметрах
    margin_mm = models.IntegerField(
        verbose_name='Поля (мм)',
        help_text='Размер незапечатываемых полей листа в миллиметрах',
        default=5,  # Значение по умолчанию: 5 мм
        validators=[
            MinValueValidator(0),   # Минимальное значение: 0 мм
            MaxValueValidator(50),  # Максимальное значение: 50 мм
        ],
    )
    
    # Коэффициент увеличения при двусторонней печати
    duplex_coefficient = models.FloatField(
        verbose_name='Коэффициент двусторонней печати',
        help_text='Коэффициент увеличения при двусторонней печати',
        default=2.0,  # Значение по умолчанию: 2.0
        validators=[
            MinValueValidator(1.0),   # Минимальное значение: 1.0
            MaxValueValidator(10.0),  # Максимальное значение: 10.0
        ],
    )
    
    # Дата и время создания записи (автоматически добавляется при создании)
    created_at = models.DateTimeField(
        auto_now_add=True,  # Автоматически устанавливается при создании
        verbose_name='Дата создания',
    )
    
    # Дата и время последнего обновления (автоматически обновляется)
    updated_at = models.DateTimeField(
        auto_now=True,  # Автоматически обновляется при сохранении
        verbose_name='Дата обновления',
    )
    
    # Метаданные модели
    class Meta:
        # Сортировка по умолчанию: по названию (A-Z)
        ordering = ['name']
        
        # Человеко-читаемые имена для админ-панели
        verbose_name = 'Принтер'
        verbose_name_plural = 'Принтеры'
        
        # Индексы для оптимизации запросов
        indexes = [
            models.Index(fields=['name']),  # Индекс для поиска по названию
            models.Index(fields=['sheet_format']),  # Индекс для фильтрации по формату
            models.Index(fields=['created_at']),  # Индекс для сортировки по дате
        ]
    
    def __str__(self):
        """
        Строковое представление объекта принтера
        
        Returns:
            str: Название принтера и связанного формата
        """
        return f"{self.name} ({self.sheet_format.name})"
    
    def get_dimensions_display(self):
        """
        Возвращает строку с размерами формата в читаемом виде
        
        Returns:
            str: Строка вида "320×450 мм"
        """
        return self.sheet_format.get_dimensions_display()
    
    def get_margin_display(self):
        """
        Возвращает строку с размерами полей
        
        Returns:
            str: Строка вида "5 мм"
        """
        return f"{self.margin_mm} мм"
    
    def get_duplex_display(self):
        """
        Возвращает строку с коэффициентом
        
        Returns:
            str: Строка вида "2.0"
        """
        # Если коэффициент целый, показываем без десятичной части
        if self.duplex_coefficient.is_integer():
            return f"{int(self.duplex_coefficient)}"
        else:
            # Иначе показываем с одним знаком после запятой
            return f"{self.duplex_coefficient:.1f}"
    
    def to_dict(self):
        """
        Преобразует объект принтера в словарь для передачи в JSON
        
        Returns:
            dict: Словарь с данными принтера
        """
        return {
            'id': self.id,
            'name': self.name,
            'sheet_format': self.sheet_format.name,
            'sheet_format_id': self.sheet_format.id,
            'sheet_format_dimensions': self.sheet_format.get_dimensions_display(),
            'margin_mm': self.margin_mm,
            'duplex_coefficient': self.duplex_coefficient,
            'margin_display': self.get_margin_display(),
            'duplex_display': self.get_duplex_display(),
            'created_at': self.created_at.strftime('%d.%m.%Y %H:%M'),
            'updated_at': self.updated_at.strftime('%d.%m.%Y %H:%M'),
        }
    
    def save(self, *args, **kwargs):
        """
        Переопределяем метод сохранения для дополнительной логики
        
        Можно добавить проверки или логирование при сохранении
        """
        # Перед сохранением можно добавить валидацию
        if self.margin_mm < 0:
            raise ValueError("Поля не могут быть отрицательными")
        
        if self.duplex_coefficient < 1.0:
            raise ValueError("Коэффициент не может быть меньше 1.0")
        
        # Вызываем оригинальный метод save
        super().save(*args, **kwargs)