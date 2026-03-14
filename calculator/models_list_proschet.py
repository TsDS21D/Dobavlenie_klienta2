# calculator/models_list_proschet.py
"""
Модели для калькулятора типографии.
Включает:
- Просчёт (Proschet)
- Печатный компонент (PrintComponent)
- Дополнительная работа (AdditionalWork)

ИЗМЕНЕНИЯ:
- В модель AdditionalWork добавлены методы _get_effective_price и recalculate_price
  для поддержки интерполяции по тиражу (формула 3).
- Метод save() теперь использует recalculate_price с правильными параметрами.
- to_dict() теперь включает effective_price, вычисленную по формуле.
"""

from django.db import models
from django.db.models import Sum
from django.core.validators import MinValueValidator
from decimal import Decimal
import math

# Импортируем модель Work из справочника дополнительных работ
from spravochnik_dopolnitelnyh_rabot.models import Work
# Импортируем функции интерполяции из утилит справочника
from spravochnik_dopolnitelnyh_rabot.utils import calculate_price_for_work, calculate_price_for_work_by_circulation


class Proschet(models.Model):
    """Просчёт (без изменений, приведён для полноты)"""
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
        """Генерация номера и прочее (без изменений)."""
        is_new = self.pk is None

        if is_new and self.circulation is None:
            self.circulation = 1

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
        """Общая стоимость просчёта = сумма стоимостей всех компонентов + сумма всех доп. работ всех компонентов."""
        components_total = Decimal('0.00')
        for component in self.print_components.all():
            components_total += component.total_circulation_price
            # Суммируем доп. работы этого компонента
            works_total = component.additional_works.aggregate(
                total=Sum('total_price')
            )['total'] or Decimal('0.00')
            components_total += works_total
        return components_total

    @property
    def formatted_total_price(self):
        return f"{self.total_price:.2f} ₽"

    @property
    def formatted_circulation(self):
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
                return True, f"Тираж успешно обновлен с {old_circulation} на {circulation_int}. Для пересчёта количества листов в компонентах используйте соответствующую функцию."
            else:
                return True, "Тираж успешно обновлен (значение не изменилось)"
        except ValueError:
            return False, "Тираж должен быть целым числом"
        except Exception as e:
            return False, f"Ошибка при обновлении тиража: {str(e)}"


