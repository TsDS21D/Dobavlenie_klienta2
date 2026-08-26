# calculator/models_list_proschet.py
"""
Модели для калькулятора типографии (список просчётов, печатные компоненты, дополнительные работы).

Этот файл содержит три основные модели:
1. Proschet – просчёт (заказ) с номером, названием, тиражом, клиентом.
2. PrintComponent – печатный компонент, входящий в просчёт. Содержит принтер, бумагу,
   тип печати (цветная/чёрно-белая), режим печати (односторонняя/двусторонняя),
   цену за лист и общую стоимость.
3. AdditionalWork – дополнительная работа, привязанная к печатному компоненту.

ВЕРСИЯ: добавлена поддержка чёрно-белой печати через поле print_type.
Все расчёты цены за лист используют соответствующий тип печати для выборки опорных точек
из справочника print_price.

ИСПРАВЛЕНИЕ (20.04.2026):
- В методе get_sheet_count() добавлена проверка активного многостраничного режима.
  Если для компонента существует запись VichisliniyaMultipageModel и is_active=True,
  возвращается sheet_count из многостраничной модели. Иначе – из одностраничной.
- Это гарантирует, что все расчёты стоимости (печать, бумага) используют правильное
  количество листов для выбранного режима (одностраничный или многостраничный).

ПОДРОБНЫЕ КОММЕНТАРИИ К КАЖДОЙ СТРОЧКЕ для понимания новичками.
"""

# Импорт базовых классов Django для определения моделей
from django.db import models
# Импорт агрегатной функции Sum для суммирования значений в QuerySet
from django.db.models import Sum
# Импорт валидатора минимального значения (для положительных чисел)
from django.core.validators import MinValueValidator
# Импорт Decimal для точных финансовых расчётов (избегаем ошибок float)
from decimal import Decimal
# Импорт математических функций (для логарифмической интерполяции)
import math

# Импорт модели Work из справочника дополнительных работ (для связи дополнительной работы с шаблоном)
from spravochnik_dopolnitelnyh_rabot.models import Work
# Импорт утилит расчёта для дополнительных работ (интерполяция по листам и по тиражу)
from spravochnik_dopolnitelnyh_rabot.utils import calculate_price_for_work, calculate_price_for_work_by_circulation
# Импорт модели вычислений листов (чтобы получать количество листов для печатного компонента)
from vichisliniya_listov.models import VichisliniyaListovModel


# ============================================================================
# МОДЕЛЬ 1: ПРОСЧЁТ (PROSCHET)
# ============================================================================

