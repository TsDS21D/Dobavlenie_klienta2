"""
forms.py для приложения spravochnik_dopolnitelnyh_rabot.

Содержит формы:
- WorkForm: для создания и редактирования работы (добавлены поля cost и markup_percent).
- WorkPriceForm: для создания опорной точки цены по листам.
- WorkCirculationPriceForm: для создания опорной точки цены по тиражу.
"""

from django import forms
from .models import Work, WorkPrice, WorkCirculationPrice


class WorkForm(forms.ModelForm):
    """
    Форма для создания и редактирования работы.
    Включает все поля модели Work, включая новые cost и markup_percent.
    """
    formula_type = forms.ChoiceField(
        choices=Work.FORMULA_CHOICES,
        widget=forms.Select(attrs={
            'class': 'form-control spravochnik-formula-select',
            'id': 'spravochnik-formula-type'
        })
    )

    interpolation_method = forms.ChoiceField(
        choices=Work.INTERPOLATION_CHOICES,
        widget=forms.Select(attrs={
            'class': 'form-control',
            'id': 'spravochnik-interpolation-method'
        })
    )

    k_lines = forms.DecimalField(
        label='Коэффициент резов',
        help_text='Коэффициент, усиливающий влияние количества резов в формуле 4 (по умолчанию 2.0)',
        initial=2.0,
        required=False,
        min_value=0.1,
        max_value=100.0,
        widget=forms.NumberInput(attrs={
            'class': 'form-control',
            'id': 'spravochnik-k-lines',
            'step': '0.1',
            'min': '0.1',
            'max': '100.0',
            'placeholder': '2.0'
        })
    )

    # ===== НОВЫЕ ПОЛЯ ДЛЯ СЕБЕСТОИМОСТИ И НАЦЕНКИ =====
    cost = forms.DecimalField(
        label='Себестоимость (руб)',
        help_text='Себестоимость работы (без наценки)',
        min_value=0,
        widget=forms.NumberInput(attrs={
            'class': 'form-control spravochnik-cost-input',
            'step': '0.01',
            'min': '0',
            'id': 'spravochnik-cost'
        })
    )

    markup_percent = forms.DecimalField(
        label='Наценка (%)',
        help_text='Процент наценки от себестоимости',
        min_value=0,
        widget=forms.NumberInput(attrs={
            'class': 'form-control spravochnik-markup-input',
            'step': '0.01',
            'min': '0',
            'id': 'spravochnik-markup-percent'
        })
    )
    # ===== КОНЕЦ НОВЫХ ПОЛЕЙ =====

    class Meta:
        model = Work
        fields = [
            'name', 'cost', 'markup_percent',   # cost и markup_percent добавлены
            'formula_type',
            'interpolation_method', 'k_lines',
            'default_lines_count', 'default_items_per_sheet'
        ]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)

        # Настройка виджетов для остальных полей
        self.fields['name'].widget = forms.TextInput(attrs={
            'class': 'form-control spravochnik-name-input',
            'placeholder': 'Введите название работы',
            'id': 'spravochnik-name'
        })

        # Поле price больше не включаем в форму, оно вычисляется автоматически

        self.fields['default_lines_count'].widget = forms.NumberInput(attrs={
            'class': 'form-control spravochnik-lines-input',
            'placeholder': '1',
            'min': '1',
            'step': '1',
            'id': 'spravochnik-lines-count'
        })

        self.fields['default_items_per_sheet'].widget = forms.NumberInput(attrs={
            'class': 'form-control spravochnik-items-input',
            'placeholder': '1',
            'min': '1',
            'step': '1',
            'id': 'spravochnik-items-per-sheet'
        })

        # Убеждаемся, что choices проставлены
        self.fields['formula_type'].choices = Work.FORMULA_CHOICES
        self.fields['interpolation_method'].choices = Work.INTERPOLATION_CHOICES

    # Методы валидации
    def clean_cost(self):
        cost = self.cleaned_data.get('cost')
        if cost is None:
            raise forms.ValidationError("Себестоимость должна быть указана.")
        if cost < 0:
            raise forms.ValidationError("Себестоимость не может быть отрицательной.")
        return cost

    def clean_markup_percent(self):
        markup = self.cleaned_data.get('markup_percent')
        if markup is None:
            raise forms.ValidationError("Наценка должна быть указана.")
        if markup < 0:
            raise forms.ValidationError("Наценка не может быть отрицательной.")
        return markup

    def clean_default_lines_count(self):
        value = self.cleaned_data.get('default_lines_count')
        if value is not None and value < 1:
            raise forms.ValidationError("Количество линий реза должно быть не менее 1.")
        return value

    def clean_default_items_per_sheet(self):
        value = self.cleaned_data.get('default_items_per_sheet')
        if value is not None and value < 1:
            raise forms.ValidationError("Количество изделий на листе должно быть не менее 1.")
        return value


