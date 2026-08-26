"""
forms.py для приложения devices

Этот файл определяет формы для добавления и редактирования принтеров и ламинаторов.

В Django формы используются для:
- Отображения HTML-полей ввода на странице.
- Валидации данных, отправленных пользователем.
- Сохранения данных в модель (для ModelForm).

Здесь две группы форм:
1. Для принтеров: PrinterForm (добавление) и PrinterEditForm (inline-редактирование через AJAX).
2. Для ламинаторов: LaminatorForm и LaminatorEditForm (полностью аналогичны по структуре).

Каждая форма наследуется от forms.ModelForm, что автоматически связывает её с моделью.
"""

# Импортируем модуль forms из Django
from django import forms

# Импортируем модели, с которыми работают формы
from .models import Printer, Laminator

# Импортируем модель SheetFormat для настройки выпадающего списка форматов
from sheet_formats.models import SheetFormat


# ==================== ФОРМЫ ДЛЯ ПРИНТЕРОВ ====================

class PrinterForm(forms.ModelForm):
    """
    Форма для добавления нового принтера через стандартный POST-запрос.
    Используется на главной странице в разделе принтеров.

    Meta-класс связывает форму с моделью Printer и определяет:
    - Какие поля модели включить в форму (fields).
    - Какие HTML-виджеты использовать для каждого поля (widgets).
    - Подписи (labels) и подсказки (help_texts) для полей.
    """

    class Meta:
        # Модель, на основе которой строится форма
        model = Printer

        # Поля, которые будут отображаться в форме (все, кроме created_at, updated_at)
        fields = [
            'name',                      # Название принтера
            'sheet_format',              # Формат листа (ForeignKey)
            'margin_mm',                 # Поля в мм
            'duplex_coefficient',        # Коэффициент двусторонней печати
            'devices_interpolation_method'  # Метод интерполяции
        ]

        # Настройка виджетов (HTML-элементов) для каждого поля
        widgets = {
            # Текстовое поле для названия с дополнительными атрибутами
            'name': forms.TextInput(attrs={
                'class': 'form-control',          # CSS-класс для стилизации
                'placeholder': 'Например: RICOH Pro C7200S',  # Подсказка внутри поля
                'autofocus': True,                # Автоматический фокус при загрузке страницы
            }),
            # Выпадающий список для выбора формата
            'sheet_format': forms.Select(attrs={
                'class': 'form-control',          # CSS-класс
            }),
            # Числовое поле для полей (мм)
            'margin_mm': forms.NumberInput(attrs={
                'class': 'form-control',
                'placeholder': '5',               # Значение по умолчанию
                'min': '0',                       # Минимальное значение (валидация на клиенте)
                'max': '50',                      # Максимальное значение
                'step': '1',                      # Шаг изменения
            }),
            # Числовое поле для коэффициента
            'duplex_coefficient': forms.NumberInput(attrs={
                'class': 'form-control',
                'placeholder': '2.0',
                'min': '1.0',
                'max': '10.0',
                'step': '0.1',
            }),
            # Выпадающий список для метода интерполяции
            'devices_interpolation_method': forms.Select(attrs={
                'class': 'form-control',
            }),
        }

        # Человеко-читаемые подписи для полей (отображаются рядом с полем ввода)
        labels = {
            'name': 'Название принтера*',
            'sheet_format': 'Формат листа*',
            'margin_mm': 'Поля (мм)*',
            'duplex_coefficient': 'Коэффициент двусторонней печати*',
            'devices_interpolation_method': 'Метод интерполяции*',
        }

        # Подсказки (помещаются под полем, объясняют, что вводить)
        help_texts = {
            'name': 'Введите уникальное название принтера',
            'sheet_format': 'Выберите формат листа из списка',
            'margin_mm': 'Размер незапечатываемых полей (0-50 мм)',
            'duplex_coefficient': 'Коэффициент для двусторонней печати (1.0-10.0)',
            'devices_interpolation_method': 'Выберите метод интерполяции для расчёта стоимости при произвольном тираже',
        }

    def __init__(self, *args, **kwargs):
        """
        Конструктор формы. Вызывается при создании экземпляра формы.
        Здесь можно изменять поведение полей, например, фильтровать выпадающие списки.
        """
        # Вызываем конструктор родительского класса (forms.ModelForm)
        super().__init__(*args, **kwargs)

        # Настраиваем queryset для поля sheet_format:
        # показываем все форматы, отсортированные по названию.
        self.fields['sheet_format'].queryset = SheetFormat.objects.all().order_by('name')

        # Добавляем пустой вариант в выпадающий список форматов,
        # чтобы пользователь явно выбрал значение (нельзя оставить пустым).
        self.fields['sheet_format'].empty_label = "--- Выберите формат ---"

    def clean_name(self):
        """
        Валидация поля 'name'.
        Метод с префиксом clean_<fieldname> вызывается автоматически при валидации формы.
        """
        # Получаем значение поля, удаляем лишние пробелы по краям
        name = self.cleaned_data.get('name', '').strip()

        # Проверка на пустое значение
        if not name:
            raise forms.ValidationError('Название принтера не может быть пустым')

        # Проверка на уникальность: ищем принтер с таким же названием
        queryset = Printer.objects.filter(name=name)

        # Если форма редактирует существующий объект (self.instance.pk не None),
        # исключаем сам этот объект из проверки (чтобы можно было сохранить без изменения названия).
        if self.instance and self.instance.pk:
            queryset = queryset.exclude(pk=self.instance.pk)

        if queryset.exists():
            raise forms.ValidationError('Принтер с таким названием уже существует')

        return name

    def clean_margin_mm(self):
        """
        Валидация поля 'margin_mm' (поля).
        """
        margin = self.cleaned_data.get('margin_mm')

        # Проверка, что поле не пустое (хотя в модели default=5, но на случай явного None)
        if margin is None:
            raise forms.ValidationError('Поле "Поля (мм)" обязательно для заполнения')

        # Проверка диапазона (0-50 мм)
        if margin < 0 or margin > 50:
            raise forms.ValidationError('Поля должны быть в диапазоне от 0 до 50 мм')

        return margin

    def clean_duplex_coefficient(self):
        """
        Валидация поля 'duplex_coefficient' (коэффициент).
        """
        coeff = self.cleaned_data.get('duplex_coefficient')

        if coeff is None:
            raise forms.ValidationError('Поле "Коэффициент" обязательно для заполнения')

        if coeff < 1.0 or coeff > 10.0:
            raise forms.ValidationError('Коэффициент должен быть в диапазоне от 1.0 до 10.0')

        return coeff

    def clean_devices_interpolation_method(self):
        """
        Валидация поля 'devices_interpolation_method' (метод интерполяции).
        Если значение не выбрано, устанавливаем значение по умолчанию (линейная интерполяция).
        """
        method = self.cleaned_data.get('devices_interpolation_method')

        if not method:
            # Значение по умолчанию — берём из констант модели
            method = Printer.INTERPOLATION_LINEAR

        return method