class Proschet(models.Model):
    """
    Модель «Просчёт» – основной заказ (расчёт) в системе.
    Содержит общую информацию: номер, название, тираж, клиент, дата создания, флаг удаления.
    """

    # Номер просчёта (автоматически генерируется в формате PR-1, PR-2...)
    # CharField – строковое поле. unique=True – значение должно быть уникальным.
    # blank=True – поле может быть пустым при сохранении (заполнится автоматически).
    number = models.CharField(
        verbose_name='Номер просчёта',
        max_length=20,
        unique=True,
        blank=True,
        help_text='Автоматически генерируется в формате PR-1, PR-2 и т.д.'
    )

    # Название просчёта (вводит пользователь)
    title = models.CharField(
        verbose_name='Название просчёта',
        max_length=200,
        help_text='Краткое описание заказа'
    )

    # Тираж (количество экземпляров продукции). По умолчанию 1.
    # PositiveIntegerField – целое положительное число (>=0).
    circulation = models.PositiveIntegerField(
        verbose_name='Тираж',
        default=1,
        help_text='Количество экземпляров продукции (тираж). По умолчанию: 1'
    )

    # Связь с клиентом (модель Client из приложения baza_klientov).
    # ForeignKey – связь «многие к одному»: у одного просчёта может быть один клиент,
    # у одного клиента – много просчётов.
    # on_delete=models.SET_NULL – при удалении клиента поле становится NULL (не удаляем просчёт).
    # null=True, blank=True – клиент может быть не указан.
    client = models.ForeignKey(
        'baza_klientov.Client',
        verbose_name='Клиент',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        help_text='Клиент, для которого выполняется просчёт'
    )

    # Дата и время создания (автоматически устанавливается при создании записи).
    # auto_now_add=True – значение устанавливается один раз при создании и не меняется.
    created_at = models.DateTimeField(
        verbose_name='Дата создания',
        auto_now_add=True,
        help_text='Дата и время создания просчёта'
    )

    # Флаг мягкого удаления (помечает запись как удалённую, но не удаляет физически).
    # Это позволяет восстанавливать данные и хранить историю.
    is_deleted = models.BooleanField(
        verbose_name='Удален',
        default=False,
        help_text='Помечает просчёт как удаленный'
    )

    class Meta:
        """
        Внутренний класс Meta задаёт метаданные модели:
        - verbose_name – имя модели в единственном числе (для админки).
        - verbose_name_plural – имя во множественном числе.
        - ordering – сортировка по умолчанию (новые сверху).
        """
        verbose_name = 'Просчёт'
        verbose_name_plural = 'Просчёты'
        ordering = ['-created_at']          # знак минус означает сортировку по убыванию

    def __str__(self):
        """
        Строковое представление объекта, используется в админке, выпадающих списках и отладке.
        Возвращает: "PR-1: Название (Тираж: 100, Клиент: Иван)"
        """
        circulation_text = f"Тираж: {self.circulation}"
        if self.client:
            return f"{self.number}: {self.title} ({circulation_text}, Клиент: {self.client.name})"
        return f"{self.number}: {self.title} ({circulation_text})"

    def save(self, *args, **kwargs):
        """
        Переопределённый метод сохранения модели.
        Выполняется перед сохранением объекта в базу данных.
        """
        # Определяем, является ли объект новым (ещё не сохранённым)
        is_new = self.pk is None

        # Для новых просчётов: если тираж не указан (None), ставим значение по умолчанию 1
        if is_new and self.circulation is None:
            self.circulation = 1

        # Генерация номера просчёта в формате PR-<число>, если поле number пустое
        if not self.number or self.number.strip() == '':
            try:
                # Ищем все существующие номера, начинающиеся с "PR-"
                existing_numbers = Proschet.objects.filter(
                    number__startswith='PR-'
                ).exclude(number__exact='').exclude(number__isnull=True).values_list('number', flat=True)
                max_num = 0
                # Перебираем все номера, извлекаем числовую часть после дефиса
                for num_str in existing_numbers:
                    try:
                        num_part = num_str.split('-')[1]      # Берём часть после "PR-"
                        current_num = int(num_part)          # Преобразуем в число
                        if current_num > max_num:
                            max_num = current_num
                    except (ValueError, IndexError, AttributeError):
                        continue
                # Следующий номер = максимальный + 1
                self.number = f"PR-{max_num + 1}"
            except Exception:
                # Запасной вариант: номер на основе общего количества просчётов
                self.number = f"PR-{Proschet.objects.count() + 1}"

        # Вызываем оригинальный метод save для сохранения в базе
        super().save(*args, **kwargs)

    @property
    def formatted_created_at(self):
        """
        Свойство (property) – доступ как к атрибуту, без вызова метода.
        Возвращает дату создания в формате ДД.ММ.ГГГГ ЧЧ:ММ с учётом локального часового пояса.
        """
        if self.created_at:
            from django.utils import timezone
            local_time = timezone.localtime(self.created_at)   # Преобразуем в локальное время
            return local_time.strftime("%d.%m.%Y %H:%M")       # Форматируем строку
        return ""

    @property
    def total_price(self):
        """
        Общая стоимость просчёта (вычисляемое поле, не хранится в базе).
        Суммирует:
        - стоимость печати всех компонентов (уже включает стоимость бумаги)
        - стоимость всех дополнительных работ всех компонентов
        - стоимость ламинации (если включена) для всех компонентов
        """
        components_total = Decimal('0.00')
        # Перебираем все печатные компоненты, связанные с этим просчётом
        for component in self.print_components.all():
            # 1. Стоимость печати компонента (уже включает стоимость бумаги)
            components_total += component.total_circulation_price

            # 2. Суммируем дополнительные работы этого компонента
            works_total = component.additional_works.aggregate(
                total=Sum('total_price')
            )['total'] or Decimal('0.00')
            components_total += works_total

            # 3. Добавляем стоимость ламинации, если она есть и включена
            # hasattr проверяет, существует ли связанный объект lamination
            if hasattr(component, 'lamination') and component.lamination.is_enabled:
                components_total += component.lamination.total_price

        return components_total

    @property
    def formatted_total_price(self):
        """Форматированная общая стоимость с символом рубля."""
        return f"{self.total_price:.2f} ₽"

    @property
    def formatted_circulation(self):
        """Тираж с пробелами как разделителями тысяч (например, '1 000')."""
        # Используем format с запятой как разделитель, затем заменяем запятые на пробелы
        return f"{self.circulation:,}".replace(",", " ")

    def update_circulation(self, new_circulation):
        """
        Метод для безопасного обновления тиража с валидацией.
        Возвращает кортеж (успех: bool, сообщение: str).
        """
        try:
            circulation_int = int(new_circulation)
            if circulation_int <= 0:
                return False, "Тираж должен быть положительным числом"
            old_circulation = self.circulation
            self.circulation = circulation_int
            self.save()
            if old_circulation != circulation_int:
                return True, f"Тираж успешно обновлен с {old_circulation} на {circulation_int}."
            else:
                return True, "Тираж успешно обновлен (значение не изменилось)"
        except ValueError:
            return False, "Тираж должен быть целым числом"
        except Exception as e:
            return False, f"Ошибка при обновлении тиража: {str(e)}"


# ============================================================================
# МОДЕЛЬ 2: ПЕЧАТНЫЙ КОМПОНЕНТ (PRINTCOMPONENT)
# ============================================================================