class WorkPriceForm(forms.ModelForm):
    """Форма для создания новой опорной точки цены по листам (без изменений)."""
    work = forms.ModelChoiceField(
        queryset=Work.objects.all().order_by('name'),
        label='Работа',
        help_text='Выберите работу, для которой устанавливается цена',
        widget=forms.Select(attrs={
            'class': 'form-control',
            'id': 'work-price-work',
        }),
        empty_label="-- Выберите работу --",
    )

    sheets = forms.IntegerField(
        label='Количество листов',
        help_text='Введите количество листов для опорной точки',
        min_value=1,
        widget=forms.NumberInput(attrs={
            'class': 'form-control',
            'id': 'work-price-sheets',
            'placeholder': 'Например: 100, 500, 1000',
        }),
    )

    price = forms.DecimalField(
        label='Цена (руб.)',
        help_text='Итоговая цена работы при данном количестве листов (включая наценку)',
        min_value=0,
        max_digits=10,
        decimal_places=2,
        widget=forms.NumberInput(attrs={
            'class': 'form-control',
            'id': 'work-price-price',
            'placeholder': 'Например: 50.00',
            'step': '0.01',
        }),
    )

    class Meta:
        model = WorkPrice
        fields = ['work', 'sheets', 'price']

    def clean(self):
        cleaned_data = super().clean()
        work = cleaned_data.get('work')
        sheets = cleaned_data.get('sheets')

        if work and sheets is not None:
            existing = WorkPrice.objects.filter(work=work, sheets=sheets)
            if self.instance and self.instance.pk:
                existing = existing.exclude(pk=self.instance.pk)
            if existing.exists():
                raise forms.ValidationError(
                    f"Цена для работы '{work.name}' с количеством листов {sheets} уже существует."
                )
        return cleaned_data


class WorkCirculationPriceForm(forms.ModelForm):
    """Форма для создания опорной точки цены по тиражу (без изменений)."""
    work = forms.ModelChoiceField(
        queryset=Work.objects.all().order_by('name'),
        label='Работа',
        widget=forms.Select(attrs={
            'class': 'form-control',
            'id': 'work-circulation-price-work'
        }),
        empty_label="-- Выберите работу --",
    )

    circulation = forms.IntegerField(
        label='Тираж (количество экземпляров)',
        min_value=1,
        widget=forms.NumberInput(attrs={
            'class': 'form-control',
            'id': 'work-circulation-price-circulation',
            'placeholder': '100'
        })
    )

    price = forms.DecimalField(
        label='Цена (руб.)',
        min_value=0,
        max_digits=10,
        decimal_places=2,
        widget=forms.NumberInput(attrs={
            'class': 'form-control',
            'id': 'work-circulation-price-price',
            'placeholder': '50.00',
            'step': '0.01'
        })
    )

    class Meta:
        model = WorkCirculationPrice
        fields = ['work', 'circulation', 'price']

    def clean(self):
        cleaned_data = super().clean()
        work = cleaned_data.get('work')
        circulation = cleaned_data.get('circulation')

        if work and circulation is not None:
            existing = WorkCirculationPrice.objects.filter(work=work, circulation=circulation)
            if self.instance and self.instance.pk:
                existing = existing.exclude(pk=self.instance.pk)
            if existing.exists():
                raise forms.ValidationError(
                    f"Цена для работы '{work.name}' с тиражом {circulation} уже существует."
                )
        return cleaned_data