"""
forms.py для приложения print_price
Формы для добавления и редактирования цен на печать (себестоимость + наценка)
"""

from django import forms
from .models import PrintPrice
from devices.models import Printer


class PrintPriceForm(forms.ModelForm):
    """
    Форма для создания и редактирования цены на печать.
    Включает выбор принтера, тираж, себестоимость и наценку.
    """

    # Поле выбора принтера
    printer = forms.ModelChoiceField(
        queryset=Printer.objects.all().order_by('name'),
        label='Принтер',
        help_text='Выберите принтер, для которого устанавливается цена',
        widget=forms.Select(attrs={
            'class': 'form-control',
            'id': 'price-printer',
        }),
        empty_label="-- Выберите принтер --",
    )

    # Тираж
    copies = forms.IntegerField(
        label='Тираж (количество копий)',
        help_text='Введите количество экземпляров для печати',
        min_value=1,
        widget=forms.NumberInput(attrs={
            'class': 'form-control',
            'id': 'price-copies',
            'placeholder': 'Например: 100, 500, 1000',
        }),
    )

    # Себестоимость за лист
    cost = forms.DecimalField(
        label='Себестоимость (руб.)',
        help_text='Себестоимость печати одного листа при данном тираже (без наценки)',
        min_value=0,
        max_digits=10,
        decimal_places=2,
        widget=forms.NumberInput(attrs={
            'class': 'form-control',
            'id': 'price-cost',
            'placeholder': 'Например: 2.00',
            'step': '0.01',
        }),
    )

    # Наценка в процентах
    markup_percent = forms.DecimalField(
        label='Наценка (%)',
        help_text='Процент наценки от себестоимости (например, 20.00)',
        min_value=0,
        max_digits=5,
        decimal_places=2,
        widget=forms.NumberInput(attrs={
            'class': 'form-control',
            'id': 'price-markup',
            'placeholder': 'Например: 20.00',
            'step': '0.01',
        }),
    )

    class Meta:
        model = PrintPrice
        fields = ['printer', 'copies', 'cost', 'markup_percent']

    def clean(self):
        """
        Дополнительная валидация: уникальность принтера и тиража.
        """
        cleaned_data = super().clean()
        printer = cleaned_data.get('printer')
        copies = cleaned_data.get('copies')

        if printer and copies is not None:
            # Ищем существующие записи с такими же параметрами
            existing = PrintPrice.objects.filter(
                printer=printer,
                copies=copies
            )
            # Если форма редактирует существующий объект, исключаем его из проверки
            if self.instance and self.instance.pk:
                existing = existing.exclude(pk=self.instance.pk)

            if existing.exists():
                raise forms.ValidationError(
                    f"Цена для принтера '{printer.name}' с тиражом {copies} шт. уже существует."
                )

        return cleaned_data


class PrintPriceUpdateForm(forms.ModelForm):
    """
    Форма для редактирования цены (используется в inline-редактировании).
    Позволяет обновлять тираж, себестоимость и наценку.
    """

    class Meta:
        model = PrintPrice
        fields = ['copies', 'cost', 'markup_percent']

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)

        # Настраиваем виджеты для inline-редактирования
        self.fields['copies'].widget = forms.NumberInput(attrs={
            'class': 'inline-edit-input copies-input',
            'min': 1,
            'step': 1,
        })
        self.fields['cost'].widget = forms.NumberInput(attrs={
            'class': 'inline-edit-input cost-input',
            'min': 0,
            'step': 0.01,
        })
        self.fields['markup_percent'].widget = forms.NumberInput(attrs={
            'class': 'inline-edit-input markup-input',
            'min': 0,
            'step': 0.01,
        })

    def clean(self):
        """
        Проверка уникальности при изменении тиража.
        """
        cleaned_data = super().clean()
        if self.instance and self.instance.pk:
            printer = self.instance.printer
            copies = cleaned_data.get('copies')

            # Если меняется тираж, проверяем уникальность
            if copies is not None and copies != self.instance.copies:
                existing = PrintPrice.objects.filter(
                    printer=printer,
                    copies=copies
                ).exclude(pk=self.instance.pk)
                if existing.exists():
                    raise forms.ValidationError(
                        f"Цена для принтера '{printer.name}' с тиражом {copies} шт. уже существует."
                    )

        return cleaned_data