class PrintComponent(models.Model):
    """
    Модель «Печатный компонент» – один блок печати внутри просчёта.
    Содержит принтер, бумагу, тип печати (цветная/ч/б), режим печати, цену за лист и итоговую стоимость.
    """

    # Варианты режима печати (односторонняя / двусторонняя)
    PRINT_MODE_CHOICES = [
        ('single', 'Односторонняя'),
        ('duplex', 'Двусторонняя'),
    ]

    # Тип печати (цветная / чёрно-белая)
    PRINT_TYPE_CHOICES = [
        ('color', 'Цветная'),
        ('bw', 'Ч/б'),
    ]

    # Номер компонента (автоматически генерируется в формате KP-1, KP-2...)
    number = models.CharField(
        verbose_name='Номер компонента',
        max_length=20,
        unique=True,
        blank=True,
        help_text='Автоматически генерируется в формате KP-1, KP-2 и т.д.'
    )

    # Связь с просчётом (каскадное удаление – при удалении просчёта удаляются и компоненты)
    # related_name='print_components' позволяет обращаться из просчёта: proschet.print_components.all()
    proschet = models.ForeignKey(
        Proschet,
        verbose_name='Просчёт',
        on_delete=models.CASCADE,
        related_name='print_components',
        help_text='Просчёт, к которому относится этот компонент'
    )

    # Выбранный принтер (из приложения devices)
    printer = models.ForeignKey(
        'devices.Printer',
        verbose_name='Принтер',
        on_delete=models.PROTECT,          # PROTECT – запрещает удаление принтера, если на него ссылаются
        related_name='print_components',
        null=True,
        blank=True,
        help_text='Выберите принтер из списка доступных устройств'
    )

    # Выбранная бумага (из приложения sklad, тип 'paper')
    paper = models.ForeignKey(
        'sklad.Material',
        verbose_name='Бумага',
        on_delete=models.SET_NULL,         # При удалении материала – оставляем NULL, не удаляем компонент
        null=True,
        blank=True,
        help_text='Выберите бумагу из списка материалов на складе.'
    )

    # Тип печати (цветная / чёрно-белая)
    print_type = models.CharField(
        verbose_name='Тип печати',
        max_length=10,
        choices=PRINT_TYPE_CHOICES,
        default='color',
        help_text='Цветная или чёрно-белая печать. Влияет на справочник цен.'
    )

    # Цена печати за один лист (рассчитывается интерполяцией на основе print_type)
    # null=True, blank=True – может быть временно не задана, но после расчёта заполняется.
    price_per_sheet = models.DecimalField(
        verbose_name='Цена печати за лист',
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal('0.00'))],
        help_text='Стоимость печати одного листа в рублях (рассчитывается автоматически на основе типа печати).'
    )

    # Дата создания (автоматически)
    created_at = models.DateTimeField(
        verbose_name='Дата создания',
        auto_now_add=True,
        help_text='Дата и время добавления компонента'
    )

    # Флаг мягкого удаления
    is_deleted = models.BooleanField(
        verbose_name='Удален',
        default=False,
        help_text='Помечает компонент как удаленный'
    )

    # Флаг, указывающий, была ли цена рассчитана автоматически (через интерполяцию)
    is_price_calculated = models.BooleanField(
        verbose_name='Цена рассчитана автоматически',
        default=False,
        help_text='Указывает, что цена за лист была рассчитана автоматически на основе справочника цен'
    )

    # Итоговая стоимость компонента для всего тиража.
    # Сохраняется автоматически при вызове refresh_total_price().
    total_circulation_price = models.DecimalField(
        verbose_name='Общая стоимость',
        max_digits=12,
        decimal_places=2,
        default=Decimal('0.00'),
        validators=[MinValueValidator(Decimal('0.00'))],
        help_text='Итоговая стоимость компонента = (цена печати за прогон * количество прогонов) + (цена бумаги * количество листов). Сохраняется автоматически.'
    )

    # Цветность (поле пока не используется в расчётах, но может пригодиться)
    color_mode = models.CharField(
        verbose_name='Цветность',
        max_length=10,
        default='4+0',
        help_text='Формат цветности, например 4+0, 4+4 и т.п.'
    )

    # Режим печати (односторонняя или двусторонняя)
    printing_mode = models.CharField(
        verbose_name='Режим печати',
        max_length=10,
        choices=PRINT_MODE_CHOICES,
        default='single',
        help_text='Односторонняя или двусторонняя печать. Влияет на количество прогонов принтера.'
    )

    class Meta:
        verbose_name = 'Компонент печати'
        verbose_name_plural = 'Компоненты печати'
        ordering = ['created_at']          # Сортировка по дате создания (старые сверху)

    def __str__(self):
        """Строковое представление компонента для админки и отладки."""
        paper_name = self.paper.name if self.paper else 'Бумага не выбрана'
        printer_name = self.printer.name if self.printer else 'Без принтера'
        sheet_count = self.get_sheet_count()
        sheet_count_text = f"Листов: {sheet_count:.2f}" if sheet_count > 0 else "Листов не указано"
        mode_text = "Двуст." if self.printing_mode == 'duplex' else "Одност."
        type_text = "Цв." if self.print_type == 'color' else "Ч/б"
        return f"{self.number}: {printer_name} - {paper_name} ({type_text}, {sheet_count_text}, {mode_text})"

    # ========== МЕТОД ДЛЯ ПОЛУЧЕНИЯ КОЛИЧЕСТВА ЛИСТОВ (ИСПРАВЛЕН) ==========
    def get_sheet_count(self):
        """
        Возвращает количество листов из связанной записи вычислений.
        ВАЖНО: учитывает активный многостраничный режим.
        Если для компонента существует запись VichisliniyaMultipageModel и is_active=True,
        возвращается sheet_count из многостраничной модели.
        Иначе возвращается list_count из одностраничной модели VichisliniyaListovModel.
        Если ни одной записи нет – возвращает 0.
        """
        # Импортируем многостраничную модель внутри метода, чтобы избежать циклического импорта
        from vichisliniya_listov.multipage_models import VichisliniyaMultipageModel

        # 1. Пытаемся получить многостраничную запись
        try:
            multipage = VichisliniyaMultipageModel.objects.get(print_component=self)
            # Если многостраничный режим активен – используем sheet_count из неё
            if multipage.is_active:
                return multipage.sheet_count
        except VichisliniyaMultipageModel.DoesNotExist:
            pass  # Нет многостраничной записи – продолжаем с одностраничной

        # 2. Пытаемся получить одностраничную запись
        try:
            # related_name='vichisliniya_listov_data' (установлен в models.py vichisliniya_listov)
            vich_data = self.vichisliniya_listov_data
            return vich_data.vichisliniya_listov_list_count
        except VichisliniyaListovModel.DoesNotExist:
            # Если запись отсутствует, возвращаем 0
            return Decimal('0.00')
        except AttributeError:
            # Если related_name не совпадает или объект не сохранён
            return Decimal('0.00')

    # ========== СВОЙСТВО ДЛЯ ФОРМАТИРОВАННОГО ТИРАЖА ==========
    @property
    def formatted_circulation(self):
        """Форматированный тираж из связанного просчёта."""
        if self.proschet:
            return self.proschet.formatted_circulation
        return "—"

    @property
    def circulation_display(self):
        """Алиас для formatted_circulation (используется в админке)."""
        return self.formatted_circulation

    # ========== КОЛИЧЕСТВО ПРОГОНОВ ПРИНТЕРА (с учётом коэффициента двусторонности) ==========
    @property
    def runs_count(self):
        """
        Количество прогонов принтера для данного компонента.
        - При односторонней печати (single): прогонов = количество листов.
        - При двусторонней (duplex): прогонов = количество листов * duplex_coefficient принтера (или 2 по умолчанию).
        """
        sheet_count = self.get_sheet_count()
        if sheet_count <= 0:
            return 0
        sheets = int(sheet_count)
        if self.printing_mode == 'duplex':
            # Используем коэффициент двусторонности из принтера, если он задан, иначе 2.0
            if self.printer and hasattr(self.printer, 'duplex_coefficient') and self.printer.duplex_coefficient:
                coefficient = float(self.printer.duplex_coefficient)
            else:
                coefficient = 2.0
            return int(round(sheets * coefficient))
        else:
            return sheets

    # ========== МЕТОД ПЕРЕСЧЁТА ЦЕНЫ ЗА ЛИСТ ==========
    def recalculate_price(self):
        """
        Пересчитывает цену за лист на основе текущего принтера, типа печати и количества листов.
        Возвращает кортеж (успех: bool, сообщение: str).
        """
        try:
            if self.printer:
                sheet_count = self.get_sheet_count()
                if sheet_count > 0:
                    # Передаём print_type в статический метод
                    self.price_per_sheet = self.calculate_price_for_printer_and_copies(
                        self.printer,
                        sheet_count,
                        self.print_type
                    )
                    self.is_price_calculated = True
                    self.refresh_total_price()
                    self.save(update_fields=['price_per_sheet', 'is_price_calculated', 'total_circulation_price'])
                    return True, f"Цена успешно пересчитана: {self.price_per_sheet} руб./лист"
                else:
                    return False, "Количество листов равно 0, расчёт невозможен"
            else:
                return False, "Не указан принтер"
        except Exception as e:
            return False, f"Ошибка при пересчёте цены: {str(e)}"

    # ========== ПЕРЕСЧЁТ ОБЩЕЙ СТОИМОСТИ КОМПОНЕНТА ==========
    def refresh_total_price(self):
        """
        Пересчитывает общую стоимость компонента (total_circulation_price) и сохраняет её.
        Формула: total = (price_per_sheet * runs_count) + (material_price_per_unit * sheet_count)
        """
        try:
            sheet_count = self.get_sheet_count()
            price_per_sheet = self.price_per_sheet if self.price_per_sheet is not None else Decimal('0.00')
            material_price = self.material_price_per_unit
            runs = self.runs_count
            printing_cost = price_per_sheet * runs
            material_cost = material_price * sheet_count
            total = printing_cost + material_cost
            self.total_circulation_price = total.quantize(Decimal('0.01'))
        except Exception as e:
            print(f"⚠️ Ошибка при пересчёте общей стоимости компонента {self.id}: {e}")
            self.total_circulation_price = Decimal('0.00')

    # ========== ПЕРЕОПРЕДЕЛЁННЫЙ МЕТОД СОХРАНЕНИЯ ==========
    def save(self, *args, **kwargs):
        """
        Переопределённый метод сохранения.
        1. Генерирует номер компонента (KP-...).
        2. При необходимости пересчитывает цену за лист (если изменился принтер или тип печати).
        3. Пересчитывает общую стоимость.
        """
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

        # Определяем, нужно ли пересчитать цену за лист
        # Условия: если изменился принтер или тип печати, или это новый объект
        should_calculate_price = False
        if self.printer:
            if not self.pk:  # новый объект
                should_calculate_price = True
            else:
                try:
                    old_component = PrintComponent.objects.get(pk=self.pk)
                    if old_component.printer != self.printer or old_component.print_type != self.print_type:
                        should_calculate_price = True
                except PrintComponent.DoesNotExist:
                    should_calculate_price = True

        # Выполняем пересчёт цены, если нужно
        if should_calculate_price:
            try:
                sheet_count = self.get_sheet_count()
                if sheet_count > 0:
                    calculated_price = self.calculate_price_for_printer_and_copies(
                        self.printer,
                        sheet_count,
                        self.print_type
                    )
                    self.price_per_sheet = calculated_price
                    self.is_price_calculated = True
                else:
                    self.price_per_sheet = Decimal('0.00')
                    self.is_price_calculated = False
            except Exception as e:
                print(f"⚠️ Ошибка при автоматическом расчете цены: {str(e)}")
                if self.price_per_sheet is None:
                    self.price_per_sheet = Decimal('0.00')
                self.is_price_calculated = False
        else:
            # Если пересчёт не требуется, убеждаемся, что цена не None
            if self.price_per_sheet is None:
                self.price_per_sheet = Decimal('0.00')
            self.is_price_calculated = False

        # Если объект уже существует (не новый), пересчитываем общую стоимость
        if self.pk:
            self.refresh_total_price()

        # Сохраняем объект в базе данных
        super().save(*args, **kwargs)

    # ========== СТАТИЧЕСКИЙ МЕТОД ДЛЯ РАСЧЁТА ЦЕНЫ (ИНТЕРПОЛЯЦИЯ) ==========
    @staticmethod
    def calculate_price_for_printer_and_copies(printer, sheet_count, print_type='color'):
        """
        Расчёт цены за лист методом интерполяции на основе справочника PrintPrice.
        Поддерживает линейную и логарифмическую интерполяцию.
        Теперь учитывает тип печати (print_type) для выборки опорных точек.
        """
        try:
            from print_price.models import PrintPrice
            # Фильтруем цены по принтеру и типу печати (цветная/ч/б)
            price_points = PrintPrice.objects.filter(
                printer=printer,
                print_type=print_type
            ).order_by('copies')
            if not price_points.exists():
                return Decimal('0.00')

            # Количество листов – целое число (для интерполяции)
            sheet_count_int = int(sheet_count)
            # Метод интерполяции, заданный для принтера (linear или logarithmic)
            interpolation_method = getattr(printer, 'devices_interpolation_method', 'linear')

            # Первая и последняя опорные точки
            min_price = price_points.first()
            max_price = price_points.last()

            # Если тираж меньше минимального – берём минимальную цену
            if sheet_count_int <= min_price.copies:
                return min_price.price_per_sheet
            # Если тираж больше максимального – берём максимальную цену
            if sheet_count_int >= max_price.copies:
                return max_price.price_per_sheet

            # Находим ближайшие опорные точки снизу и сверху
            prev_price = None
            next_price = None
            for price in price_points:
                if price.copies <= sheet_count_int:
                    prev_price = price
                if price.copies >= sheet_count_int:
                    next_price = price
                    break

            # Если обе точки найдены и они разные – выполняем интерполяцию
            if prev_price and next_price and prev_price != next_price:
                if interpolation_method == 'linear':
                    # Линейная интерполяция
                    x1, y1 = float(prev_price.copies), float(prev_price.price_per_sheet)
                    x2, y2 = float(next_price.copies), float(next_price.price_per_sheet)
                    x = float(sheet_count_int)
                    result = y1 + (y2 - y1) * (x - x1) / (x2 - x1)
                    return Decimal(str(round(result, 2)))
                elif interpolation_method == 'logarithmic':
                    # Логарифмическая интерполяция (для цен, падающих с ростом тиража)
                    epsilon = 1e-10   # маленькое число для избежания log(0)
                    x1 = math.log(float(prev_price.copies) + epsilon)
                    y1 = math.log(float(prev_price.price_per_sheet) + epsilon)
                    x2 = math.log(float(next_price.copies) + epsilon)
                    y2 = math.log(float(next_price.price_per_sheet) + epsilon)
                    x = math.log(float(sheet_count_int) + epsilon)
                    result_log = y1 + (y2 - y1) * (x - x1) / (x2 - x1)
                    result = math.exp(result_log) - epsilon
                    return Decimal(str(round(result, 2)))
                else:
                    # По умолчанию – линейная
                    x1, y1 = float(prev_price.copies), float(prev_price.price_per_sheet)
                    x2, y2 = float(next_price.copies), float(next_price.price_per_sheet)
                    x = float(sheet_count_int)
                    result = y1 + (y2 - y1) * (x - x1) / (x2 - x1)
                    return Decimal(str(round(result, 2)))
            else:
                # Если не нашли две разные точки – возвращаем цену из нижней точки
                return prev_price.price_per_sheet if prev_price else min_price.price_per_sheet
        except Exception as e:
            print(f"⚠️ Ошибка в calculate_price_for_printer_and_copies: {str(e)}")
            return Decimal('0.00')

    # ========== СВОЙСТВО ДЛЯ ЦЕНЫ МАТЕРИАЛА (БУМАГИ) ==========
    @property
    def material_price_per_unit(self):
        """
        Возвращает цену бумаги за единицу (лист).
        Использует метод get_price() модели Material, который возвращает розничную цену
        с учётом наценки. Если бумага не выбрана – возвращает 0.
        """
        if self.paper:
            return self.paper.get_price()
        return Decimal('0.00')

    # ========== ФОРМАТИРОВАННЫЕ СВОЙСТВА ДЛЯ ОТОБРАЖЕНИЯ ==========
    @property
    def formatted_price_per_sheet(self):
        """Цена за лист с символом рубля."""
        if self.price_per_sheet is not None:
            return f"{self.price_per_sheet:.2f} ₽"
        return "0.00 ₽"

    @property
    def formatted_total_circulation_price(self):
        """Общая стоимость компонента с символом рубля."""
        return f"{self.total_circulation_price:.2f} ₽"

    @property
    def formatted_material_price(self):
        """Цена бумаги за лист с символом рубля."""
        return f"{self.material_price_per_unit:.2f} ₽" if self.paper else "Не выбрано"

    @property
    def material_cost_for_circulation(self):
        """Стоимость бумаги для всего тиража (количество листов × цена бумаги)."""
        sheet_count = self.get_sheet_count()
        return self.material_price_per_unit * sheet_count

    @property
    def formatted_material_cost_for_circulation(self):
        """Форматированная стоимость бумаги для тиража."""
        return f"{self.material_cost_for_circulation:.2f} ₽"

    @property
    def printing_cost_for_circulation(self):
        """Стоимость печати для всего тиража (без учёта бумаги)."""
        sheet_count = self.get_sheet_count()
        price_per_sheet = self.price_per_sheet if self.price_per_sheet is not None else Decimal('0.00')
        runs = self.runs_count
        return price_per_sheet * runs

    @property
    def formatted_printing_cost_for_circulation(self):
        """Форматированная стоимость печати для тиража."""
        return f"{self.printing_cost_for_circulation:.2f} ₽"

    @property
    def printing_mode_display_name(self):
        """Человекочитаемое название режима печати (односторонняя/двусторонняя)."""
        return dict(self.PRINT_MODE_CHOICES).get(self.printing_mode, self.printing_mode)

    @property
    def print_type_display_name(self):
        """Человекочитаемое название типа печати (цветная/ч/б)."""
        return dict(self.PRINT_TYPE_CHOICES).get(self.print_type, self.print_type)


