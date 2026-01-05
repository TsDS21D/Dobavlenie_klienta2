"""
forms.py для приложения sklad
Формы для древовидной структуры материалов
"""

from django import forms
from django.core.validators import MinValueValidator
from mptt.forms import TreeNodeChoiceField  # Поле для выбора узла дерева
from .models import Category, Material


class CategoryForm(forms.ModelForm):
    """
    Форма для создания и редактирования категорий
    """
    
    class Meta:
        model = Category
        fields = ['name', 'parent', 'description']
        
        # Настройка виджетов (HTML элементов)
        widgets = {
            'name': forms.TextInput(attrs={
                'class': 'form-control',
                'placeholder': 'Например: Бумага, Меловка, Дизайнерская',
                'autofocus': True,
            }),
            'parent': forms.Select(attrs={
                'class': 'form-control',
                'data-placeholder': 'Выберите родительскую категорию',
            }),
            'description': forms.Textarea(attrs={
                'class': 'form-control',
                'rows': 3,
                'placeholder': 'Описание категории (необязательно)',
            }),
        }
        
        # Подписи полей
        labels = {
            'name': 'Название категории*',
            'parent': 'Родительская категория',
            'description': 'Описание',
        }
        
        # Подсказки
        help_texts = {
            'name': 'Введите уникальное название категории',
            'parent': 'Выберите родительскую категорию для создания иерархии',
            'description': 'Дополнительное описание категории',
        }
    
    def __init__(self, *args, **kwargs):
        """
        Инициализация формы
        Настраиваем поле parent для отображения дерева
        """
        super().__init__(*args, **kwargs)
        
        # Используем TreeNodeChoiceField для отображения дерева категорий
        # queryset исключает текущую категорию и её потомков (чтобы не создавать циклы)
        if self.instance and self.instance.pk:
            # При редактировании исключаем саму категорию и её потомков
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
            # При создании новой категории все категории доступны
            self.fields['parent'] = TreeNodeChoiceField(
                queryset=Category.objects.all(),
                empty_label="(Корневая категория)",
                label='Родительская категория',
                help_text='Выберите родительскую категорию',
                widget=forms.Select(attrs={'class': 'form-control'}),
            )
    
    def clean_name(self):
        """
        Валидация названия категории
        """
        name = self.cleaned_data.get('name', '').strip()
        
        if not name:
            raise forms.ValidationError('Название категории не может быть пустым')
        
        if len(name) < 2:
            raise forms.ValidationError('Название категории должно содержать минимум 2 символа')
        
        # Проверка уникальности в рамках одного уровня иерархии
        parent = self.cleaned_data.get('parent')
        queryset = Category.objects.filter(name=name, parent=parent)
        
        # При редактировании исключаем текущую категорию
        if self.instance and self.instance.pk:
            queryset = queryset.exclude(pk=self.instance.pk)
        
        if queryset.exists():
            raise forms.ValidationError('Категория с таким названием уже существует на этом уровне')
        
        return name
    
    def clean_parent(self):
        """
        Валидация родительской категории
        Защита от создания циклических ссылок
        """
        parent = self.cleaned_data.get('parent')
        
        # Если редактируем существующую категорию
        if self.instance and self.instance.pk:
            # Нельзя сделать категорию родителем самой себе
            if parent and parent.pk == self.instance.pk:
                raise forms.ValidationError('Категория не может быть родителем самой себе')
            
            # Нельзя сделать потомка родителем
            if parent and parent.pk in self.instance.get_descendants().values_list('pk', flat=True):
                raise forms.ValidationError('Нельзя сделать потомка родительской категорией')
        
        return parent


