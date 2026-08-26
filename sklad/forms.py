"""
forms.py для приложения sklad
Формы для создания/редактирования категорий и материалов.

ИСПРАВЛЕНИЯ (унификация ценообразования):
- Убрано поле price, добавлены cost и markup_percent для бумаги.
- Поля cost и markup_percent теперь обязательны для всех типов материалов.
- Поле unit вынесено в общие поля.
- Валидация: для бумаги density и paper_thickness необязательны,
  для плёнки thickness обязателен (но может быть пустым, если тип не плёнка).
"""

from django import forms
from django.core.validators import MinValueValidator
from mptt.forms import TreeNodeChoiceField
from .models import Category, Material, CATEGORY_TYPES, MATERIAL_TYPES


class CategoryForm(forms.ModelForm):
    """Форма для создания/редактирования категории (с выбором родителя)."""

    class Meta:
        model = Category
        fields = ['name', 'type', 'parent', 'description']
        widgets = {
            'name': forms.TextInput(attrs={
                'class': 'form-control',
                'placeholder': 'Например: Бумага, Меловка, Плёнка 75 мкм',
                'autofocus': True,
            }),
            'type': forms.Select(attrs={'class': 'form-control'}),
            'parent': forms.Select(attrs={'class': 'form-control'}),
            'description': forms.Textarea(attrs={
                'class': 'form-control',
                'rows': 3,
                'placeholder': 'Описание категории (необязательно)',
            }),
        }
        labels = {
            'name': 'Название категории*',
            'type': 'Тип категории*',
            'parent': 'Родительская категория',
            'description': 'Описание',
        }
        help_texts = {
            'name': 'Введите уникальное название категории',
            'type': 'Выберите тип: Бумага или Плёнка',
            'parent': 'Выберите родительскую категорию для создания иерархии',
            'description': 'Дополнительное описание категории',
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # При редактировании исключаем саму категорию и её потомков из выбора родителя
        if self.instance and self.instance.pk:
            self.fields['parent'] = TreeNodeChoiceField(
                queryset=Category.objects.exclude(
                    pk__in=self.instance.get_descendants(include_self=True)
                ),
                empty_label="(Корневая категория)",
                label='Родительская категория',
                help_text='Выберите родительскую категорию',
                widget=forms.Select(attrs={'class': 'form-control'}),
            )
        else:
            self.fields['parent'] = TreeNodeChoiceField(
                queryset=Category.objects.all(),
                empty_label="(Корневая категория)",
                label='Родительская категория',
                help_text='Выберите родительскую категорию',
                widget=forms.Select(attrs={'class': 'form-control'}),
            )

    def clean_name(self):
        """Проверка: название не пустое, минимум 2 символа, уникально на уровне родителя."""
        name = self.cleaned_data.get('name', '').strip()
        if not name:
            raise forms.ValidationError('Название категории не может быть пустым')
        if len(name) < 2:
            raise forms.ValidationError('Название категории должно содержать минимум 2 символа')
        parent = self.cleaned_data.get('parent')
        material_type = self.cleaned_data.get('type')
        queryset = Category.objects.filter(name=name, parent=parent, type=material_type)
        if self.instance and self.instance.pk:
            queryset = queryset.exclude(pk=self.instance.pk)
        if queryset.exists():
            raise forms.ValidationError('Категория с таким названием уже существует на этом уровне')
        return name

    def clean_parent(self):
        """Защита от циклических ссылок: категория не может быть потомком самой себя."""
        parent = self.cleaned_data.get('parent')
        if self.instance and self.instance.pk:
            if parent and parent.pk == self.instance.pk:
                raise forms.ValidationError('Категория не может быть родителем самой себе')
            if parent and parent.pk in self.instance.get_descendants().values_list('pk', flat=True):
                raise forms.ValidationError('Нельзя сделать потомка родительской категорией')
        return parent


class MaterialForm(forms.ModelForm):
    """Форма для создания/редактирования материала с динамическими полями под тип."""

    class Meta:
        model = Material
        fields = [
            'name', 'category', 'type',
            # общие поля для ценообразования и единиц
            'cost', 'markup_percent', 'unit',
            # специфические поля для бумаги
            'density', 'paper_thickness',
            # специфические поля для плёнки
            'thickness',
            # складские поля
            'quantity', 'min_quantity',
            'notes', 'is_active',
        ]
        widgets = {
            'name': forms.TextInput(attrs={
                'class': 'form-control',
                'placeholder': 'Например: Меловка 130 г/кв.м, глянец',
                'autofocus': True,
            }),
            'category': forms.Select(attrs={'class': 'form-control'}),
            'type': forms.Select(attrs={'class': 'form-control', 'id': 'material-type'}),
            # общие поля
            'cost': forms.NumberInput(attrs={'class': 'form-control', 'step': '0.01', 'min': '0'}),
            'markup_percent': forms.NumberInput(attrs={'class': 'form-control', 'step': '0.01', 'min': '0'}),
            'unit': forms.TextInput(attrs={'class': 'form-control', 'value': 'лист'}),
            # бумага
            'density': forms.NumberInput(attrs={'class': 'form-control', 'step': '1', 'min': '1'}),
            'paper_thickness': forms.NumberInput(attrs={'class': 'form-control', 'step': '0.001', 'min': '0.001'}),
            # плёнка
            'thickness': forms.NumberInput(attrs={'class': 'form-control', 'step': '1', 'min': '1'}),
            # склад
            'quantity': forms.NumberInput(attrs={'class': 'form-control', 'step': '1', 'min': '0'}),
            'min_quantity': forms.NumberInput(attrs={'class': 'form-control', 'step': '1', 'min': '0'}),
            'notes': forms.Textarea(attrs={'class': 'form-control', 'rows': 3}),
            'is_active': forms.CheckboxInput(attrs={'class': 'form-check-input'}),
        }
        labels = {
            'name': 'Название материала*',
            'category': 'Категория*',
            'type': 'Тип материала*',
            'cost': 'Себестоимость (руб.)*',
            'markup_percent': 'Наценка (%)*',
            'unit': 'Единица измерения*',
            'density': 'Плотность (г/кв.м)',
            'paper_thickness': 'Толщина бумаги (мм)',
            'thickness': 'Толщина плёнки (мкм)',
            'quantity': 'Количество на складе',
            'min_quantity': 'Минимальный остаток',
            'notes': 'Примечание',
            'is_active': 'Активен',
        }
        help_texts = {
            'name': 'Введите уникальное название материала в категории',
            'category': 'Выберите категорию для материала',
            'type': 'Выберите тип: Бумага или Плёнка',
            'cost': 'Закупочная стоимость за единицу (обязательно)',
            'markup_percent': 'Процент наценки от себестоимости (обязательно)',
            'unit': 'Единица измерения (лист, рулон, метр, кг)',
            'density': 'Плотность бумаги в г/кв.м (только для бумаги)',
            'paper_thickness': 'Толщина бумаги в мм (только для бумаги)',
            'thickness': 'Толщина плёнки в микронах (только для плёнки)',
            'quantity': 'Текущее целое количество на складе',
            'min_quantity': 'При достижении этого количества будет показано предупреждение',
            'notes': 'Дополнительная информация о материале',
            'is_active': 'Отметьте, если материал доступен для использования',
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Сортируем категории для выпадающего списка
        self.fields['category'].queryset = Category.objects.all().order_by('name')
        # Добавляем CSS-классы для группировки полей (чтобы скрывать/показывать через JS)
        # Общие поля (видны всегда)
        self.fields['cost'].widget.attrs['class'] += ' common-field'
        self.fields['markup_percent'].widget.attrs['class'] += ' common-field'
        self.fields['unit'].widget.attrs['class'] += ' common-field'
        # Поля для бумаги
        self.fields['density'].widget.attrs['class'] += ' paper-field'
        self.fields['paper_thickness'].widget.attrs['class'] += ' paper-field'
        # Поля для плёнки
        self.fields['thickness'].widget.attrs['class'] += ' film-field'

    def clean(self):
        """Общая валидация формы: в зависимости от типа требуются разные поля."""
        cleaned_data = super().clean()
        material_type = cleaned_data.get('type')
        cost = cleaned_data.get('cost')
        markup = cleaned_data.get('markup_percent')
        unit = cleaned_data.get('unit')

        # Себестоимость и наценка обязательны для любого типа
        if cost is None or cost < 0:
            self.add_error('cost', 'Себестоимость обязательна и не может быть отрицательной')
        if markup is None or markup < 0:
            self.add_error('markup_percent', 'Наценка обязательна и не может быть отрицательной')
        if not unit:
            self.add_error('unit', 'Единица измерения обязательна')

        if material_type == 'paper':
            # Плотность и толщина бумаги необязательны, но если указаны – должны быть >0
            paper_thickness = cleaned_data.get('paper_thickness')
            if paper_thickness is not None and paper_thickness <= 0:
                self.add_error('paper_thickness', 'Толщина бумаги должна быть положительным числом')
            density = cleaned_data.get('density')
            if density is not None and density <= 0:
                self.add_error('density', 'Плотность должна быть положительным числом')
        elif material_type == 'film':
            thickness = cleaned_data.get('thickness')
            if not thickness or thickness <= 0:
                self.add_error('thickness', 'Толщина плёнки обязательна и должна быть положительной')
        return cleaned_data

    def clean_name(self):
        """Проверка уникальности названия в рамках категории."""
        name = self.cleaned_data.get('name', '').strip()
        if not name:
            raise forms.ValidationError('Название материала не может быть пустым')
        if len(name) < 2:
            raise forms.ValidationError('Название материала должно содержать минимум 2 символа')
        category = self.cleaned_data.get('category')
        if category:
            queryset = Material.objects.filter(name=name, category=category)
            if self.instance and self.instance.pk:
                queryset = queryset.exclude(pk=self.instance.pk)
            if queryset.exists():
                raise forms.ValidationError('Материал с таким названием уже существует в этой категории')
        return name

    def clean_quantity(self):
        quantity = self.cleaned_data.get('quantity', 0)
        if quantity < 0:
            raise forms.ValidationError('Количество не может быть отрицательным')
        return int(quantity)

    def clean_min_quantity(self):
        min_qty = self.cleaned_data.get('min_quantity', 0)
        if min_qty < 0:
            raise forms.ValidationError('Минимальное количество не может быть отрицательным')
        return int(min_qty)


class CategoryEditForm(forms.ModelForm):
    """Упрощённая форма для быстрого inline-редактирования категории (AJAX)."""

    class Meta:
        model = Category
        fields = ['name', 'description']
        widgets = {
            'name': forms.TextInput(attrs={
                'class': 'edit-input',
                'data-field': 'name',
            }),
            'description': forms.Textarea(attrs={
                'class': 'edit-input',
                'data-field': 'description',
                'rows': 2,
            }),
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Убираем подписи, чтобы в inline-режиме было компактно
        for field_name in self.fields:
            self.fields[field_name].label = ''
            self.fields[field_name].help_text = ''


class MaterialEditForm(forms.ModelForm):
    """Упрощённая форма для быстрого inline-редактирования материала (AJAX)."""

    class Meta:
        model = Material
        fields = ['name', 'cost', 'markup_percent', 'unit', 'quantity']  # убрали price, добавили cost и markup
        widgets = {
            'name': forms.TextInput(attrs={
                'class': 'edit-input',
                'data-field': 'name',
            }),
            'cost': forms.NumberInput(attrs={
                'class': 'edit-input edit-number',
                'data-field': 'cost',
                'min': '0',
                'step': '0.01',
            }),
            'markup_percent': forms.NumberInput(attrs={
                'class': 'edit-input edit-number',
                'data-field': 'markup_percent',
                'min': '0',
                'step': '0.01',
            }),
            'unit': forms.TextInput(attrs={
                'class': 'edit-input',
                'data-field': 'unit',
            }),
            'quantity': forms.NumberInput(attrs={
                'class': 'edit-input edit-number',
                'data-field': 'quantity',
                'min': '0',
                'step': '1',
            }),
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        for field_name in self.fields:
            self.fields[field_name].label = ''
            self.fields[field_name].help_text = ''

    def clean_cost(self):
        cost = self.cleaned_data.get('cost')
        if cost is not None and cost < 0:
            raise forms.ValidationError('Себестоимость не может быть отрицательной')
        return cost

    def clean_markup_percent(self):
        markup = self.cleaned_data.get('markup_percent')
        if markup is not None and markup < 0:
            raise forms.ValidationError('Наценка не может быть отрицательной')
        return markup

    def clean_quantity(self):
        quantity = self.cleaned_data.get('quantity', 0)
        if quantity < 0:
            raise forms.ValidationError('Количество не может быть отрицательным')
        return int(quantity)