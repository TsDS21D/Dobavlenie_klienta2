"""
forms.py для приложения spravochnik_dopolnitelnyh_rabot.

Содержит формы:
- WorkForm: для создания и редактирования работы (добавлены поля interpolation_method и k_lines).
- WorkPriceForm: для создания новой опорной точки цены.
- WorkPriceUpdateForm: для inline-редактирования существующей опорной точки.

ВСЕ ПОЛЯ снабжены явными идентификаторами (id) для связи с JavaScript.
"""

from django import forms
from .models import Work, WorkPrice


class WorkForm(forms.ModelForm):
    """
    Форма для создания и редактирования работы.
    Включает все поля модели Work, а также дополнительные настройки виджетов.
    ДОБАВЛЕНО: поле interpolation_method (метод интерполяции цены) и k_lines (коэффициент резов).
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

    # ===== ПОЛЕ КОЭФФИЦИЕНТА РЕЗОВ =====
    # Сделано необязательным (required=False), так как в модели есть значение по умолчанию.
    # Это позволяет не передавать поле из формы, если оно не нужно (например, при создании через JS).
    k_lines = forms.DecimalField(
        label='Коэффициент резов',
        help_text='Коэффициент, усиливающий влияние количества резов в формуле 4 (по умолчанию 2.0)',
        initial=2.0,
        required=False,              # <--- ВАЖНО: поле необязательное
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

    class Meta:
        model = Work
        fields = [
            'name', 'price', 'formula_type',
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

        self.fields['price'].widget = forms.NumberInput(attrs={
            'class': 'form-control spravochnik-price-input',
            'placeholder': '0.00',
            'step': '0.01',
            'min': '0',
            'id': 'spravochnik-price'
        })

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

    # Методы валидации (без изменений)
    def clean_price(self):
        price = self.cleaned_data.get('price')
        if price is None:
            raise forms.ValidationError("Цена должна быть указана.")
        if price < 0:
            raise forms.ValidationError("Цена не может быть отрицательной.")
        return price

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
    """
    Форма для создания новой опорной точки цены (WorkPrice).
    Аналог PrintPriceForm из приложения print_price.
    Позволяет выбрать работу, указать количество листов и цену.
    """

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
        help_text='Введите цену работы при данном количестве листов',
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
        """
        Проверка уникальности пары (работа, количество листов).
        Нельзя создать две цены для одной работы с одинаковым количеством листов.
        """
        cleaned_data = super().clean()
        work = cleaned_data.get('work')
        sheets = cleaned_data.get('sheets')

        if work and sheets is not None:
            # Ищем существующую запись с такой же парой
            existing = WorkPrice.objects.filter(work=work, sheets=sheets)
            # Если редактируется существующий объект, исключаем его из проверки
            if self.instance and self.instance.pk:
                existing = existing.exclude(pk=self.instance.pk)
            if existing.exists():
                raise forms.ValidationError(
                    f"Цена для работы '{work.name}' с количеством листов {sheets} уже существует."
                )
        return cleaned_data


class WorkPriceUpdateForm(forms.ModelForm):
    """
    Форма для inline-редактирования существующей опорной точки.
    Используется при обновлении через AJAX (поля sheets и price).
    """

    class Meta:
        model = WorkPrice
        fields = ['sheets', 'price']

    def __init__(self, *args, **kwargs):
        """
        Настройка виджетов для полей sheets и price.
        Эти виджеты используются в JavaScript для inline-редактирования.
        """
        super().__init__(*args, **kwargs)
        self.fields['sheets'].widget = forms.NumberInput(attrs={
            'class': 'inline-edit-input sheets-input',
            'min': 1,
            'step': 1,
        })
        self.fields['price'].widget = forms.NumberInput(attrs={
            'class': 'inline-edit-input price-input',
            'min': 0.01,
            'step': 0.01,
        })

    def clean(self):
        """
        Проверка уникальности при изменении количества листов.
        Если пользователь изменил количество листов, нужно убедиться,
        что для данной работы ещё нет цены с таким количеством.
        """
        cleaned_data = super().clean()
        if self.instance and self.instance.pk:
            work = self.instance.work
            sheets = cleaned_data.get('sheets')
            # Если sheets изменено и не равно исходному
            if sheets is not None and sheets != self.instance.sheets:
                existing = WorkPrice.objects.filter(work=work, sheets=sheets).exclude(pk=self.instance.pk)
                if existing.exists():
                    raise forms.ValidationError(
                        f"Цена для работы '{work.name}' с количеством листов {sheets} уже существует."
                    )
        return cleaned_data