"""
models.py для приложения sheet_formats
Модель для хранения форматов печатных листов
"""

from django.db import models
from django.core.validators import MinValueValidator


class SheetFormat(models.Model):
    """
    Модель "Формат печатного листа"
    Хранит информацию о форматах бумаги: название, ширина, высота
    """
    
    # Название формата (например, "SRA3", "A4", "A3+")
    name = models.CharField(
        max_length=50,
        verbose_name='Наименование формата',
        help_text='Введите название формата (например, "SRA3", "A4", "A3+")',
        unique=True,  # Форматы должны быть уникальными
    )
    
    # Ширина листа в миллиметрах
    width_mm = models.IntegerField(
        verbose_name='Ширина (мм)',
        help_text='Введите ширину листа в миллиметрах',
        validators=[MinValueValidator(1)],  # Ширина должна быть положительной
    )
    
    # Высота листа в миллиметрах
    height_mm = models.IntegerField(
        verbose_name='Высота (мм)',
        help_text='Введите высоту листа в миллиметрах',
        validators=[MinValueValidator(1)],  # Высота должна быть положительной
    )
    
    class Meta:
        """
        Мета-класс для дополнительных настроек модели
        """
        # Сортировка по названию в алфавитном порядке
        ordering = ['name']
        
        # Человеко-читаемые имена для админ-панели
        verbose_name = 'Формат печатного листа'
        verbose_name_plural = 'Форматы печатных листов'
        
        # Индексы для оптимизации запросов
        indexes = [
            models.Index(fields=['name']),  # Индекс для быстрого поиска по имени
        ]
    
    def __str__(self):
        """
        Строковое представление объекта формата
        Returns:
            str: Название формата и его размеры
        """
        return f"{self.name} ({self.width_mm}×{self.height_mm} мм)"
    
    def get_dimensions_display(self):
        """
        Возвращает строку с размерами в читаемом формате
        Returns:
            str: Строка вида "320×450 мм"
        """
        return f"{self.width_mm}×{self.height_mm} мм"
    
    def to_dict(self):
        """
        Преобразует объект в словарь для передачи в шаблон или JSON
        Returns:
            dict: Словарь с данными формата
        """
        return {
            'id': self.id,
            'name': self.name,
            'width_mm': self.width_mm,
            'height_mm': self.height_mm,
            'dimensions_display': self.get_dimensions_display(),
        }