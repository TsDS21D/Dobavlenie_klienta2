# calculator/models_list_proschet.py
"""
Модель Proscheт (Просчёт) для калькулятора типографии и связанные модели.
Включает Компоненты печати (с уникальным номером KP-) и Дополнительные работы (с уникальным номером DR-).

ИСПРАВЛЕНИЯ:
1. Добавлено свойство `formatted_circulation` в PrintComponent – возвращает отформатированный тираж из просчёта.
2. Добавлено свойство `circulation_display` для обратной совместимости с админкой.
3. Добавлен метод `recalculate_price()` – пересчёт цены по действию в админке.
4. Все комментарии максимально подробны для новичков.
"""

from django.db import models
from django.db.models import Max, Sum
from django.core.validators import MinValueValidator
from decimal import Decimal
import math


class Proschet(models.Model):
    """
    Основная модель для хранения информации о просчётах.
    """
    number = models.CharField(
        verbose_name='Номер просчёта',
        max_length=20,
        unique=True,
        blank=True,
        help_text='Автоматически генерируется в формате PR-1, PR-2 и т.д.'
    )
    title = models.CharField(
        verbose_name='Название просчёта',
        max_length=200,
        help_text='Краткое описание заказа'
    )
    circulation = models.PositiveIntegerField(
        verbose_name='Тираж',
        default=1,
        help_text='Количество экземпляров продукции (тираж). По умолчанию: 1'
    )
    client = models.ForeignKey(
        'baza_klientov.Client',
        verbose_name='Клиент',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        help_text='Клиент, для которого выполняется просчёт'
    )
    created_at = models.DateTimeField(
        verbose_name='Дата создания',
        auto_now_add=True,
        help_text='Дата и время создания просчёта'
    )
    is_deleted = models.BooleanField(
        verbose_name='Удален',
        default=False,
        help_text='Помечает просчёт как удаленный'
    )

    class Meta:
        verbose_name = 'Просчёт'
        verbose_name_plural = 'Просчёты'
        ordering = ['-created_at']

    def __str__(self):
        circulation_text = f"Тираж: {self.circulation}"
        if self.client:
            return f"{self.number}: {self.title} ({circulation_text}, Клиент: {self.client.name})"
        return f"{self.number}: {self.title} ({circulation_text})"

    def save(self, *args, **kwargs):
        """Генерация номера и обновление компонентов при изменении тиража."""
        is_new = self.pk is None
        old_circulation = None
        if not is_new:
            try:
                old_instance = Proschet.objects.get(pk=self.pk)
                old_circulation = old_instance.circulation
            except Proschet.DoesNotExist:
                pass

        # Установка тиража по умолчанию
        if is_new and self.circulation is None:
            self.circulation = 1

        # Генерация номера PR-...
        if not self.number or self.number.strip() == '':
            try:
                existing_numbers = Proschet.objects.filter(
                    number__startswith='PR-'
                ).exclude(number__exact='').exclude(number__isnull=True).values_list('number', flat=True)
                max_num = 0
                for num_str in existing_numbers:
                    try:
                        num_part = num_str.split('-')[1]
                        current_num = int(num_part)
                        if current_num > max_num:
                            max_num = current_num
                    except (ValueError, IndexError, AttributeError):
                        continue
                self.number = f"PR-{max_num + 1}"
            except Exception:
                self.number = f"PR-{Proschet.objects.count() + 1}"

        super().save(*args, **kwargs)

        # Если тираж изменился – обновляем sheet_count во всех компонентах печати
        if not is_new and old_circulation != self.circulation:
            for component in self.print_components.all():
                component.sheet_count = self.circulation
                component.save()

    @property
    def formatted_created_at(self):
        """Отформатированная дата создания."""
        if self.created_at:
            from django.utils import timezone
            local_time = timezone.localtime(self.created_at)
            return local_time.strftime("%d.%m.%Y %H:%M")
        return ""

    @property
    def total_price(self):
        """Общая стоимость просчёта (компоненты + доп. работы)."""
        components_total = Decimal('0.00')
        for component in self.print_components.all():
            components_total += component.total_circulation_price
        works_total = self.additional_works.aggregate(
            total=Sum('price')
        )['total'] or Decimal('0.00')
        return components_total + works_total

    @property
    def formatted_total_price(self):
        """Отформатированная общая стоимость."""
        return f"{self.total_price:.2f} ₽"

    @property
    def formatted_circulation(self):
        """Отформатированный тираж (с разделителями тысяч)."""
        return f"{self.circulation:,}".replace(",", " ")

    def update_circulation(self, new_circulation):
        """Обновление тиража с валидацией."""
        try:
            circulation_int = int(new_circulation)
            if circulation_int <= 0:
                return False, "Тираж должен быть положительным числом"
            old_circulation = self.circulation
            self.circulation = circulation_int
            self.save()
            if old_circulation != circulation_int:
                return True, f"Тираж успешно обновлен с {old_circulation} на {circulation_int}. Связанные компоненты печати также обновлены."
            else:
                return True, "Тираж успешно обновлен (значение не изменилось)"
        except ValueError:
            return False, "Тираж должен быть целым числом"
        except Exception as e:
            return False, f"Ошибка при обновлении тиража: {str(e)}"


