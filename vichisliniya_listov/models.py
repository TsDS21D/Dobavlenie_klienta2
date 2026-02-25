"""
Файл models.py для приложения vichisliniya_listov.
ОБНОВЛЕНО:
- Добавлены поля для хранения размеров изделия и результатов расчёта размещения на листе.
- Исправлен метод расчёта количества листов: теперь используется fit_total и округление вверх.
"""

from django.db import models
from decimal import Decimal
import math  # для округления вверх


class VichisliniyaListovModel(models.Model):
    """
    Модель VichisliniyaListovModel для хранения данных вычислений листов.
    ВАЖНОЕ ИЗМЕНЕНИЕ: Теперь модель привязана к печатным компонентам (PrintComponent), а не к просчётам.
    Это позволяет иметь отдельные вычисления листов для каждого компонента печати в рамках одного просчёта.
    
    ВНИМАНИЕ: Все имена полей и переменных используют префикс "vichisliniya_listov_"
    для избежания конфликтов с другими приложениями.
    """

    # ===== ВЫБОРЫ ДЛЯ ПОЛЕЙ =====

    # Варианты цветности для поля vichisliniya_listov_color
    VICHISLINIYA_LISTOV_COLOR_CHOICES = [
        ('1+0', '1+0 (односторонняя одноцветная)'),
        ('1+1', '1+1 (двусторонняя одноцветная)'),
        ('4+0', '4+0 (односторонняя полноцветная)'),
        ('4+4', '4+4 (двусторонняя полноцветная)'),
    ]

    # Варианты выбранной ориентации размещения изделий на листе
    VICHISLINIYA_LISTOV_ORIENTATION_CHOICES = [
        ('landscape', 'Альбомная'),
        ('portrait', 'Портретная'),
        ('auto', 'Авто (оптимальная)'),
    ]

    # ===== ОСНОВНЫЕ ПОЛЯ МОДЕЛИ =====

    # Связь с печатным компонентом (один к одному)
    vichisliniya_listov_print_component = models.ForeignKey(
        'calculator.PrintComponent',
        verbose_name='Печатный компонент',
        on_delete=models.CASCADE,
        related_name='vichisliniya_listov_data',
        help_text='Печатный компонент, для которого выполняются вычисления листов',
        db_index=True,
        unique=True
    )

    # Количество листов - основное вычисляемое значение
    vichisliniya_listov_list_count = models.DecimalField(
        verbose_name='Количество листов',
        help_text='Расчётное количество листов на основе тиража и количества изделий на листе (округлено вверх)',
        max_digits=10,
        decimal_places=2,
        default=0.00
    )

    # Вылеты – теперь ИСПОЛЬЗУЕТСЯ КАК РАССТОЯНИЕ МЕЖДУ ИЗДЕЛИЯМИ НА ЛИСТЕ (согласно заданию)
    vichisliniya_listov_vyleta = models.PositiveIntegerField(
        verbose_name='Вылеты (межвизиточное расстояние)',
        help_text='Расстояние между изделиями на листе в миллиметрах (используется для расчёта размещения)',
        default=1
    )

    # Количество полос – пока оставляем для обратной совместимости, но в новом алгоритме не участвует
    vichisliniya_listov_polosa_count = models.PositiveIntegerField(
        verbose_name='Количество полос',
        help_text='Количество полос (страниц), размещаемых на одном листе (устаревает)',
        default=1
    )

    # Цветность
    vichisliniya_listov_color = models.CharField(
        verbose_name='Цветность',
        help_text='Вариант цветности печати',
        max_length=10,
        choices=VICHISLINIYA_LISTOV_COLOR_CHOICES,
        default='4+0'
    )

    # ===== НОВЫЕ ПОЛЯ ДЛЯ РАЗМЕРОВ ИЗДЕЛИЯ И РАЗМЕЩЕНИЯ =====

    # Ширина изделия в миллиметрах (например, 90 мм для визитки)
    vichisliniya_listov_item_width = models.DecimalField(
        verbose_name='Ширина изделия (мм)',
        max_digits=6,
        decimal_places=2,
        default=Decimal('90.00'),
        help_text='Ширина одного изделия в миллиметрах (например, 90 для визитки)'
    )

    # Высота изделия в миллиметрах
    vichisliniya_listov_item_height = models.DecimalField(
        verbose_name='Высота изделия (мм)',
        max_digits=6,
        decimal_places=2,
        default=Decimal('50.00'),
        help_text='Высота одного изделия в миллиметрах (например, 50 для визитки)'
    )

    # Количество изделий, помещающихся по горизонтали при выбранной ориентации
    vichisliniya_listov_fit_horizontal = models.PositiveIntegerField(
        verbose_name='По горизонтали',
        default=0,
        help_text='Количество изделий, помещающихся по горизонтали при текущей выбранной ориентации'
    )

    # Количество изделий, помещающихся по вертикали при выбранной ориентации
    vichisliniya_listov_fit_vertical = models.PositiveIntegerField(
        verbose_name='По вертикали',
        default=0,
        help_text='Количество изделий, помещающихся по вертикали при текущей выбранной ориентации'
    )

    # Общее количество изделий на листе при выбранной ориентации
    vichisliniya_listov_fit_total = models.PositiveIntegerField(
        verbose_name='Всего изделий на листе',
        default=0,
        help_text='Общее количество изделий, помещающихся на одном листе при выбранной ориентации'
    )

    # Количество изделий при альбомной ориентации (без поворота изделия)
    vichisliniya_listov_fit_landscape_total = models.PositiveIntegerField(
        verbose_name='Альбомная ориентация',
        default=0,
        help_text='Количество изделий, если размещать их в альбомной ориентации (без поворота)'
    )

    # Количество изделий при портретной ориентации (с поворотом изделия на 90°)
    vichisliniya_listov_fit_portrait_total = models.PositiveIntegerField(
        verbose_name='Портретная ориентация',
        default=0,
        help_text='Количество изделий, если размещать их в портретной ориентации (с поворотом на 90°)'
    )

    # Выбранная ориентация (альбомная, портретная или авто)
    vichisliniya_listov_fit_selected_orientation = models.CharField(
        verbose_name='Выбранная ориентация',
        max_length=10,
        choices=VICHISLINIYA_LISTOV_ORIENTATION_CHOICES,
        default='auto',
        help_text='Какая ориентация размещения выбрана в данный момент'
    )

    # ===== МЕТАДАННЫЕ И СЛУЖЕБНЫЕ ПОЛЯ =====

    vichisliniya_listov_created_at = models.DateTimeField(
        verbose_name='Дата создания',
        auto_now_add=True
    )

    vichisliniya_listov_updated_at = models.DateTimeField(
        verbose_name='Дата обновления',
        auto_now=True
    )

    # ===== МЕТАКЛАСС =====

    class Meta:
        db_table = 'vichisliniya_listov_data'
        ordering = ['-vichisliniya_listov_created_at']
        verbose_name = 'Вычисление листов'
        verbose_name_plural = 'Вычисления листов'

    # ===== МАГИЧЕСКИЕ МЕТОДЫ =====

    def __str__(self):
        component_id = self.vichisliniya_listov_print_component_id
        component_number = self.vichisliniya_listov_print_component.number if self.vichisliniya_listov_print_component else "N/A"
        return (f"Вычисления для компонента {component_number} (ID: {component_id}): "
                f"{self.vichisliniya_listov_list_count} листов, "
                f"изделие {self.vichisliniya_listov_item_width}×{self.vichisliniya_listov_item_height} мм, "
                f"на листе {self.vichisliniya_listov_fit_total} шт.")

    # ===== ПОЛЬЗОВАТЕЛЬСКИЕ МЕТОДЫ =====

    def vichisliniya_listov_calculate_list_count(self, circulation):
        """
        Метод для расчёта количества листов на основе тиража и количества изделий на листе.
        Новая логика: количество листов = ceil(тираж / количество_изделий_на_листе).
        Если количество_изделий_на_листе равно 0, возвращает 0 (чтобы избежать деления на ноль).

        Аргументы:
            circulation (int или Decimal): тираж изделий.

        Возвращает:
            Decimal: округлённое вверх количество листов с двумя знаками после запятой.
        """
        from decimal import Decimal
        import math

        # Преобразуем тираж в Decimal для точности
        circulation_decimal = Decimal(str(circulation))

        # Получаем количество изделий на листе при выбранной ориентации
        fit_total = self.vichisliniya_listov_fit_total

        # Если изделий на листе 0, расчёт невозможен – возвращаем 0
        if fit_total == 0:
            self.vichisliniya_listov_list_count = Decimal('0.00')
            return self.vichisliniya_listov_list_count

        # Вычисляем количество листов как дробь
        raw_list_count = circulation_decimal / Decimal(fit_total)

        # Округляем вверх до целого числа (так как листы считаются целыми)
        # Для округления вверх используем math.ceil, результат преобразуем в Decimal
        ceil_list_count = math.ceil(float(raw_list_count))

        # Сохраняем результат с двумя десятичными знаками (как целое число, но в формате 2 знака)
        self.vichisliniya_listov_list_count = Decimal(ceil_list_count).quantize(Decimal('0.00'))

        return self.vichisliniya_listov_list_count

    def vichisliniya_listov_get_color_display_name(self):
        for value, display_name in self.VICHISLINIYA_LISTOV_COLOR_CHOICES:
            if value == self.vichisliniya_listov_color:
                return display_name
        return self.vichisliniya_listov_color

    def vichisliniya_listov_to_dict(self):
        """
        Преобразование объекта в словарь для JSON.
        Теперь включает новые поля.
        """
        return {
            'print_component_id': self.vichisliniya_listov_print_component_id,
            'print_component_number': self.vichisliniya_listov_print_component.number if self.vichisliniya_listov_print_component else None,
            'list_count': float(self.vichisliniya_listov_list_count),
            'vyleta': self.vichisliniya_listov_vyleta,
            'polosa_count': self.vichisliniya_listov_polosa_count,
            'color': self.vichisliniya_listov_color,
            'color_display': self.vichisliniya_listov_get_color_display_name(),
            'item_width': float(self.vichisliniya_listov_item_width),
            'item_height': float(self.vichisliniya_listov_item_height),
            'fit_horizontal': self.vichisliniya_listov_fit_horizontal,
            'fit_vertical': self.vichisliniya_listov_fit_vertical,
            'fit_total': self.vichisliniya_listov_fit_total,
            'fit_landscape_total': self.vichisliniya_listov_fit_landscape_total,
            'fit_portrait_total': self.vichisliniya_listov_fit_portrait_total,
            'fit_selected_orientation': self.vichisliniya_listov_fit_selected_orientation,
            'created_at': self.vichisliniya_listov_created_at.isoformat(),
            'updated_at': self.vichisliniya_listov_updated_at.isoformat(),
        }

    def vichisliniya_listov_get_proschet_id(self):
        if self.vichisliniya_listov_print_component and self.vichisliniya_listov_print_component.proschet:
            return self.vichisliniya_listov_print_component.proschet_id
        return None

    def vichisliniya_listov_get_proschet_info(self):
        if (self.vichisliniya_listov_print_component and
            self.vichisliniya_listov_print_component.proschet):
            proschet = self.vichisliniya_listov_print_component.proschet
            return {
                'proschet_id': proschet.id,
                'proschet_number': proschet.number,
                'proschet_title': proschet.title,
                'circulation': proschet.circulation,
            }
        return None