class PrintComponent(models.Model):
    """Компонент печати (без изменений, приведён для полноты)"""
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
    total_circulation_price = models.DecimalField(
        verbose_name='Общая стоимость',
        max_digits=12,
        decimal_places=2,
        default=Decimal('0.00'),
        validators=[MinValueValidator(Decimal('0.00'))],
        help_text='Итоговая стоимость компонента = (цена печати + цена бумаги) × количество листов. Сохраняется автоматически.'
    )
    color_mode = models.CharField(
        verbose_name='Цветность',
        max_length=10,
        default='4+0',
        help_text='Формат цветности, например 4+0, 4+4 и т.п.'
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

    # ---------- Свойства для работы с тиражом просчёта ----------
    @property
    def formatted_circulation(self):
        if self.proschet:
            return self.proschet.formatted_circulation
        return "—"

    @property
    def circulation_display(self):
        return self.formatted_circulation

    # ---------- Метод для пересчёта цены ----------
    def recalculate_price(self):
        try:
            if self.printer and self.sheet_count:
                self.price_per_sheet = self.calculate_price_for_printer_and_copies(
                    self.printer,
                    self.sheet_count
                )
                self.is_price_calculated = True
                self.refresh_total_price()
                self.save(update_fields=['price_per_sheet', 'is_price_calculated', 'total_circulation_price'])
                return True, f"Цена успешно пересчитана: {self.price_per_sheet} руб./лист"
            else:
                return False, "Не указан принтер или количество листов"
        except Exception as e:
            return False, f"Ошибка при пересчёте цены: {str(e)}"

    def refresh_total_price(self):
        """
        Пересчитывает общую стоимость компонента на основе текущих данных
        и сохраняет её в поле total_circulation_price.
        Используется при изменении цены, бумаги или количества листов.
        """
        try:
            from vichisliniya_listov.models import VichisliniyaListovModel
            try:
                vich_data = VichisliniyaListovModel.objects.get(
                    vichisliniya_listov_print_component_id=self.id
                )
                sheet_count = vich_data.vichisliniya_listov_list_count
            except VichisliniyaListovModel.DoesNotExist:
                sheet_count = Decimal('0.00')

            price_per_sheet = self.price_per_sheet if self.price_per_sheet is not None else Decimal('0.00')
            material_price = self.material_price_per_unit
            total = (price_per_sheet + material_price) * sheet_count
            self.total_circulation_price = total
        except Exception as e:
            print(f"⚠️ Ошибка при пересчёте общей стоимости компонента {self.id}: {e}")
            self.total_circulation_price = Decimal('0.00')

    def save(self, *args, **kwargs):
        """Переопределённый метод сохранения с генерацией номера, расчётом цены и общей стоимости."""
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

        if self.sheet_count is None:
            self.sheet_count = Decimal('1.00')

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

        if self.pk:
            self.refresh_total_price()

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
        if self.paper:
            return self.paper.price
        return Decimal('0.00')

    @property
    def formatted_price_per_sheet(self):
        if self.price_per_sheet is not None:
            return f"{self.price_per_sheet:.2f} ₽"
        return "0.00 ₽"

    @property
    def formatted_total_circulation_price(self):
        return f"{self.total_circulation_price:.2f} ₽"

    @property
    def formatted_material_price(self):
        return f"{self.material_price_per_unit:.2f} ₽" if self.paper else "Не выбрано"

    @property
    def material_cost_for_circulation(self):
        try:
            from vichisliniya_listov.models import VichisliniyaListovModel
            try:
                vich_data = VichisliniyaListovModel.objects.get(
                    vichisliniya_listov_print_component_id=self.id
                )
                sheet_count = vich_data.vichisliniya_listov_list_count
            except VichisliniyaListovModel.DoesNotExist:
                sheet_count = Decimal('0.00')
            return self.material_price_per_unit * sheet_count
        except:
            return Decimal('0.00')

    @property
    def formatted_material_cost_for_circulation(self):
        return f"{self.material_cost_for_circulation:.2f} ₽"

    @property
    def printing_cost_for_circulation(self):
        try:
            from vichisliniya_listov.models import VichisliniyaListovModel
            try:
                vich_data = VichisliniyaListovModel.objects.get(
                    vichisliniya_listov_print_component_id=self.id
                )
                sheet_count = vich_data.vichisliniya_listov_list_count
            except VichisliniyaListovModel.DoesNotExist:
                sheet_count = Decimal('0.00')
            price_per_sheet = self.price_per_sheet if self.price_per_sheet is not None else Decimal('0.00')
            return price_per_sheet * sheet_count
        except:
            return Decimal('0.00')

    @property
    def formatted_printing_cost_for_circulation(self):
        return f"{self.printing_cost_for_circulation:.2f} ₽"


class AdditionalWork(models.Model):
    """
    Дополнительная работа, привязанная к конкретному печатному компоненту.
    ИЗМЕНЕНИЯ:
    - Добавлен метод _get_effective_price для получения цены за единицу с учётом формулы.
    - Добавлен метод recalculate_price(), который вычисляет общую стоимость работы
      на основе переданных параметров (количество листов, резов, тираж).
    - В методе save() вызывается recalculate_price() с актуальными данными из связанных моделей.
    - to_dict() теперь возвращает effective_price, вычисленную по формуле.
    """

    number = models.CharField(
        verbose_name='Номер работы',
        max_length=20,
        unique=True,
        blank=True,
        help_text='Автоматически генерируется в формате DR-1, DR-2 и т.д.'
    )
    print_component = models.ForeignKey(
        PrintComponent,
        verbose_name='Печатный компонент',
        on_delete=models.CASCADE,
        related_name='additional_works',
        help_text='Печатный компонент, к которому относится эта дополнительная работа'
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
        help_text='Базовая стоимость работы в рублях (из справочника или введённая вручную)'
    )
    quantity = models.PositiveIntegerField(
        verbose_name='Количество',
        default=1,
        help_text='Количество единиц данной работы (по умолчанию 1)'
    )
    total_price = models.DecimalField(
        verbose_name='Общая стоимость',
        max_digits=10,
        decimal_places=2,
        default=Decimal('0.00'),
        validators=[MinValueValidator(Decimal('0.00'))],
        help_text='Общая стоимость работы = результат применения формулы, где используется effective_price (интерполированная цена)'
    )
    created_at = models.DateTimeField(
        verbose_name='Дата создания',
        auto_now_add=True
    )
    is_deleted = models.BooleanField(
        verbose_name='Удален',
        default=False
    )
    work = models.ForeignKey(
        Work,
        verbose_name='Работа из справочника',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        help_text='Ссылка на запись в справочнике дополнительных работ (если работа была добавлена из справочника)'
    )

    # === ПОЛЯ ДЛЯ ФОРМУЛ ===
    formula_type = models.PositiveSmallIntegerField(
        choices=Work.FORMULA_CHOICES,  # Используем те же варианты, что и в справочнике
        default=1,
        verbose_name='Формула расчёта',
        help_text='Тип формулы, используемой для расчёта общей стоимости.'
    )

    lines_count = models.PositiveIntegerField(
        default=1,
        verbose_name='Количество линий реза',
        help_text='Количество линий реза (используется в формулах 3 и 4).'
    )

    items_per_sheet = models.PositiveIntegerField(
        default=1,
        verbose_name='Количество изделий на листе',
        help_text='Количество изделий на листе (используется в формулах 5 и 6).'
    )

    class Meta:
        verbose_name = 'Дополнительная работа'
        verbose_name_plural = 'Дополнительные работы'
        ordering = ['created_at']

    def __str__(self):
        return f"{self.number}: {self.title} (для компонента {self.print_component.number})"

    # ----- НОВЫЙ МЕТОД: вычисление эффективной цены за единицу с учётом типа формулы -----
    def _get_effective_price(self, sheet_count=None, circulation=None):
        """
        Возвращает цену за единицу работы с учётом количества листов или тиража.
        - Для формул 2 и 3 используется интерполяция по тиражу.
        - Для остальных формул (1,4,5,6) – по листам.
        Если работа не связана со справочником, возвращает self.price.
        """
        # Если нет связанной работы из справочника, возвращаем базовую цену
        if not self.work:
            return self.price

        # ===== ИЗМЕНЕНИЕ: теперь формула 2 тоже использует тираж =====
        if self.formula_type in [2, 3]:  # формулы, зависящие от тиража
            if circulation is None:
                # Если circulation не передан, пытаемся получить его из просчёта
                if self.print_component and self.print_component.proschet:
                    circulation = self.print_component.proschet.circulation
                else:
                    circulation = 0  # по умолчанию 0 (будет обработано в функции интерполяции)
            try:
                from spravochnik_dopolnitelnyh_rabot.utils import calculate_price_for_work_by_circulation
                effective_price = calculate_price_for_work_by_circulation(self.work, circulation)
                return effective_price
            except Exception as e:
                print(f"⚠️ Ошибка при вычислении effective_price по тиражу для работы {self.id}: {e}")
                return self.price
        else:
            # Остальные формулы используют количество листов
            if sheet_count is None:
                from vichisliniya_listov.models import VichisliniyaListovModel
                try:
                    vich_data = VichisliniyaListovModel.objects.get(
                        vichisliniya_listov_print_component=self.print_component
                    )
                    sheet_count = vich_data.vichisliniya_listov_list_count
                except VichisliniyaListovModel.DoesNotExist:
                    sheet_count = Decimal('0')
            try:
                from spravochnik_dopolnitelnyh_rabot.utils import calculate_price_for_work
                effective_price = calculate_price_for_work(self.work, sheet_count)
                return effective_price
            except Exception as e:
                print(f"⚠️ Ошибка при вычислении effective_price по листам для работы {self.id}: {e}")
                return self.price

    # ----- НОВЫЙ МЕТОД: пересчёт общей стоимости с переданными параметрами -----
    def recalculate_price(self, sheet_count, cuts_count, circulation):
        """
        Пересчитывает общую стоимость работы (total_price) на основе переданных параметров.
        Для формулы 3 использует effective_price, вычисленную по тиражу, для остальных – по листам.
        """
        qty = self.quantity if self.quantity else 1
        items = self.items_per_sheet if self.items_per_sheet else 1

        # Для формул, использующих линии реза, подставляем актуальное количество резов (cuts_count)
        if self.formula_type in [3, 4]:
            lines = cuts_count
        else:
            lines = self.lines_count if self.lines_count else 1

        # Получаем effective_price в зависимости от типа формулы
        if self.formula_type == 3:
            # Для формулы 3 используем тираж
            effective_price = self._get_effective_price(circulation=circulation)
        else:
            # Для остальных используем листы
            effective_price = self._get_effective_price(sheet_count=sheet_count)

        # Вычисление общей стоимости в зависимости от типа формулы
        if self.formula_type == 1:
            total = self.price * qty
        elif self.formula_type == 2:
            total = effective_price * circulation * qty
        elif self.formula_type == 3:
            # Формула 3: (effective_price * circulation) + (k_lines * log2(1+lines) * sheet_count)  * qty
            if self.work:
                k_lines = float(self.work.k_lines)
            else:
                k_lines = 2.0
            log_lines = math.log2(1 + lines) if lines > 0 else 0
            base_cost = (effective_price * circulation)/6
            surcharge = (Decimal(str(k_lines * log_lines)) * circulation)/4
            total = (base_cost + surcharge) * qty
        elif self.formula_type == 4:
            # Формула 4: (effective_price * sheet_count) + (k_lines * log2(1+lines) * sheet_count)  * qty
            if self.work:
                k_lines = float(self.work.k_lines)
            else:
                k_lines = 2.0
            log_lines = math.log2(1 + lines) if lines > 0 else 0
            base_cost = effective_price * sheet_count
            surcharge = Decimal(str(k_lines * log_lines)) * sheet_count
            total = (base_cost + surcharge) * qty
        elif self.formula_type == 5:
            total = effective_price * items * sheet_count * qty
        elif self.formula_type == 6:
            total = effective_price * items * circulation * qty
        else:
            total = self.price * qty

        self.total_price = total.quantize(Decimal('0.01'))

    def save(self, *args, **kwargs):
        """
        Переопределённый метод сохранения.
        - Генерирует номер работы, если он не задан.
        - Получает актуальное количество листов и резов из модели VichisliniyaListovModel.
        - Получает тираж из связанного просчёта.
        - Вызывает recalculate_price() для вычисления total_price.
        - Сохраняет объект в базу данных.
        """
        # ------------------------------------------------------------------
        # 1. Генерация номера работы в формате DR-...
        # ------------------------------------------------------------------
        if not self.number or self.number.strip() == '':
            try:
                # Находим все существующие номера, начинающиеся с "DR-"
                existing_numbers = AdditionalWork.objects.filter(
                    number__startswith='DR-'
                ).exclude(number__exact='').exclude(number__isnull=True).values_list('number', flat=True)

                max_num = 0
                for num_str in existing_numbers:
                    try:
                        # Извлекаем числовую часть после дефиса
                        num_part = num_str.split('-')[1]
                        current_num = int(num_part)
                        if current_num > max_num:
                            max_num = current_num
                    except (ValueError, IndexError, AttributeError):
                        continue  # пропускаем некорректные номера

                # Новый номер = максимальный + 1
                self.number = f"DR-{max_num + 1}"
            except Exception:
                # Если что-то пошло не так, просто присваиваем номер на основе общего количества записей
                self.number = f"DR-{AdditionalWork.objects.count() + 1}"

        # ------------------------------------------------------------------
        # 2. Получение данных из связанного печатного компонента и просчёта
        # ------------------------------------------------------------------
        if self.print_component_id:
            component = self.print_component          # объект печатного компонента
            proschet = component.proschet              # связанный просчёт

            # Получаем актуальное количество листов и резов из модели VichisliniyaListovModel
            from vichisliniya_listov.models import VichisliniyaListovModel
            try:
                vich_data = VichisliniyaListovModel.objects.get(
                    vichisliniya_listov_print_component=component
                )
                sheet_count = vich_data.vichisliniya_listov_list_count   # количество листов
                cuts_count = vich_data.vichisliniya_listov_cuts_count    # количество резов
            except VichisliniyaListovModel.DoesNotExist:
                # Если запись отсутствует – листов и резов нет (0)
                sheet_count = Decimal('0')
                cuts_count = 0

            # Тираж берём из просчёта
            circulation = proschet.circulation if proschet.circulation else 0
        else:
            # Без печатного компонента (такого не должно быть, но на всякий случай)
            sheet_count = Decimal('0')
            circulation = 0
            cuts_count = 0

        # ------------------------------------------------------------------
        # 3. Пересчёт общей стоимости с использованием полученных данных
        # ------------------------------------------------------------------
        self.recalculate_price(sheet_count, cuts_count, circulation)

        # ------------------------------------------------------------------
        # 4. Вызов родительского метода save() для фактического сохранения в БД
        # ------------------------------------------------------------------
        super().save(*args, **kwargs)

    def to_dict(self):
        """
        Преобразует объект в словарь для передачи в JSON (AJAX).
        Включает все необходимые поля для клиентской части.
        ДОБАВЛЕНО: поле effective_price и formatted_effective_price,
        которые вычисляются на основе текущего количества листов и тиража в зависимости от формулы.
        """
        # Получаем количество листов и тираж для вычисления effective_price
        from vichisliniya_listov.models import VichisliniyaListovModel
        try:
            vich_data = VichisliniyaListovModel.objects.get(
                vichisliniya_listov_print_component=self.print_component
            )
            sheet_count = vich_data.vichisliniya_listov_list_count
            cuts_count = vich_data.vichisliniya_listov_cuts_count
        except VichisliniyaListovModel.DoesNotExist:
            sheet_count = Decimal('0')
            cuts_count = 0

        circulation = self.print_component.proschet.circulation if self.print_component and self.print_component.proschet else 0

        # Вычисляем effective_price в зависимости от формулы
        if self.formula_type == 3:
            effective_price = self._get_effective_price(circulation=circulation)
        else:
            effective_price = self._get_effective_price(sheet_count=sheet_count)

        return {
            'id': self.id,
            'number': self.number,
            'title': self.title,
            'price': str(self.price),
            'formatted_price': f"{self.price} ₽",
            'effective_price': str(effective_price),
            'formatted_effective_price': f"{effective_price} ₽",
            'quantity': self.quantity,
            'total_price': str(self.total_price),
            'formatted_total_price': f"{self.total_price} ₽",
            'formula_type': self.formula_type,
            'formula_display': self.get_formula_type_display(),
            'lines_count': self.lines_count,
            'items_per_sheet': self.items_per_sheet,
            'work_id': self.work_id if self.work_id else None,
            'created_at': self.created_at.strftime('%d.%m.%Y %H:%M'),
        }