class PrintComponent(models.Model):
    """
    Компонент печати с уникальным номером KP-.

    ИСПРАВЛЕНИЯ:
    - Добавлено свойство `formatted_circulation` – доступ к тиражу просчёта.
    - Добавлено свойство `circulation_display` – для обратной совместимости с админкой.
    - Добавлен метод `recalculate_price()` – пересчёт цены по действию в админке.
    """

    number = models.CharField(
        verbose_name='Номер компонента',
        max_length=20,
        unique=True,
        blank=True,
        help_text='Автоматически генерируется в формате KP-1, KP-2 и т.д.'
    )
    proschet = models.ForeignKey(
        Proschet,
        verbose_name='Просчёт',
        on_delete=models.CASCADE,
        related_name='print_components',
        help_text='Просчёт, к которому относится этот компонент'
    )
    printer = models.ForeignKey(
        'devices.Printer',
        verbose_name='Принтер',
        on_delete=models.PROTECT,
        related_name='print_components',
        null=True,
        blank=True,
        help_text='Выберите принтер из списка доступных устройств'
    )
    paper = models.ForeignKey(
        'sklad.Material',
        verbose_name='Бумага',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        help_text='Выберите бумагу из списка материалов на складе.'
    )
    sheet_count = models.DecimalField(
        verbose_name='Количество листов',
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal('0.01'))],
        help_text='Количество печатных листов. Получается из приложения "Вычисления листов".'
    )
    price_per_sheet = models.DecimalField(
        verbose_name='Цена печати за лист',
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal('0.00'))],
        help_text='Стоимость печати одного листа в рублях (рассчитывается автоматически).'
    )
    created_at = models.DateTimeField(
        verbose_name='Дата создания',
        auto_now_add=True,
        help_text='Дата и время добавления компонента'
    )
    is_deleted = models.BooleanField(
        verbose_name='Удален',
        default=False,
        help_text='Помечает компонент как удаленный'
    )
    is_price_calculated = models.BooleanField(
        verbose_name='Цена рассчитана автоматически',
        default=False,
        help_text='Указывает, что цена за лист была рассчитана автоматически на основе справочника цен'
    )

    class Meta:
        verbose_name = 'Компонент печати'
        verbose_name_plural = 'Компоненты печати'
        ordering = ['created_at']

    def __str__(self):
        paper_name = self.paper.name if self.paper else 'Бумага не выбрана'
        printer_name = self.printer.name if self.printer else 'Без принтера'
        sheet_count_text = f"Листов: {self.sheet_count}" if self.sheet_count else "Листов не указано"
        return f"{self.number}: {printer_name} - {paper_name} ({sheet_count_text})"

    # ---------- ИСПРАВЛЕНИЕ 1: Свойства для работы с тиражом просчёта ----------
    @property
    def formatted_circulation(self):
        """
        Возвращает отформатированный тираж из связанного просчёта.
        Используется в админке для отображения в списке и inline-формах.
        """
        if self.proschet:
            return self.proschet.formatted_circulation
        return "—"   # прочерк, если просчёт не задан

    @property
    def circulation_display(self):
        """
        Свойство для обратной совместимости – админка ожидает поле 'circulation_display'.
        Просто вызывает formatted_circulation.
        """
        return self.formatted_circulation

    # ---------- ИСПРАВЛЕНИЕ 2: Метод для пересчёта цены (действие в админке) ----------
    def recalculate_price(self):
        """
        Пересчитывает цену за лист на основе текущего принтера и количества листов.
        Вызывается из действия админки "Пересчитать цены на основе справочника".

        Returns:
            tuple: (bool успех, str сообщение)
        """
        try:
            if self.printer and self.sheet_count:
                # Используем статический метод интерполяции
                self.price_per_sheet = self.calculate_price_for_printer_and_copies(
                    self.printer,
                    self.sheet_count
                )
                self.is_price_calculated = True
                # Сохраняем только изменённые поля (оптимизация)
                self.save(update_fields=['price_per_sheet', 'is_price_calculated'])
                return True, f"Цена успешно пересчитана: {self.price_per_sheet} руб./лист"
            else:
                return False, "Не указан принтер или количество листов"
        except Exception as e:
            return False, f"Ошибка при пересчёте цены: {str(e)}"

    # ---------- Остальные методы (без изменений) ----------
    def save(self, *args, **kwargs):
        """Переопределённый метод сохранения с генерацией номера и расчётом цены."""
        # Генерация номера KP-...
        if not self.number or self.number.strip() == '':
            try:
                existing_numbers = PrintComponent.objects.filter(
                    number__startswith='KP-'
                ).exclude(number__exact='').exclude(number__isnull=True).values_list('number', flat=True)
                max_num = 0
                for num_str in existing_numbers:
                    try:
                        num_part = num_str.split('-')[1]
                        current_num = int(num_part)
                        if current_num > max_num:
                            max_num = current_num
                    except (ValueError, IndexError, AttributeError):
                        continue
                self.number = f"KP-{max_num + 1}"
            except Exception:
                self.number = f"KP-{PrintComponent.objects.count() + 1}"

        # Установка sheet_count по умолчанию, если не указано
        if self.sheet_count is None:
            self.sheet_count = Decimal('1.00')

        # Автоматический расчёт цены, если нужно
        should_calculate_price = False
        if self.printer and self.sheet_count:
            if not self.pk:
                should_calculate_price = True
            else:
                try:
                    old_component = PrintComponent.objects.get(pk=self.pk)
                    if (old_component.printer != self.printer or
                        old_component.sheet_count != self.sheet_count):
                        should_calculate_price = True
                except PrintComponent.DoesNotExist:
                    should_calculate_price = True

        if should_calculate_price:
            try:
                calculated_price = self.calculate_price_for_printer_and_copies(
                    self.printer,
                    self.sheet_count
                )
                self.price_per_sheet = calculated_price
                self.is_price_calculated = True
            except Exception as e:
                print(f"⚠️ Ошибка при автоматическом расчете цены: {str(e)}")
                if self.price_per_sheet is None:
                    self.price_per_sheet = Decimal('0.00')
                self.is_price_calculated = False
        else:
            if self.price_per_sheet is None:
                self.price_per_sheet = Decimal('0.00')
            self.is_price_calculated = False

        super().save(*args, **kwargs)

    @staticmethod
    def calculate_price_for_printer_and_copies(printer, sheet_count):
        """Расчёт цены за лист интерполяцией (без изменений)."""
        try:
            from print_price.models import PrintPrice
            price_points = PrintPrice.objects.filter(printer=printer).order_by('copies')
            if not price_points.exists():
                return Decimal('0.00')
            sheet_count_int = int(float(sheet_count))
            interpolation_method = getattr(printer, 'devices_interpolation_method', 'linear')
            min_price = price_points.first()
            max_price = price_points.last()

            if sheet_count_int <= min_price.copies:
                return min_price.price_per_sheet
            if sheet_count_int >= max_price.copies:
                return max_price.price_per_sheet

            prev_price = None
            next_price = None
            for price in price_points:
                if price.copies <= sheet_count_int:
                    prev_price = price
                if price.copies >= sheet_count_int:
                    next_price = price
                    break

            if prev_price and next_price and prev_price != next_price:
                if interpolation_method == 'linear':
                    x1, y1 = float(prev_price.copies), float(prev_price.price_per_sheet)
                    x2, y2 = float(next_price.copies), float(next_price.price_per_sheet)
                    x = float(sheet_count_int)
                    result = y1 + (y2 - y1) * (x - x1) / (x2 - x1)
                    return Decimal(str(round(result, 2)))
                elif interpolation_method == 'logarithmic':
                    epsilon = 1e-10
                    x1 = math.log(float(prev_price.copies) + epsilon)
                    y1 = math.log(float(prev_price.price_per_sheet) + epsilon)
                    x2 = math.log(float(next_price.copies) + epsilon)
                    y2 = math.log(float(next_price.price_per_sheet) + epsilon)
                    x = math.log(float(sheet_count_int) + epsilon)
                    result_log = y1 + (y2 - y1) * (x - x1) / (x2 - x1)
                    result = math.exp(result_log) - epsilon
                    return Decimal(str(round(result, 2)))
                else:
                    # линейная по умолчанию
                    x1, y1 = float(prev_price.copies), float(prev_price.price_per_sheet)
                    x2, y2 = float(next_price.copies), float(next_price.price_per_sheet)
                    x = float(sheet_count_int)
                    result = y1 + (y2 - y1) * (x - x1) / (x2 - x1)
                    return Decimal(str(round(result, 2)))
            else:
                return prev_price.price_per_sheet if prev_price else min_price.price_per_sheet
        except Exception as e:
            print(f"⚠️ Ошибка в calculate_price_for_printer_and_copies: {str(e)}")
            return Decimal('0.00')

    @property
    def material_price_per_unit(self):
        """Цена за единицу материала."""
        if self.paper:
            return self.paper.price
        return Decimal('0.00')

    @property
    def total_circulation_price(self):
        """Общая стоимость: (печать + бумага) × листы."""
        try:
            sheet_count = self.sheet_count if self.sheet_count is not None else Decimal('0.00')
            price_per_sheet = self.price_per_sheet if self.price_per_sheet is not None else Decimal('0.00')
            material_price = self.material_price_per_unit
            return (price_per_sheet + material_price) * sheet_count
        except Exception:
            return Decimal('0.00')

    @property
    def formatted_price_per_sheet(self):
        """Отформатированная цена печати за лист."""
        if self.price_per_sheet is not None:
            return f"{self.price_per_sheet:.2f} ₽"
        return "0.00 ₽"

    @property
    def formatted_total_circulation_price(self):
        """Отформатированная общая стоимость."""
        return f"{self.total_circulation_price:.2f} ₽"

    @property
    def formatted_material_price(self):
        """Отформатированная цена материала."""
        return f"{self.material_price_per_unit:.2f} ₽" if self.paper else "Не выбрано"

    @property
    def material_cost_for_circulation(self):
        """Стоимость материала: цена × листы."""
        try:
            sheet_count = self.sheet_count if self.sheet_count is not None else Decimal('0.00')
            return self.material_price_per_unit * sheet_count
        except:
            return Decimal('0.00')

    @property
    def formatted_material_cost_for_circulation(self):
        return f"{self.material_cost_for_circulation:.2f} ₽"

    @property
    def printing_cost_for_circulation(self):
        """Стоимость печати: цена × листы."""
        try:
            sheet_count = self.sheet_count if self.sheet_count is not None else Decimal('0.00')
            price_per_sheet = self.price_per_sheet if self.price_per_sheet is not None else Decimal('0.00')
            return price_per_sheet * sheet_count
        except:
            return Decimal('0.00')

    @property
    def formatted_printing_cost_for_circulation(self):
        return f"{self.printing_cost_for_circulation:.2f} ₽"