# ============================================================================
# МОДЕЛЬ 3: ДОПОЛНИТЕЛЬНАЯ РАБОТА (ADDITIONALWORK)
# ============================================================================
# Эта модель не требует изменений для поддержки ч/б печати, так как она не зависит от типа.
# Оставляем её без изменений, но с подробными комментариями.

class AdditionalWork(models.Model):
    """
    Дополнительная работа, привязанная к печатному компоненту.
    Содержит название, себестоимость, наценку, цену, количество, тип формулы.
    """
    # Автоматически генерируемый номер работы (DR-1, DR-2...)
    number = models.CharField(
        verbose_name='Номер работы',
        max_length=20,
        unique=True,
        blank=True,
        help_text='Автоматически генерируется в формате DR-1, DR-2 и т.д.'
    )
    # Связь с печатным компонентом (каскадное удаление)
    print_component = models.ForeignKey(
        PrintComponent,
        verbose_name='Печатный компонент',
        on_delete=models.CASCADE,
        related_name='additional_works',
        help_text='Печатный компонент, к которому относится эта дополнительная работа'
    )
    # Название работы (копируется из справочника или вводится вручную)
    title = models.CharField(
        verbose_name='Название работы',
        max_length=200,
        help_text='Название дополнительной работы'
    )
    # Себестоимость единицы работы (без наценки)
    cost = models.DecimalField(
        verbose_name='Себестоимость (руб)',
        max_digits=10,
        decimal_places=2,
        default=0.00,
        help_text='Себестоимость работы (без наценки)'
    )
    # Наценка в процентах
    markup_percent = models.DecimalField(
        verbose_name='Наценка (%)',
        max_digits=5,
        decimal_places=2,
        default=0.00,
        help_text='Процент наценки от себестоимости'
    )
    # Базовая цена (с учётом наценки, но до применения формул)
    price = models.DecimalField(
        verbose_name='Цена',
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0.00'))],
        help_text='Базовая стоимость работы в рублях (из справочника или введённая вручную)'
    )
    # Количество единиц работы
    quantity = models.PositiveIntegerField(
        verbose_name='Количество',
        default=1,
        help_text='Количество единиц данной работы (по умолчанию 1)'
    )
    # Общая стоимость работы (пересчитывается при сохранении)
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
    # Ссылка на запись в справочнике (если работа была добавлена из справочника)
    work = models.ForeignKey(
        Work,
        verbose_name='Работа из справочника',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        help_text='Ссылка на запись в справочнике дополнительных работ (если работа была добавлена из справочника)'
    )
    # Тип формулы расчёта (1–6)
    formula_type = models.PositiveSmallIntegerField(
        choices=Work.FORMULA_CHOICES,
        default=1,
        verbose_name='Формула расчёта',
        help_text='Тип формулы, используемой для расчёта общей стоимости.'
    )
    # Количество линий реза (используется в формулах 3 и 4)
    lines_count = models.PositiveIntegerField(
        default=1,
        verbose_name='Количество линий реза',
        help_text='Количество линий реза (используется в формулах 3 и 4).'
    )
    # Количество изделий на листе (используется в формулах 5 и 6)
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

    # ----- ВСПОМОГАТЕЛЬНЫЙ МЕТОД: вычисление эффективной цены за единицу с учётом интерполяции -----
    def _get_effective_price(self, sheet_count=None, circulation=None):
        """
        Возвращает цену за единицу работы с учётом интерполяции по количеству листов или тиражу.
        Если работа не связана со справочником, возвращает self.price.
        """
        if not self.work:
            return self.price
        # Для формул 2 и 3 интерполяция по тиражу, иначе – по листам
        if self.formula_type in [2, 3]:
            if circulation is None:
                if self.print_component and self.print_component.proschet:
                    circulation = self.print_component.proschet.circulation
                else:
                    circulation = 0
            try:
                cost = calculate_price_for_work_by_circulation(self.work, circulation)
            except Exception as e:
                print(f"⚠️ Ошибка при вычислении себестоимости по тиражу для работы {self.id}: {e}")
                cost = Decimal('0')
        else:
            if sheet_count is None:
                try:
                    vich_data = VichisliniyaListovModel.objects.get(
                        vichisliniya_listov_print_component=self.print_component
                    )
                    sheet_count = vich_data.vichisliniya_listov_list_count
                except VichisliniyaListovModel.DoesNotExist:
                    sheet_count = Decimal('0')
            try:
                cost = calculate_price_for_work(self.work, sheet_count)
            except Exception as e:
                print(f"⚠️ Ошибка при вычислении себестоимости по листам для работы {self.id}: {e}")
                cost = Decimal('0')
        # Применяем наценку
        if self.markup_percent is not None and self.markup_percent > 0:
            effective_price = cost + (cost * self.markup_percent / Decimal('100'))
        else:
            effective_price = cost
        return effective_price

    # ----- МЕТОД ПЕРЕСЧЁТА ОБЩЕЙ СТОИМОСТИ -----
    def recalculate_price(self, sheet_count, cuts_count, circulation):
        """
        Пересчитывает общую стоимость работы (total_price) на основе переданных параметров.
        Вызывается из save() или из представлений.
        """
        qty = self.quantity if self.quantity else 1
        items = self.items_per_sheet if self.items_per_sheet else 1
        # Для формул, использующих линии реза, подставляем актуальное количество резов
        if self.formula_type in [3, 4]:
            lines = cuts_count
        else:
            lines = self.lines_count if self.lines_count else 1
        # Получаем effective_price в зависимости от типа формулы
        if self.formula_type == 3:
            effective_price = self._get_effective_price(circulation=circulation)
        else:
            effective_price = self._get_effective_price(sheet_count=sheet_count)
        # Вычисление общей стоимости в зависимости от типа формулы
        if self.formula_type == 1:
            total = self.price * qty
        elif self.formula_type == 2:
            total = effective_price * circulation * qty
        elif self.formula_type == 3:
            if self.work:
                k_lines = float(self.work.k_lines)
            else:
                k_lines = 2.0
            log_lines = math.log2(1 + lines) if lines > 0 else 0
            base_cost = (effective_price * circulation) / 6
            surcharge = (Decimal(str(k_lines * log_lines)) * circulation) / 4
            total = (base_cost + surcharge) * qty
        elif self.formula_type == 4:
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

    # ----- ПЕРЕОПРЕДЕЛЁННЫЙ МЕТОД СОХРАНЕНИЯ -----
    def save(self, *args, **kwargs):
        # 1. Генерация номера DR-...
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
        # 2. Синхронизация с Work (если работа из справочника)
        if self.work_id:
            source_work = self.work
            if self.title != source_work.name:
                self.title = source_work.name
            if self.cost != source_work.cost:
                self.cost = source_work.cost
            if self.markup_percent != source_work.markup_percent:
                self.markup_percent = source_work.markup_percent
            if self.price != source_work.price:
                self.price = source_work.price
            if self.formula_type != source_work.formula_type:
                self.formula_type = source_work.formula_type
            if self.lines_count != source_work.default_lines_count:
                self.lines_count = source_work.default_lines_count
            if self.items_per_sheet != source_work.default_items_per_sheet:
                self.items_per_sheet = source_work.default_items_per_sheet
        # 3. Получение данных из связанного печатного компонента и просчёта
        if self.print_component_id:
            component = self.print_component
            proschet = component.proschet
            try:
                vich_data = VichisliniyaListovModel.objects.get(
                    vichisliniya_listov_print_component=component
                )
                sheet_count = vich_data.vichisliniya_listov_list_count
                cuts_count = vich_data.vichisliniya_listov_cuts_count
            except VichisliniyaListovModel.DoesNotExist:
                sheet_count = Decimal('0')
                cuts_count = 0
            circulation = proschet.circulation if proschet.circulation else 0
        else:
            sheet_count = Decimal('0')
            circulation = 0
            cuts_count = 0
        # 4. Пересчёт общей стоимости
        self.recalculate_price(sheet_count, cuts_count, circulation)
        # 5. Сохранение в БД
        super().save(*args, **kwargs)

    # ----- ПРЕОБРАЗОВАНИЕ ОБЪЕКТА В СЛОВАРЬ ДЛЯ JSON -----
    def to_dict(self):
        """
        Преобразует объект в словарь для передачи в JSON (AJAX).
        Включает все необходимые поля для клиентской части.
        """
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
        qty = self.quantity if self.quantity else 1
        items = self.items_per_sheet if self.items_per_sheet else 1
        # Вычисление себестоимости и эффективной цены в зависимости от формулы
        if self.formula_type == 1:
            cost = self.cost
            effective_price = self.price
            total_cost = cost * qty
            total_price = self.price * qty
        else:
            if self.formula_type in [2, 3]:
                try:
                    cost = calculate_price_for_work_by_circulation(self.work, circulation)
                except Exception:
                    cost = self.cost
            else:
                try:
                    cost = calculate_price_for_work(self.work, sheet_count)
                except Exception:
                    cost = self.cost
            effective_price = self._get_effective_price(sheet_count=sheet_count, circulation=circulation)
            if self.formula_type == 2:
                total_cost = cost * circulation * qty
            elif self.formula_type == 3:
                if self.work:
                    k_lines = float(self.work.k_lines)
                else:
                    k_lines = 2.0
                log_lines = math.log2(1 + cuts_count) if cuts_count > 0 else 0
                base_cost = (cost * circulation) / 6
                surcharge = (Decimal(str(k_lines * log_lines)) * circulation) / 4
                total_cost = (base_cost + surcharge) * qty
            elif self.formula_type == 4:
                if self.work:
                    k_lines = float(self.work.k_lines)
                else:
                    k_lines = 2.0
                log_lines = math.log2(1 + cuts_count) if cuts_count > 0 else 0
                base_cost = cost * sheet_count
                surcharge = Decimal(str(k_lines * log_lines)) * sheet_count
                total_cost = (base_cost + surcharge) * qty
            elif self.formula_type == 5:
                total_cost = cost * items * sheet_count * qty
            elif self.formula_type == 6:
                total_cost = cost * items * circulation * qty
            else:
                total_cost = cost * qty
            total_cost = total_cost.quantize(Decimal('0.01'))
            total_price = self.total_price
        profit_per_unit = effective_price - cost
        return {
            'id': self.id,
            'number': self.number,
            'title': self.title,
            'cost': str(cost),
            'formatted_cost': f"{cost:.2f} ₽",
            'total_cost': str(total_cost),
            'formatted_total_cost': f"{total_cost:.2f} ₽",
            'markup_percent': str(self.markup_percent),
            'formatted_markup_percent': f"{self.markup_percent}%",
            'price': str(self.price),
            'formatted_price': f"{self.price:.2f} ₽",
            'profit_per_unit': str(profit_per_unit),
            'formatted_profit_per_unit': f"{profit_per_unit:.2f} ₽",
            'effective_price': str(effective_price),
            'formatted_effective_price': f"{effective_price:.2f} ₽",
            'quantity': self.quantity,
            'total_price': str(total_price),
            'formatted_total_price': f"{total_price:.2f} ₽",
            'formula_type': self.formula_type,
            'formula_display': self.get_formula_type_display(),
            'lines_count': self.lines_count,
            'items_per_sheet': self.items_per_sheet,
            'work_id': self.work_id if self.work_id else None,
            'created_at': self.created_at.strftime('%d.%m.%Y %H:%M'),
        }