class MaterialForm(forms.ModelForm):
    """
    Форма для создания и редактирования материалов
    """
    
    class Meta:
        model = Material
        fields = [
            'name',
            'category',
            'price',
            'unit',
            'density',
            'quantity',
            'min_quantity',
            'notes',
            'is_active',
        ]
        
        widgets = {
            'name': forms.TextInput(attrs={
                'class': 'form-control',
                'placeholder': 'Например: Меловка 130 г/кв.м, глянец',
                'autofocus': True,
            }),
            'category': forms.Select(attrs={
                'class': 'form-control',
                'data-placeholder': 'Выберите категорию',
            }),
            'price': forms.NumberInput(attrs={
                'class': 'form-control',
                'placeholder': 'Например: 50.00',
                'min': '0.01',
                'step': '0.01',
            }),
            'unit': forms.TextInput(attrs={
                'class': 'form-control',
                'placeholder': 'Например: лист, рулон, метр',
                'value': 'лист',
            }),
            'density': forms.NumberInput(attrs={
                'class': 'form-control',
                'placeholder': 'Например: 130',
                'min': '1',
                'step': '1',
            }),
            'quantity': forms.NumberInput(attrs={
                'class': 'form-control',
                'placeholder': 'Например: 1000',
                'min': '0',
                'step': '1',  # Изменили с '0.01' на '1' для целых чисел
            }),
            'min_quantity': forms.NumberInput(attrs={
                'class': 'form-control',
                'placeholder': 'Например: 100',
                'min': '0',
                'step': '1',  # Изменили с '0.01' на '1' для целых чисел
            }),
            'notes': forms.Textarea(attrs={
                'class': 'form-control',
                'rows': 3,
                'placeholder': 'Дополнительные примечания',
            }),
            'is_active': forms.CheckboxInput(attrs={
                'class': 'form-check-input',
            }),
        }
        
        labels = {
            'name': 'Название материала*',
            'category': 'Категория*',
            'price': 'Цена*',
            'unit': 'Единица измерения*',
            'density': 'Плотность (г/кв.м)',
            'quantity': 'Количество на складе',
            'min_quantity': 'Минимальный остаток',
            'notes': 'Примечание',
            'is_active': 'Активен',
        }
        
        help_texts = {
            'name': 'Введите уникальное название материала в категории',
            'category': 'Выберите категорию для материала',
            'price': 'Введите цену за единицу материала',
            'unit': 'Введите единицу измерения',
            'density': 'Введите плотность в граммах на квадратный метр',
            'quantity': 'Текущее целое количество на складе',
            'min_quantity': 'При достижении этого целого количества будет показано предупреждение',
            'notes': 'Дополнительная информация о материале',
            'is_active': 'Отметьте, если материал доступен для использования',
        }
    
    def __init__(self, *args, **kwargs):
        """
        Инициализация формы
        """
        super().__init__(*args, **kwargs)
        
        # Сортируем категории для удобства выбора
        self.fields['category'].queryset = Category.objects.all().order_by('name')
    
    def clean_name(self):
        """
        Валидация названия материала
        """
        name = self.cleaned_data.get('name', '').strip()
        
        if not name:
            raise forms.ValidationError('Название материала не может быть пустым')
        
        if len(name) < 2:
            raise forms.ValidationError('Название материала должно содержать минимум 2 символа')
        
        # Проверка уникальности в рамках категории
        category = self.cleaned_data.get('category')
        if category:
            queryset = Material.objects.filter(name=name, category=category)
            
            if self.instance and self.instance.pk:
                queryset = queryset.exclude(pk=self.instance.pk)
            
            if queryset.exists():
                raise forms.ValidationError('Материал с таким названием уже существует в этой категории')
        
        return name
    
    def clean_price(self):
        """
        Валидация цены
        """
        price = self.cleaned_data.get('price')
        
        if price is None:
            raise forms.ValidationError('Цена должна быть указана')
        
        if price <= 0:
            raise forms.ValidationError('Цена должна быть положительным числом')
        
        if price > 999999.99:
            raise forms.ValidationError('Цена не может превышать 999 999.99')
        
        return price
    
    def clean_quantity(self):
        """
        Валидация количества - только целые числа
        """
        quantity = self.cleaned_data.get('quantity')
        
        if quantity is None:
            quantity = 0
        
        if quantity < 0:
            raise forms.ValidationError('Количество не может быть отрицательным')
        
        # Проверяем, что это целое число
        if not isinstance(quantity, int):
            # Пытаемся преобразовать в целое
            try:
                quantity = int(quantity)
            except (ValueError, TypeError):
                raise forms.ValidationError('Количество должно быть целым числом')
        
        return quantity

    def clean_min_quantity(self):
        """
        Валидация минимального количества - только целые числа
        """
        min_quantity = self.cleaned_data.get('min_quantity')
        
        if min_quantity is None:
            min_quantity = 0
        
        if min_quantity < 0:
            raise forms.ValidationError('Минимальное количество не может быть отрицательным')
        
        # Проверяем, что это целое число
        if not isinstance(min_quantity, int):
            # Пытаемся преобразовать в целое
            try:
                min_quantity = int(min_quantity)
            except (ValueError, TypeError):
                raise forms.ValidationError('Минимальное количество должно быть целым числом')
        
        return min_quantity


class CategoryEditForm(forms.ModelForm):
    """
    Форма для быстрого редактирования категорий (через AJAX)
    """
    
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
        """
        Убираем подписи для компактного отображения
        """
        super().__init__(*args, **kwargs)
        for field_name in self.fields:
            self.fields[field_name].label = ''
            self.fields[field_name].help_text = ''


class MaterialEditForm(forms.ModelForm):
    """
    Форма для быстрого редактирования материалов (через AJAX)
    """
    
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
                'step': '1',  # Изменили с '0.01' на '1' для целых чисел
            }),
        }
    
    def __init__(self, *args, **kwargs):
        """
        Убираем подписи для компактного отображения
        """
        super().__init__(*args, **kwargs)
        for field_name in self.fields:
            self.fields[field_name].label = ''
            self.fields[field_name].help_text = ''