class AdditionalWork(models.Model):
    """Дополнительная работа (без изменений)."""
    number = models.CharField(
        verbose_name='Номер работы',
        max_length=20,
        unique=True,
        blank=True,
        help_text='Автоматически генерируется в формате DR-1, DR-2 и т.д.'
    )
    proschet = models.ForeignKey(
        Proschet,
        verbose_name='Просчёт',
        on_delete=models.CASCADE,
        related_name='additional_works',
        help_text='Просчёт, к которому относится эта работа'
    )
    title = models.CharField(
        verbose_name='Название работы',
        max_length=200,
        help_text='Название дополнительной работы'
    )
    price = models.DecimalField(
        verbose_name='Цена',
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0.00'))],
        help_text='Стоимость работы в рублях'
    )
    created_at = models.DateTimeField(
        verbose_name='Дата создания',
        auto_now_add=True,
        help_text='Дата и время добавления работы'
    )
    is_deleted = models.BooleanField(
        verbose_name='Удален',
        default=False,
        help_text='Помечает работу как удаленную'
    )

    class Meta:
        verbose_name = 'Дополнительная работа'
        verbose_name_plural = 'Дополнительные работы'
        ordering = ['created_at']

    def __str__(self):
        return f"{self.number}: {self.title}"

    def save(self, *args, **kwargs):
        """Генерация номера DR-..."""
        if not self.number or self.number.strip() == '':
            try:
                existing_numbers = AdditionalWork.objects.filter(
                    number__startswith='DR-'
                ).exclude(number__exact='').exclude(number__isnull=True).values_list('number', flat=True)
                max_num = 0
                for num_str in existing_numbers:
                    try:
                        num_part = num_str.split('-')[1]
                        current_num = int(num_part)
                        if current_num > max_num:
                            max_num = current_num
                    except (ValueError, IndexError, AttributeError):
                        continue
                self.number = f"DR-{max_num + 1}"
            except Exception:
                self.number = f"DR-{AdditionalWork.objects.count() + 1}"
        super().save(*args, **kwargs)