"""
forms.py для приложения devices
Формы для добавления и редактирования принтеров
"""

from django import forms
from .models import Printer
from sheet_formats.models import SheetFormat  # Импортируем модель форматов


class PrinterForm(forms.ModelForm):
    """
    Форма для добавления нового принтера
    
    Использует ModelForm для автоматической генерации полей из модели Printer
    """
    
    class Meta:
        # Указываем модель, на основе которой создается форма
        model = Printer
        
        # Поля модели, которые будут в форме
        fields = ['name', 'sheet_format', 'margin_mm', 'duplex_coefficient']
        
        # Настройка виджетов (элементов управления) для полей формы
        widgets = {
            'name': forms.TextInput(attrs={
                'class': 'form-control',  # CSS класс для стилизации
                'placeholder': 'Например: RICOH Pro C7200S',  # Подсказка в поле
                'autofocus': True,  # Автоматический фокус при открытии формы
            }),
            'sheet_format': forms.Select(attrs={
                'class': 'form-control',  # CSS класс для выпадающего списка
                'placeholder': 'Выберите формат листа',  # Подсказка
            }),
            'margin_mm': forms.NumberInput(attrs={
                'class': 'form-control',  # CSS класс
                'placeholder': '5',  # Значение по умолчанию
                'min': '0',  # Минимальное значение
                'max': '50',  # Максимальное значение
                'step': '1',  # Шаг изменения
            }),
            'duplex_coefficient': forms.NumberInput(attrs={
                'class': 'form-control',  # CSS класс
                'placeholder': '2.0',  # Значение по умолчанию
                'min': '1.0',  # Минимальное значение
                'max': '10.0',  # Максимальное значение
                'step': '0.1',  # Шаг изменения
            }),
        }
        
        # Пользовательские подписи для полей (отображаются в форме)
        labels = {
            'name': 'Название принтера*',
            'sheet_format': 'Формат листа*',
            'margin_mm': 'Поля (мм)*',
            'duplex_coefficient': 'Коэффициент двусторонней печати*',
        }
        
        # Подсказки для пользователя (отображаются под полями)
        help_texts = {
            'name': 'Введите уникальное название принтера',
            'sheet_format': 'Выберите формат листа из списка',
            'margin_mm': 'Размер незапечатываемых полей (0-50 мм)',
            'duplex_coefficient': 'Коэффициент для двусторонней печати (1.0-10.0)',
        }
    
    def __init__(self, *args, **kwargs):
        """
        Инициализация формы с дополнительными настройками
        
        Args:
            *args: Позиционные аргументы
            **kwargs: Именованные аргументы
        """
        # Вызываем инициализацию родительского класса
        super().__init__(*args, **kwargs)
        
        # Настраиваем queryset для поля sheet_format (только активные форматы)
        self.fields['sheet_format'].queryset = SheetFormat.objects.all().order_by('name')
        
        # Добавляем пустой вариант в выпадающий список
        self.fields['sheet_format'].empty_label = "--- Выберите формат ---"
    
    def clean_name(self):
        """
        Валидация поля name (название принтера)
        
        Returns:
            str: Очищенное значение поля name
            
        Raises:
            forms.ValidationError: Если название пустое или уже существует
        """
        name = self.cleaned_data.get('name', '').strip()  # Получаем и очищаем значение
        
        # Проверка на пустое значение
        if not name:
            raise forms.ValidationError('Название принтера не может быть пустым')
        
        # Проверка на уникальность (исключая текущий объект при редактировании)
        queryset = Printer.objects.filter(name=name)
        if self.instance and self.instance.pk:
            queryset = queryset.exclude(pk=self.instance.pk)
        
        if queryset.exists():
            raise forms.ValidationError('Принтер с таким названием уже существует')
        
        return name
    
    def clean_margin_mm(self):
        """
        Валидация поля margin_mm (поля)
        
        Returns:
            int: Очищенное значение поля margin_mm
            
        Raises:
            forms.ValidationError: Если значение вне допустимого диапазона
        """
        margin_mm = self.cleaned_data.get('margin_mm')
        
        # Проверка диапазона
        if margin_mm is None:
            raise forms.ValidationError('Поле "Поля (мм)" обязательно для заполнения')
        
        if margin_mm < 0 or margin_mm > 50:
            raise forms.ValidationError('Поля должны быть в диапазоне от 0 до 50 мм')
        
        return margin_mm
    
    def clean_duplex_coefficient(self):
        """
        Валидация поля duplex_coefficient (коэффициент)
        
        Returns:
            float: Очищенное значение поля duplex_coefficient
            
        Raises:
            forms.ValidationError: Если значение вне допустимого диапазона
        """
        duplex_coefficient = self.cleaned_data.get('duplex_coefficient')
        
        # Проверка диапазона
        if duplex_coefficient is None:
            raise forms.ValidationError('Поле "Коэффициент" обязательно для заполнения')
        
        if duplex_coefficient < 1.0 or duplex_coefficient > 10.0:
            raise forms.ValidationError('Коэффициент должен быть в диапазоне от 1.0 до 10.0')
        
        return duplex_coefficient


class PrinterEditForm(forms.ModelForm):
    """
    Форма для inline-редактирования принтеров через AJAX
    
    Упрощенная версия формы для редактирования в таблице
    """
    
    class Meta:
        model = Printer
        fields = ['name', 'sheet_format', 'margin_mm', 'duplex_coefficient']
        
        # Упрощенные виджеты для компактного отображения в таблице
        widgets = {
            'name': forms.TextInput(attrs={
                'class': 'edit-input',
                'data-field': 'name',
            }),
            'sheet_format': forms.Select(attrs={
                'class': 'edit-input',
                'data-field': 'sheet_format',
            }),
            'margin_mm': forms.NumberInput(attrs={
                'class': 'edit-input edit-number',
                'data-field': 'margin_mm',
                'min': '0',
                'max': '50',
                'step': '1',
            }),
            'duplex_coefficient': forms.NumberInput(attrs={
                'class': 'edit-input edit-number',
                'data-field': 'duplex_coefficient',
                'min': '1.0',
                'max': '10.0',
                'step': '0.1',
            }),
        }
    
    def __init__(self, *args, **kwargs):
        """
        Инициализация формы редактирования
        
        Убираем подписи для компактного отображения в таблице
        """
        super().__init__(*args, **kwargs)
        
        # Настраиваем queryset для поля sheet_format
        from sheet_formats.models import SheetFormat
        self.fields['sheet_format'].queryset = SheetFormat.objects.all().order_by('name')
        
        # Убираем подписи и подсказки для компактности
        for field_name in self.fields:
            self.fields[field_name].label = ''
            self.fields[field_name].help_text = ''