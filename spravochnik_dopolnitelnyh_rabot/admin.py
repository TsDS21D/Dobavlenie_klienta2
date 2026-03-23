"""
admin.py для приложения spravochnik_dopolnitelnyh_rabot.
Регистрация модели Work в админке с динамическим отображением себестоимости и цены.
Для формулы 1 поля cost и price вычисляются стандартно (cost редактируемый, price читается из БД).
Для формул 2–6 поля cost и price отображаются как рассчитанные значения (только для чтения),
при этом сами значения в БД не меняются.
"""

from django.contrib import admin
from django import forms
from .models import Work, WorkPrice, WorkCirculationPrice
from .utils import calculate_price_for_work, calculate_price_for_work_by_circulation


class WorkForm(forms.ModelForm):
    """
    Кастомная форма для модели Work.
    Для формул 2–6 подменяет поле cost на нередактируемое текстовое поле с рассчитанным значением,
    а также устанавливает отображаемое значение для поля price.
    """
    class Meta:
        model = Work
        fields = '__all__'

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        instance = kwargs.get('instance')

        # Если объект уже существует и формула не 1, показываем расчётные значения
        if instance and instance.pk and instance.formula_type != 1:
            try:
                # Выбираем нужную функцию интерполяции в зависимости от формулы
                if instance.formula_type in [2, 3]:
                    if instance.circulation_prices.exists():
                        cost = calculate_price_for_work_by_circulation(instance, 1)
                    else:
                        # Если нет опорных точек, используем сохранённую цену (но это странно)
                        cost = instance.price
                else:  # формулы 4,5,6
                    if instance.work_prices.exists():
                        cost = calculate_price_for_work(instance, 1)
                    else:
                        cost = instance.price
                cost_display = f"{cost:.2f} руб."
                markup = instance.markup_percent if instance.markup_percent else 0
                final_price = cost + (cost * markup / 100)
                price_display = f"{final_price:.2f} руб."
            except Exception:
                cost_display = "Ошибка расчёта"
                price_display = "Ошибка расчёта"

            # Заменяем поле cost на текстовое (только для чтения) с вычисленным значением
            self.fields['cost'] = forms.CharField(
                initial=cost_display,
                disabled=True,
                label='Себестоимость (руб)',
                help_text='Рассчитанная себестоимость для 1 листа / 1 экз. тиража'
            )
            # Устанавливаем отображаемое значение для поля price (оно уже readonly в админке)
            # Для этого нужно переопределить поле price как CharField только для чтения
            self.fields['price'] = forms.CharField(
                initial=price_display,
                disabled=True,
                label='Цена (руб)',
                help_text='Рассчитанная цена для 1 листа / 1 экз. тиража (себестоимость + наценка)'
            )
        else:
            # Для формулы 1 (или новой записи) оставляем редактируемое DecimalField для cost
            self.fields['cost'] = forms.DecimalField(
                max_digits=10, decimal_places=2, min_value=0,
                label='Себестоимость (руб)',
                help_text='Для формулы 1 введите статическую себестоимость'
            )
            # price оставляем как есть (DecimalField, необязательно readonly, но мы сделаем его только для чтения)
            self.fields['price'].disabled = True
            self.fields['price'].help_text = 'Автоматически вычисляется на основе себестоимости и наценки'


@admin.register(Work)
class WorkAdmin(admin.ModelAdmin):
    """
    Настройка отображения модели Work в админ-панели.
    """
    form = WorkForm
    list_display = ['name', 'display_cost', 'display_price', 'created_at', 'updated_at']
    search_fields = ['name']
    list_filter = ['created_at', 'formula_type']
    ordering = ['-created_at']
    readonly_fields = ['created_at', 'updated_at']  # price теперь не readonly, потому что мы его переопределяем в форме
    list_per_page = 20

    fieldsets = (
        ('Основная информация', {
            'fields': ('name', 'cost', 'markup_percent', 'formula_type', 'interpolation_method')
        }),
        ('Параметры расчёта', {
            'fields': ('k_lines', 'default_lines_count', 'default_items_per_sheet')
        }),
        ('Системные поля', {
            'fields': ('created_at', 'updated_at', 'price'),
            'classes': ('collapse',)
        }),
    )

    def display_cost(self, obj):
        """
        Вычисляемое поле для списка работ – показывает себестоимость.
        """
        if obj.formula_type == 1:
            return f"{obj.cost:.2f} руб." if obj.cost is not None else "0.00 руб."
        else:
            try:
                if obj.formula_type in [2, 3]:
                    if obj.circulation_prices.exists():
                        cost = calculate_price_for_work_by_circulation(obj, 1)
                    else:
                        cost = obj.price
                else:
                    if obj.work_prices.exists():
                        cost = calculate_price_for_work(obj, 1)
                    else:
                        cost = obj.price
                return f"{cost:.2f} руб."
            except Exception:
                return "Ошибка"
    display_cost.short_description = 'Себестоимость (руб)'

    def display_price(self, obj):
        """
        Вычисляемое поле для списка работ – показывает итоговую цену с наценкой.
        """
        if obj.formula_type == 1:
            return f"{obj.price:.2f} руб." if obj.price is not None else "0.00 руб."
        else:
            try:
                if obj.formula_type in [2, 3]:
                    if obj.circulation_prices.exists():
                        cost = calculate_price_for_work_by_circulation(obj, 1)
                    else:
                        cost = obj.price
                else:
                    if obj.work_prices.exists():
                        cost = calculate_price_for_work(obj, 1)
                    else:
                        cost = obj.price
                markup = obj.markup_percent if obj.markup_percent else 0
                price = cost + (cost * markup / 100)
                return f"{price:.2f} руб."
            except Exception:
                return "Ошибка"
    display_price.short_description = 'Цена (руб)'


@admin.register(WorkPrice)
class WorkPriceAdmin(admin.ModelAdmin):
    """Админка для WorkPrice (без изменений)."""
    list_display = ['work', 'sheets', 'price', 'created_at']
    list_filter = ['work', 'created_at']
    search_fields = ['work__name']
    ordering = ['work', 'sheets']
    autocomplete_fields = ['work']


@admin.register(WorkCirculationPrice)
class WorkCirculationPriceAdmin(admin.ModelAdmin):
    """Админка для WorkCirculationPrice (без изменений)."""
    list_display = ['work', 'circulation', 'price', 'created_at']
    list_filter = ['work', 'created_at']
    search_fields = ['work__name']
    ordering = ['work', 'circulation']
    autocomplete_fields = ['work']