class PrinterEditForm(forms.ModelForm):
    """
    Упрощённая форма для inline-редактирования принтера через AJAX.
    Отличается от PrinterForm:
    - Нет подписей (labels) и подсказок (help_texts) — они не нужны в компактной таблице.
    - Виджеты имеют атрибуты data-field, чтобы JavaScript мог идентифицировать поля.
    - Нет пустого варианта для sheet_format (в редактировании уже выбран существующий формат).
    """

    class Meta:
        model = Printer
        # Те же поля, что и в PrinterForm
        fields = ['name', 'sheet_format', 'margin_mm', 'duplex_coefficient', 'devices_interpolation_method']

        # Виджеты с атрибутами для JavaScript
        widgets = {
            'name': forms.TextInput(attrs={
                'class': 'edit-input',          # CSS-класс для стилизации в таблице
                'data-field': 'name',           # data-атрибут для идентификации поля в JS
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
            'devices_interpolation_method': forms.Select(attrs={
                'class': 'edit-input edit-select',
                'data-field': 'devices_interpolation_method',
            }),
        }

    def __init__(self, *args, **kwargs):
        """
        Инициализация формы редактирования.
        Настраиваем queryset для sheet_format и убираем подписи/подсказки.
        """
        super().__init__(*args, **kwargs)

        # Показываем все форматы, отсортированные по названию
        self.fields['sheet_format'].queryset = SheetFormat.objects.all().order_by('name')

        # Убираем подписи (labels) и подсказки (help_texts) для всех полей,
        # потому что в inline-режиме они только занимают место.
        for field_name in self.fields:
            self.fields[field_name].label = ''
            self.fields[field_name].help_text = ''


# ==================== ФОРМЫ ДЛЯ ЛАМИНАТОРОВ ====================

class LaminatorForm(forms.ModelForm):
    """
    Форма для добавления нового ламинатора.
    Полностью аналогична PrinterForm, но использует модель Laminator
    и поле laminator_interpolation_method.
    """

    class Meta:
        model = Laminator
        fields = ['name', 'sheet_format', 'margin_mm', 'duplex_coefficient', 'laminator_interpolation_method']

        widgets = {
            'name': forms.TextInput(attrs={
                'class': 'form-control',
                'placeholder': 'Например: GMP Junior-36',
                'autofocus': True,
            }),
            'sheet_format': forms.Select(attrs={
                'class': 'form-control',
            }),
            'margin_mm': forms.NumberInput(attrs={
                'class': 'form-control',
                'placeholder': '5',
                'min': '0',
                'max': '50',
                'step': '1',
            }),
            'duplex_coefficient': forms.NumberInput(attrs={
                'class': 'form-control',
                'placeholder': '2.0',
                'min': '1.0',
                'max': '10.0',
                'step': '0.1',
            }),
            'laminator_interpolation_method': forms.Select(attrs={
                'class': 'form-control',
            }),
        }

        labels = {
            'name': 'Название ламинатора*',
            'sheet_format': 'Формат листа*',
            'margin_mm': 'Поля (мм)*',
            'duplex_coefficient': 'Коэффициент*',
            'laminator_interpolation_method': 'Метод интерполяции*',
        }

        help_texts = {
            'name': 'Введите уникальное название ламинатора',
            'sheet_format': 'Выберите формат листа из списка',
            'margin_mm': 'Размер незапечатываемых полей (0-50 мм)',
            'duplex_coefficient': 'Коэффициент для двусторонней ламинации (1.0-10.0)',
            'laminator_interpolation_method': 'Выберите метод интерполяции для расчёта стоимости при произвольном тираже',
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields['sheet_format'].queryset = SheetFormat.objects.all().order_by('name')
        self.fields['sheet_format'].empty_label = "--- Выберите формат ---"

    def clean_name(self):
        name = self.cleaned_data.get('name', '').strip()
        if not name:
            raise forms.ValidationError('Название ламинатора не может быть пустым')
        qs = Laminator.objects.filter(name=name)
        if self.instance and self.instance.pk:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise forms.ValidationError('Ламинатор с таким названием уже существует')
        return name

    def clean_margin_mm(self):
        margin = self.cleaned_data.get('margin_mm')
        if margin is None:
            raise forms.ValidationError('Поле "Поля (мм)" обязательно для заполнения')
        if margin < 0 or margin > 50:
            raise forms.ValidationError('Поля должны быть в диапазоне от 0 до 50 мм')
        return margin

    def clean_duplex_coefficient(self):
        coeff = self.cleaned_data.get('duplex_coefficient')
        if coeff is None:
            raise forms.ValidationError('Поле "Коэффициент" обязательно для заполнения')
        if coeff < 1.0 or coeff > 10.0:
            raise forms.ValidationError('Коэффициент должен быть в диапазоне от 1.0 до 10.0')
        return coeff

    def clean_laminator_interpolation_method(self):
        method = self.cleaned_data.get('laminator_interpolation_method')
        if not method:
            method = Laminator.LAMINATOR_INTERPOLATION_LINEAR
        return method


class LaminatorEditForm(forms.ModelForm):
    """
    Упрощённая форма для inline-редактирования ламинатора через AJAX.
    Аналог PrinterEditForm, но для модели Laminator.
    """

    class Meta:
        model = Laminator
        fields = ['name', 'sheet_format', 'margin_mm', 'duplex_coefficient', 'laminator_interpolation_method']

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
            'laminator_interpolation_method': forms.Select(attrs={
                'class': 'edit-input edit-select',
                'data-field': 'laminator_interpolation_method',
            }),
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields['sheet_format'].queryset = SheetFormat.objects.all().order_by('name')
        # Убираем подписи и подсказки для компактного отображения
        for field_name in self.fields:
            self.fields[field_name].label = ''
            self.fields[field_name].help_text = ''