"""
forms.py для приложения print_price
Формы для создания и редактирования цен на печать (принтеры) и ламинирование (ламинаторы).
"""

from django import forms
from .models import PrintPrice, LaminatorPrice
from devices.models import Printer, Laminator


# ==================== ФОРМЫ ДЛЯ ПРИНТЕРОВ ====================

class PrintPriceForm(forms.ModelForm):
    """
    Форма для создания новой цены на печать (принтер).
    """

    printer = forms.ModelChoiceField(
        queryset=Printer.objects.all().order_by('name'),
        label='Принтер',
        help_text='Выберите принтер, для которого устанавливается цена',
        widget=forms.Select(attrs={'class': 'form-control', 'id': 'price-printer'}),
        empty_label="-- Выберите принтер --",
    )

    copies = forms.IntegerField(
        label='Тираж (шт.)',
        min_value=1,
        widget=forms.NumberInput(attrs={'class': 'form-control', 'id': 'price-copies', 'placeholder': '100'}),
    )

    cost = forms.DecimalField(
        label='Себестоимость (руб.)',
        min_value=0,
        max_digits=10,
        decimal_places=2,
        widget=forms.NumberInput(attrs={'class': 'form-control', 'id': 'price-cost', 'step': '0.01'}),
    )

    markup_percent = forms.DecimalField(
        label='Наценка (%)',
        min_value=0,
        max_digits=5,
        decimal_places=2,
        widget=forms.NumberInput(attrs={'class': 'form-control', 'id': 'price-markup', 'step': '0.01'}),
    )

    class Meta:
        model = PrintPrice
        fields = ['printer', 'copies', 'cost', 'markup_percent']

    def clean(self):
        cleaned_data = super().clean()
        printer = cleaned_data.get('printer')
        copies = cleaned_data.get('copies')
        if printer and copies:
            # Проверка уникальности пары (printer, copies)
            existing = PrintPrice.objects.filter(printer=printer, copies=copies)
            if self.instance and self.instance.pk:
                existing = existing.exclude(pk=self.instance.pk)
            if existing.exists():
                raise forms.ValidationError(
                    f"Цена для принтера '{printer.name}' с тиражом {copies} шт. уже существует."
                )
        return cleaned_data


class PrintPriceUpdateForm(forms.ModelForm):
    """Форма для inline-редактирования цены принтера."""

    class Meta:
        model = PrintPrice
        fields = ['copies', 'cost', 'markup_percent']

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Настройка виджетов для inline-редактирования
        self.fields['copies'].widget = forms.NumberInput(attrs={
            'class': 'inline-edit-input copies-input',
            'min': 1, 'step': 1,
        })
        self.fields['cost'].widget = forms.NumberInput(attrs={
            'class': 'inline-edit-input cost-input',
            'min': 0, 'step': 0.01,
        })
        self.fields['markup_percent'].widget = forms.NumberInput(attrs={
            'class': 'inline-edit-input markup-input',
            'min': 0, 'step': 0.01,
        })

    def clean(self):
        cleaned_data = super().clean()
        if self.instance and self.instance.pk:
            printer = self.instance.printer
            copies = cleaned_data.get('copies')
            if copies is not None and copies != self.instance.copies:
                existing = PrintPrice.objects.filter(printer=printer, copies=copies).exclude(pk=self.instance.pk)
                if existing.exists():
                    raise forms.ValidationError(
                        f"Цена для принтера '{printer.name}' с тиражом {copies} шт. уже существует."
                    )
        return cleaned_data


# ==================== НОВЫЕ ФОРМЫ ДЛЯ ЛАМИНАТОРОВ ====================

class LaminatorPriceForm(forms.ModelForm):
    """Форма для создания новой цены на ламинирование (ламинатор)."""

    laminator = forms.ModelChoiceField(
        queryset=Laminator.objects.all().order_by('name'),
        label='Ламинатор',
        help_text='Выберите ламинатор, для которого устанавливается цена',
        widget=forms.Select(attrs={'class': 'form-control', 'id': 'laminator-price-laminator'}),
        empty_label="-- Выберите ламинатор --",
    )

    copies = forms.IntegerField(
        label='Тираж (шт.)',
        min_value=1,
        widget=forms.NumberInput(attrs={'class': 'form-control', 'id': 'laminator-price-copies', 'placeholder': '100'}),
    )

    cost = forms.DecimalField(
        label='Себестоимость (руб.)',
        min_value=0,
        max_digits=10,
        decimal_places=2,
        widget=forms.NumberInput(attrs={'class': 'form-control', 'id': 'laminator-price-cost', 'step': '0.01'}),
    )

    markup_percent = forms.DecimalField(
        label='Наценка (%)',
        min_value=0,
        max_digits=5,
        decimal_places=2,
        widget=forms.NumberInput(attrs={'class': 'form-control', 'id': 'laminator-price-markup', 'step': '0.01'}),
    )

    class Meta:
        model = LaminatorPrice
        fields = ['laminator', 'copies', 'cost', 'markup_percent']

    def clean(self):
        cleaned_data = super().clean()
        laminator = cleaned_data.get('laminator')
        copies = cleaned_data.get('copies')
        if laminator and copies:
            existing = LaminatorPrice.objects.filter(laminator=laminator, copies=copies)
            if self.instance and self.instance.pk:
                existing = existing.exclude(pk=self.instance.pk)
            if existing.exists():
                raise forms.ValidationError(
                    f"Цена для ламинатора '{laminator.name}' с тиражом {copies} шт. уже существует."
                )
        return cleaned_data


class LaminatorPriceUpdateForm(forms.ModelForm):
    """Форма для inline-редактирования цены ламинатора."""

    class Meta:
        model = LaminatorPrice
        fields = ['copies', 'cost', 'markup_percent']

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields['copies'].widget = forms.NumberInput(attrs={
            'class': 'inline-edit-input copies-input',
            'min': 1, 'step': 1,
        })
        self.fields['cost'].widget = forms.NumberInput(attrs={
            'class': 'inline-edit-input cost-input',
            'min': 0, 'step': 0.01,
        })
        self.fields['markup_percent'].widget = forms.NumberInput(attrs={
            'class': 'inline-edit-input markup-input',
            'min': 0, 'step': 0.01,
        })

    def clean(self):
        cleaned_data = super().clean()
        if self.instance and self.instance.pk:
            laminator = self.instance.laminator
            copies = cleaned_data.get('copies')
            if copies is not None and copies != self.instance.copies:
                existing = LaminatorPrice.objects.filter(laminator=laminator, copies=copies).exclude(pk=self.instance.pk)
                if existing.exists():
                    raise forms.ValidationError(
                        f"Цена для ламинатора '{laminator.name}' с тиражом {copies} шт. уже существует."
                    )
        return cleaned_data