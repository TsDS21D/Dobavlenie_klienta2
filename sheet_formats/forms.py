"""
forms.py для приложения sheet_formats
Формы для добавления и редактирования форматов листов
"""

from django import forms
from .models import SheetFormat


class SheetFormatForm(forms.ModelForm):
    """
    Форма для добавления и редактирования форматов листов
    Наследуется от ModelForm для автоматической генерации полей из модели
    """
    
    class Meta:
        """
        Мета-класс для настройки формы
        """
        # Указываем модель, на основе которой создается форма
        model = SheetFormat
        
        # Поля модели, которые будут в форме
        fields = ['name', 'width_mm', 'height_mm']
        
        # Настройка виджетов для рендеринга полей формы
        widgets = {
            'name': forms.TextInput(attrs={
                'class': 'form-control',  # CSS класс для стилизации
                'placeholder': 'Например: SRA3, A4, A3+',  # Подсказка внутри поля
                'autofocus': True,  # Автофокус при открытии формы
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
        }
        
        # Пользовательские подписи для полей
        labels = {
            'name': 'Наименование формата*',
            'width_mm': 'Ширина (мм)*',
            'height_mm': 'Высота (мм)*',
        }
        
        # Подсказки для пользователя
        help_texts = {
            'name': 'Введите уникальное название формата',
            'width_mm': 'Введите ширину листа в миллиметрах',
            'height_mm': 'Введите высоту листа в миллиметрах',
        }
    
    def clean_name(self):
        """
        Валидация поля name
        Проверяет, что название формата не пустое и уникально
        Returns:
            str: Очищенное значение поля name
        Raises:
            forms.ValidationError: Если название пустое или уже существует
        """
        name = self.cleaned_data.get('name', '').strip()
        
        # Проверка на пустое значение
        if not name:
            raise forms.ValidationError('Название формата не может быть пустым')
        
        # Проверка на уникальность (исключая текущий объект, если он есть)
        queryset = SheetFormat.objects.filter(name=name)
        if self.instance and self.instance.pk:
            queryset = queryset.exclude(pk=self.instance.pk)
        
        if queryset.exists():
            raise forms.ValidationError('Формат с таким названием уже существует')
        
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
        if width_mm is None:
            raise forms.ValidationError('Ширина должна быть указана')
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
        if height_mm is None:
            raise forms.ValidationError('Высота должна быть указана')
        if height_mm <= 0:
            raise forms.ValidationError('Высота должна быть положительным числом')
        
        return height_mm


class SheetFormatEditForm(forms.ModelForm):
    """
    Форма для inline-редактирования форматов через AJAX
    Отличается от основной формы упрощенными виджетами для таблицы
    """
    
    class Meta:
        """
        Мета-класс для настройки формы редактирования
        """
        model = SheetFormat
        fields = ['name', 'width_mm', 'height_mm']
        
        # Упрощенные виджеты для inline-редактирования в таблице
        widgets = {
            'name': forms.TextInput(attrs={
                'class': 'edit-input',
                'data-field': 'name',
            }),
            'width_mm': forms.NumberInput(attrs={
                'class': 'edit-input edit-number',
                'data-field': 'width_mm',
                'min': '1',
                'step': '1',
            }),
            'height_mm': forms.NumberInput(attrs={
                'class': 'edit-input edit-number',
                'data-field': 'height_mm',
                'min': '1',
                'step': '1',
            }),
        }
    
    def __init__(self, *args, **kwargs):
        """
        Инициализация формы редактирования
        Убираем подписи для компактного отображения в таблице
        """
        super().__init__(*args, **kwargs)
        
        # Убираем подписи для компактного отображения в таблице
        for field_name in self.fields:
            self.fields[field_name].label = ''
            self.fields[field_name].help_text = ''