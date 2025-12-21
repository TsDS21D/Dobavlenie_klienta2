"""
forms.py
Формы Django для приложения devices.
Содержит формы для добавления и редактирования принтеров.
"""

from django import forms
from .models import Printer


class PrinterForm(forms.ModelForm):
    """
    Форма для добавления и редактирования принтеров.
    
    Наследуется от ModelForm для автоматической генерации полей из модели Printer.
    Содержит: название, формат листа, ширину, высоту, поля, коэффициент двусторонней печати.
    """
    
    class Meta:
        """
        Мета-класс для настройки формы.
        
        Attributes:
            model: Модель, на основе которой создается форма
            fields: Поля модели, которые будут в форме
            widgets: Виджеты для рендеринга полей формы
            labels: Пользовательские подписи для полей
            help_texts: Подсказки для полей
        """
        model = Printer
        fields = ['name', 'sheet_format', 'width_mm', 'height_mm', 'margin_mm', 'duplex_coefficient']
        
        # Настройка виджетов для полей формы
        widgets = {
            'name': forms.TextInput(attrs={
                'class': 'form-control',  # CSS класс для стилизации
                'placeholder': 'Например: RICOH Pro C7200S',  # Подсказка внутри поля
                'autofocus': True,  # Автофокус при открытии формы
            }),
            'sheet_format': forms.TextInput(attrs={
                'class': 'form-control',  # CSS класс для стилизации
                'placeholder': 'Например: SRA3, A4, A3+',  # Подсказка внутри поля
            }),
            'width_mm': forms.NumberInput(attrs={
                'class': 'form-control',  # CSS класс для стилизации
                'placeholder': 'Например: 320',  # Подсказка внутри поля
                'min': '1',  # Минимальное значение
                'step': '1',  # Шаг изменения значения
            }),
            'height_mm': forms.NumberInput(attrs={
                'class': 'form-control',  # CSS класс для стилизации
                'placeholder': 'Например: 450',  # Подсказка внутри поля
                'min': '1',  # Минимальное значение
                'step': '1',  # Шаг изменения значения
            }),
            'margin_mm': forms.NumberInput(attrs={
                'class': 'form-control',  # CSS класс для стилизации
                'placeholder': 'Например: 5',  # Подсказка внутри поля
                'min': '0',  # Минимальное значение (0 означает отсутствие полей)
                'step': '1',  # Шаг изменения значения
            }),
            'duplex_coefficient': forms.NumberInput(attrs={
                'class': 'form-control',  # CSS класс для стилизации
                'placeholder': 'Например: 2.0',  # Подсказка внутри поля
                'min': '1.0',  # Минимальное значение
                'step': '0.1',  # Шаг изменения значения (0.1)
            }),
        }
        
        # Пользовательские подписи для полей
        labels = {
            'name': 'Название принтера*',
            'sheet_format': 'Формат листа*',
            'width_mm': 'Ширина (мм)*',
            'height_mm': 'Высота (мм)*',
            'margin_mm': 'Поля (мм)',
            'duplex_coefficient': 'Коэфф. двусторонней печати',
        }
        
        # Подсказки для пользователя
        help_texts = {
            'name': 'Введите уникальное название принтера',
            'sheet_format': 'Введите обозначение формата (например, SRA3, A4, A3+)',
            'width_mm': 'Введите ширину листа в миллиметрах',
            'height_mm': 'Введите высоту листа в миллиметрах',
            'margin_mm': 'Введите размер незапечатываемых полей (обычно 5 мм)',
            'duplex_coefficient': 'Введите коэффициент увеличения при двусторонней печати (обычно 2.0)',
        }
    
    def clean_name(self):
        """
        Валидация поля name.
        
        Проверяет, что название принтера не пустое и уникально.
        
        Returns:
            str: Очищенное значение поля name
        
        Raises:
            forms.ValidationError: Если название пустое или уже существует
        """
        name = self.cleaned_data.get('name', '').strip()
        
        # Проверка на пустое значение
        if not name:
            raise forms.ValidationError('Название принтера не может быть пустым')
        
        # Проверка на уникальность (исключая текущий объект, если он есть)
        queryset = Printer.objects.filter(name=name)
        if self.instance and self.instance.pk:
            queryset = queryset.exclude(pk=self.instance.pk)
        
        if queryset.exists():
            raise forms.ValidationError('Принтер с таким названием уже существует')
        
        return name
    
    def clean_width_mm(self):
        """
        Валидация поля width_mm.
        
        Проверяет, что ширина листа является положительным числом.
        
        Returns:
            int: Очищенное значение поля width_mm
        
        Raises:
            forms.ValidationError: Если ширина не является положительным числом
        """
        width_mm = self.cleaned_data.get('width_mm')
        
        # Проверка на положительное значение
        if width_mm <= 0:
            raise forms.ValidationError('Ширина должна быть положительным числом')
        
        return width_mm
    
    def clean_height_mm(self):
        """
        Валидация поля height_mm.
        
        Проверяет, что высота листа является положительным числом.
        
        Returns:
            int: Очищенное значение поля height_mm
        
        Raises:
            forms.ValidationError: Если высота не является положительным числом
        """
        height_mm = self.cleaned_data.get('height_mm')
        
        # Проверка на положительное значение
        if height_mm <= 0:
            raise forms.ValidationError('Высота должна быть положительным числом')
        
        return height_mm
    
    def clean_margin_mm(self):
        """
        Валидация поля margin_mm.
        
        Проверяет, что размер полей является неотрицательным числом.
        
        Returns:
            int: Очищенное значение поля margin_mm
        
        Raises:
            forms.ValidationError: Если поля являются отрицательным числом
        """
        margin_mm = self.cleaned_data.get('margin_mm')
        
        # Проверка на неотрицательное значение
        if margin_mm < 0:
            raise forms.ValidationError('Поля должны быть неотрицательным числом')
        
        return margin_mm
    
    def clean_duplex_coefficient(self):
        """
        Валидация поля duplex_coefficient.
        
        Проверяет, что коэффициент двусторонней печати является числом не меньше 1.0.
        
        Returns:
            float: Очищенное значение поля duplex_coefficient
        
        Raises:
            forms.ValidationError: Если коэффициент меньше 1.0
        """
        duplex_coefficient = self.cleaned_data.get('duplex_coefficient')
        
        # Проверка на минимальное значение
        if duplex_coefficient < 1.0:
            raise forms.ValidationError('Коэффициент должен быть не меньше 1.0')
        
        return duplex_coefficient