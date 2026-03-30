# calculator/models_lamination.py
"""
Модель для ламинации, привязанной к печатному компоненту.
Содержит поля для выбора ламинатора и плёнки, автоматический расчёт цены.
"""

from django.db import models
from django.core.validators import MinValueValidator
from decimal import Decimal

# Импортируем связанные модели
from devices.models import Laminator
from sklad.models import Material
from .models_list_proschet import PrintComponent
# Импортируем утилиту для интерполяции цен ламинаторов
from print_price.utils import get_cost_and_markup_for_laminator_and_copies


class Laminate(models.Model):
    """
    Модель ламинации для печатного компонента.
    Если включена (is_enabled=True), то для данного компонента будет рассчитана
    стоимость ламинации на основе выбранного ламинатора и плёнки.
    """

    # Связь с печатным компонентом (один компонент может иметь одну запись ламинации)
    print_component = models.OneToOneField(
        PrintComponent,
        on_delete=models.CASCADE,
        verbose_name='Печатный компонент',
        related_name='lamination',          # доступ через component.lamination
        help_text='Печатный компонент, к которому применяется ламинация'
    )

    # Флаг включения ламинации (выключатель)
    is_enabled = models.BooleanField(
        verbose_name='Ламинация включена',
        default=False,
        help_text='Отметьте, если требуется ламинирование'
    )

    # Выбранный ламинатор (из приложения devices)
    laminator = models.ForeignKey(
        Laminator,
        on_delete=models.PROTECT,
        verbose_name='Ламинатор',
        null=True,
        blank=True,
        help_text='Выберите ламинатор, на котором будет выполняться ламинация'
    )

    # Выбранная плёнка (из приложения sklad, тип film)
    film = models.ForeignKey(
        Material,
        on_delete=models.SET_NULL,
        verbose_name='Плёнка',
        null=True,
        blank=True,
        limit_choices_to={'type': 'film'},   # только плёнки
        help_text='Выберите плёнку из склада'
    )

    # Расчётные поля (заполняются автоматически)
    # Себестоимость ламинации за лист (без учёта плёнки)
    laminator_cost = models.DecimalField(
        verbose_name='Себестоимость ламинации (руб./лист)',
        max_digits=10,
        decimal_places=2,
        default=Decimal('0.00'),
        validators=[MinValueValidator(Decimal('0.00'))],
        help_text='Себестоимость работы ламинатора на один лист (интерполяция)'
    )

    # Наценка ламинатора (%)
    laminator_markup = models.DecimalField(
        verbose_name='Наценка ламинатора (%)',
        max_digits=5,
        decimal_places=2,
        default=Decimal('0.00'),
        validators=[MinValueValidator(Decimal('0.00'))],
        help_text='Наценка ламинатора (процент от себестоимости)'
    )

    # Цена ламинации за лист (с наценкой)
    laminator_price = models.DecimalField(
        verbose_name='Цена ламинации (руб./лист)',
        max_digits=10,
        decimal_places=2,
        default=Decimal('0.00'),
        validators=[MinValueValidator(Decimal('0.00'))],
        help_text='Итоговая цена работы ламинатора за один лист'
    )

    # Цена плёнки за лист (берётся из материала)
    film_price = models.DecimalField(
        verbose_name='Цена плёнки (руб./лист)',
        max_digits=10,
        decimal_places=2,
        default=Decimal('0.00'),
        validators=[MinValueValidator(Decimal('0.00'))],
        help_text='Цена одного листа плёнки (из склада)'
    )

    # Общая стоимость ламинации для всего тиража (листов)
    total_price = models.DecimalField(
        verbose_name='Общая стоимость ламинации',
        max_digits=12,
        decimal_places=2,
        default=Decimal('0.00'),
        validators=[MinValueValidator(Decimal('0.00'))],
        help_text='(цена ламинации + цена плёнки) × количество листов'
    )

    created_at = models.DateTimeField(
        verbose_name='Дата создания',
        auto_now_add=True
    )
    updated_at = models.DateTimeField(
        verbose_name='Дата обновления',
        auto_now=True
    )

    class Meta:
        verbose_name = 'Ламинация'
        verbose_name_plural = 'Ламинации'
        ordering = ['-created_at']

    def __str__(self):
        if self.is_enabled and self.laminator and self.film:
            return f"Ламинация для {self.print_component.number}: {self.laminator.name} + {self.film.name}"
        return f"Ламинация для {self.print_component.number} (выключена)"

    def recalculate_price(self, sheet_count):
        """
        Пересчитывает стоимость ламинации на основе текущих параметров
        и заданного количества листов.
        Вызывается при изменении количества листов, ламинатора, плёнки или включении/выключении.
        """
        # Если ламинация выключена – обнуляем все расчёты
        if not self.is_enabled:
            self.laminator_cost = Decimal('0.00')
            self.laminator_markup = Decimal('0.00')
            self.laminator_price = Decimal('0.00')
            self.film_price = Decimal('0.00')
            self.total_price = Decimal('0.00')
            return

        # 1. Расчёт себестоимости и наценки ламинатора (интерполяция по количеству листов)
        if self.laminator and sheet_count > 0:
            copies_int = int(sheet_count)  # количество листов – это тираж для ламинатора
            cost, markup = get_cost_and_markup_for_laminator_and_copies(self.laminator, copies_int)
            self.laminator_cost = cost.quantize(Decimal('0.01'))
            self.laminator_markup = markup.quantize(Decimal('0.01'))
            # Итоговая цена ламинации за лист
            self.laminator_price = (cost + cost * markup / Decimal('100')).quantize(Decimal('0.01'))
        else:
            self.laminator_cost = Decimal('0.00')
            self.laminator_markup = Decimal('0.00')
            self.laminator_price = Decimal('0.00')

        # 2. Цена плёнки за лист (берётся из модели Material)
        if self.film and self.film.type == 'film':
            # get_price() возвращает цену с учётом наценки (для плёнки)
            self.film_price = self.film.get_price().quantize(Decimal('0.01'))
        else:
            self.film_price = Decimal('0.00')

        # 3. Общая стоимость = (цена ламинации + цена плёнки) × количество листов
        total = (self.laminator_price + self.film_price) * Decimal(str(sheet_count))
        self.total_price = total.quantize(Decimal('0.01'))

    def to_dict(self):
        """Преобразует объект в словарь для JSON-ответов (AJAX)."""
        # Получаем количество листов из связанной записи вычислений листов
        from vichisliniya_listov.models import VichisliniyaListovModel
        try:
            vich_data = VichisliniyaListovModel.objects.get(
                vichisliniya_listov_print_component=self.print_component
            )
            sheet_count = vich_data.vichisliniya_listov_list_count
        except VichisliniyaListovModel.DoesNotExist:
            sheet_count = Decimal('0.00')

        return {
            'id': self.id,
            'print_component_id': self.print_component.id,
            'is_enabled': self.is_enabled,
            'laminator_id': self.laminator.id if self.laminator else None,
            'laminator_name': self.laminator.name if self.laminator else None,
            'film_id': self.film.id if self.film else None,
            'film_name': self.film.name if self.film else None,
            'laminator_cost': float(self.laminator_cost),
            'laminator_cost_display': f"{self.laminator_cost:.2f} руб.",
            'laminator_markup': float(self.laminator_markup),
            'laminator_markup_display': f"{self.laminator_markup}%",
            'laminator_price': float(self.laminator_price),
            'laminator_price_display': f"{self.laminator_price:.2f} руб./лист",
            'film_price': float(self.film_price),
            'film_price_display': f"{self.film_price:.2f} руб./лист",
            'total_price': float(self.total_price),
            'total_price_display': f"{self.total_price:.2f} ₽",
            'sheet_count': float(sheet_count),
            'sheet_count_display': f"{float(sheet_count):,.2f}".replace(',', ' ') if sheet_count > 0 else "0.00",
        }