"""
forms.py для приложения sklad
Формы для создания/редактирования категорий и материалов.
Добавлены поля density (плотность) и paper_thickness (толщина бумаги).
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
            # поля бумаги
            'price', 'unit', 'density', 'paper_thickness',
            # поля плёнки
            'cost', 'markup_percent', 'thickness',
            # складские
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
            # бумажные поля
            'price': forms.NumberInput(attrs={'class': 'form-control', 'step': '0.01', 'min': '0.01'}),
            'unit': forms.TextInput(attrs={'class': 'form-control', 'value': 'лист'}),
            'density': forms.NumberInput(attrs={'class': 'form-control', 'step': '1', 'min': '1'}),
            'paper_thickness': forms.NumberInput(attrs={'class': 'form-control', 'step': '0.001', 'min': '0.001'}),
            # плёнка
            'cost': forms.NumberInput(attrs={'class': 'form-control', 'step': '0.01', 'min': '0'}),
            'markup_percent': forms.NumberInput(attrs={'class': 'form-control', 'step': '0.01', 'min': '0'}),
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
            'price': 'Цена*',
            'unit': 'Единица измерения',
            'density': 'Плотность (г/кв.м)',
            'paper_thickness': 'Толщина бумаги (мм)',
            'cost': 'Себестоимость (руб.)*',
            'markup_percent': 'Наценка (%)*',
            'thickness': 'Толщина (мкм)',
            'quantity': 'Количество на складе',
            'min_quantity': 'Минимальный остаток',
            'notes': 'Примечание',
            'is_active': 'Активен',
        }
        help_texts = {
            'name': 'Введите уникальное название материала в категории',
            'category': 'Выберите категорию для материала',
            'type': 'Выберите тип: Бумага или Плёнка',
            'price': 'Введите цену за единицу материала (только для бумаги)',
            'unit': 'Введите единицу измерения (лист, рулон, метр)',
            'density': 'Введите плотность в г/кв.м (только для бумаги)',
            'paper_thickness': 'Толщина бумаги в миллиметрах (например, 0.1)',
            'cost': 'Закупочная стоимость единицы (только для плёнки)',
            'markup_percent': 'Процент наценки от себестоимости (только для плёнки)',
            'thickness': 'Толщина плёнки в микронах (только для плёнки)',
            'quantity': 'Текущее целое количество на складе',
            'min_quantity': 'При достижении этого целого количества будет показано предупреждение',
            'notes': 'Дополнительная информация о материале',
            'is_active': 'Отметьте, если материал доступен для использования',
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Сортируем категории для выпадающего списка
        self.fields['category'].queryset = Category.objects.all().order_by('name')
        # Добавляем CSS-классы для группировки полей (чтобы скрывать/показывать через JS)
        self.fields['price'].widget.attrs['class'] += ' paper-field'
        self.fields['unit'].widget.attrs['class'] += ' paper-field'
        self.fields['density'].widget.attrs['class'] += ' paper-field'
        self.fields['paper_thickness'].widget.attrs['class'] += ' paper-field'
        self.fields['cost'].widget.attrs['class'] += ' film-field'
        self.fields['markup_percent'].widget.attrs['class'] += ' film-field'
        self.fields['thickness'].widget.attrs['class'] += ' film-field'

    def clean(self):
        """Общая валидация формы: в зависимости от типа требуются разные поля."""
        cleaned_data = super().clean()
        material_type = cleaned_data.get('type')

        if material_type == 'paper':
            price = cleaned_data.get('price')
            if price is None or price <= 0:
                self.add_error('price', 'Для бумаги цена обязательна и должна быть положительной')
            unit = cleaned_data.get('unit')
            if not unit:
                self.add_error('unit', 'Единица измерения обязательна')
            # Плотность и толщина бумаги необязательны, но если указаны – должны быть >0
            paper_thickness = cleaned_data.get('paper_thickness')
            if paper_thickness is not None and paper_thickness <= 0:
                self.add_error('paper_thickness', 'Толщина бумаги должна быть положительным числом')
            density = cleaned_data.get('density')
            if density is not None and density <= 0:
                self.add_error('density', 'Плотность должна быть положительным числом')
        elif material_type == 'film':
            cost = cleaned_data.get('cost')
            if cost is None or cost < 0:
                self.add_error('cost', 'Себестоимость обязательна и не может быть отрицательной')
            markup = cleaned_data.get('markup_percent')
            if markup is None or markup < 0:
                self.add_error('markup_percent', 'Наценка обязательна и не может быть отрицательной')
            thickness = cleaned_data.get('thickness')
            if not thickness or thickness <= 0:
                self.add_error('thickness', 'Толщина обязательна и должна быть положительной')
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

    def clean_price(self):
        """Цена должна быть положительной и не слишком большой."""
        price = self.cleaned_data.get('price')
        if price is not None:
            if price <= 0:
                raise forms.ValidationError('Цена должна быть положительным числом')
            if price > 999999.99:
                raise forms.ValidationError('Цена не может превышать 999 999.99')
        return price

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
        fields = ['name', 'price', 'unit', 'quantity']
        widgets = {
            'name': forms.TextInput(attrs={
                'class': 'edit-input',
                'data-field': 'name',
            }),
            'price': forms.NumberInput(attrs={
                'class': 'edit-input edit-number',
                'data-field': 'price',
                'min': '0.01',
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

    def clean_price(self):
        price = self.cleaned_data.get('price')
        if price is not None and price <= 0:
            raise forms.ValidationError('Цена должна быть положительным числом')
        return price

    def clean_quantity(self):
        quantity = self.cleaned_data.get('quantity', 0)
        if quantity < 0:
            raise forms.ValidationError('Количество не может быть отрицательным')
        return int(quantity)