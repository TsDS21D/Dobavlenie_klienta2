"""
forms.py для приложения print_price
Формы для добавления и редактирования цен на печать (цена за 1 лист)
"""

from django import forms
from .models import PrintPrice
from devices.models import Printer


class PrintPriceForm(forms.ModelForm):
    """
    Форма для создания и редактирования цены на печать за 1 лист
    
    Простая форма: выбираем принтер, вводим тираж и цену за 1 лист
    """
    
    # Поле выбора принтера
    printer = forms.ModelChoiceField(
        queryset=Printer.objects.all().order_by('name'),  # Все принтеры, отсортированные по имени
        label='Принтер',
        help_text='Выберите принтер для которого устанавливается цена',
        widget=forms.Select(attrs={
            'class': 'form-control',
            'id': 'print-price-printer',
        }),
        empty_label="-- Выберите принтер --",  # Текст для пустого выбора
    )
    
    # Поле для количества копий
    copies = forms.IntegerField(
        label='Тираж (количество копий)',
        help_text='Введите количество экземпляров для печати',
        min_value=1,  # Минимум 1 копия
        widget=forms.NumberInput(attrs={
            'class': 'form-control',
            'id': 'print-price-copies',
            'placeholder': 'Например: 100, 500, 1000',
        }),
    )
    
    # Поле для цены за 1 лист
    price_per_sheet = forms.DecimalField(
        label='Цена за 1 лист (руб.)',
        help_text='Введите цену печати одного листа при указанном тираже',
        min_value=0,  # Минимум 0 рублей
        max_digits=10,
        decimal_places=2,
        widget=forms.NumberInput(attrs={
            'class': 'form-control',
            'id': 'print-price-price',
            'placeholder': 'Например: 2.50, 5.00',
            'step': '0.01',  # Шаг изменения (для копеек)
        }),
    )
    
    class Meta:
        """
        Метаданные формы - связь с моделью и поля
        """
        model = PrintPrice
        fields = ['printer', 'copies', 'price_per_sheet']
    
    def clean(self):
        """
        Дополнительная валидация данных формы
        
        Проверяем уникальность: для одного принтера не может быть двух одинаковых тиражей
        """
        cleaned_data = super().clean()
        
        # Получаем значения из очищенных данных
        printer = cleaned_data.get('printer')
        copies = cleaned_data.get('copies')
        
        # Проверяем уникальность: принтер + тираж не должны повторяться
        if printer and copies is not None:
            # Ищем существующие записи с такими же параметрами
            existing = PrintPrice.objects.filter(
                printer=printer,
                copies=copies
            )
            
            # Если форма редактирует существующий объект, исключаем его из проверки
            if self.instance and self.instance.pk:
                existing = existing.exclude(pk=self.instance.pk)
            
            # Если нашли дубликат, показываем ошибку
            if existing.exists():
                raise forms.ValidationError(
                    f"Цена для принтера '{printer.name}' с тиражом {copies} шт. уже существует."
                )
        
        return cleaned_data


class PrintPriceUpdateForm(forms.ModelForm):
    """
    Форма для редактирования цены на печать (используется для in-line редактирования)
    
    Эта форма используется только для обновления существующих записей через AJAX.
    Она не включает поле принтера, так как принтер нельзя менять при редактировании.
    """
    
    class Meta:
        """
        Метаданные формы - связь с моделью и поля
        """
        model = PrintPrice
        fields = ['copies', 'price_per_sheet']
    
    def __init__(self, *args, **kwargs):
        """
        Инициализация формы - настройка полей для in-line редактирования
        """
        super().__init__(*args, **kwargs)
        
        # Настраиваем поле для количества копий
        self.fields['copies'].widget = forms.NumberInput(attrs={
            'class': 'inline-edit-input copies-input',
            'min': 1,
            'step': 1,
        })
        
        # Настраиваем поле для цены за лист
        self.fields['price_per_sheet'].widget = forms.NumberInput(attrs={
            'class': 'inline-edit-input price-input',
            'min': 0.01,
            'step': 0.01,
        })
    
    def clean(self):
        """
        Дополнительная валидация для формы редактирования
        
        Проверяем уникальность тиража для текущего принтера
        """
        cleaned_data = super().clean()
        
        # Проверяем, есть ли текущий экземпляр (объект для редактирования)
        if self.instance and self.instance.pk:
            printer = self.instance.printer  # Получаем принтер из текущего объекта
            copies = cleaned_data.get('copies')
            
            # Если меняется тираж, проверяем уникальность
            if copies is not None and copies != self.instance.copies:
                # Ищем существующие записи с такими же параметрами
                existing = PrintPrice.objects.filter(
                    printer=printer,
                    copies=copies
                ).exclude(pk=self.instance.pk)  # Исключаем текущую запись
                
                # Если нашли дубликат, показываем ошибку
                if existing.exists():
                    raise forms.ValidationError(
                        f"Цена для принтера '{printer.name}' с тиражом {copies} шт. уже существует."
                    )
        
        return cleaned_data
