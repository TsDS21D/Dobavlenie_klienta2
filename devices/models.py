"""
models.py для приложения devices

Этот файл определяет структуру базы данных для двух типов устройств типографии:
1. Принтеры (Printer) — печатные машины.
2. Ламинаторы (Laminator) — оборудование для ламинирования.

Каждая модель описывает:
- Поля (название, формат листа, поля, коэффициент, метод интерполяции, даты).
- Валидацию (ограничения на значения).
- Методы для удобного отображения данных (get_..._display).
- Метод to_dict() для преобразования в JSON (используется в AJAX).
- Переопределённый save() для округления коэффициента.

Модели связаны внешним ключом с моделью SheetFormat из приложения sheet_formats.
"""

# Импортируем необходимые модули Django
from django.db import models  # Базовые классы для моделей
from django.core.validators import MinValueValidator, MaxValueValidator  # Валидаторы для чисел
from sheet_formats.models import SheetFormat  # Связанная модель форматов листов
from decimal import Decimal, ROUND_HALF_UP  # Для точных денежных расчётов
import math  # Для логарифмической интерполяции


class Printer(models.Model):
    """
    Модель "Принтер" — хранит информацию о печатных устройствах типографии.

    Каждый принтер:
    - имеет уникальное название
    - связан с форматом листа (SheetFormat)
    - имеет поля (незапечатываемые области) в мм
    - имеет коэффициент двусторонней печати (например, 2.0 означает, что двусторонняя печать в 2 раза дороже односторонней)
    - имеет выбранный метод интерполяции для расчёта цены при произвольном тираже
    - автоматически запоминает дату создания и последнего обновления
    """

    # ---------- Константы для выбора метода интерполяции ----------
    # Префикс devices_ добавлен, чтобы избежать конфликтов имён с другими приложениями.
    INTERPOLATION_LINEAR = 'linear'          # Линейная интерполяция
    INTERPOLATION_LOGARITHMIC = 'logarithmic' # Логарифмическая интерполяция
    INTERPOLATION_CHOICES = [
        (INTERPOLATION_LINEAR, 'Линейная интерполяция'),
        (INTERPOLATION_LOGARITHMIC, 'Логарифмическая интерполяция'),
    ]

    # ---------- Поля модели ----------

    # Название принтера (обязательное, уникальное, максимум 200 символов)
    name = models.CharField(
        max_length=200,                      # Максимальная длина строки
        verbose_name='Название принтера',    # Человеко-читаемое имя для админки и форм
        help_text='Введите уникальное название принтера',  # Подсказка для пользователя
        unique=True,                         # Запрещаем дубликаты названий
    )

    # Связь "многие к одному" с моделью SheetFormat
    # При удалении формата, если он используется хотя бы одним принтером, Django запретит удаление (PROTECT).
    # Это защищает от потери данных.
    sheet_format = models.ForeignKey(
        SheetFormat,
        on_delete=models.PROTECT,            # Защита от удаления используемого формата
        verbose_name='Формат листа',
        help_text='Выберите формат листа из списка созданных форматов',
        related_name='printers',             # Обратная связь: формат.printers.all()
    )

    # Поля (незапечатываемые области) листа в миллиметрах
    # Целое число, по умолчанию 5 мм, допустимый диапазон 0-50 мм.
    margin_mm = models.IntegerField(
        verbose_name='Поля (мм)',
        help_text='Размер незапечатываемых полей листа в миллиметрах',
        default=5,
        validators=[
            MinValueValidator(0),    # Минимум 0 мм
            MaxValueValidator(50),   # Максимум 50 мм
        ],
    )

    # Коэффициент двусторонней печати (вещественное число)
    # Например, 2.0 означает, что двусторонний лист стоит как два односторонних.
    duplex_coefficient = models.FloatField(
        verbose_name='Коэффициент двусторонней печати',
        help_text='Коэффициент увеличения при двусторонней печати',
        default=2.0,
        validators=[
            MinValueValidator(1.0),
            MaxValueValidator(10.0),
        ],
    )

    # Метод интерполяции (линейный или логарифмический)
    # Используется в функции calculate_price_for_arbitrary_copies для расчёта цены.
    devices_interpolation_method = models.CharField(
        max_length=20,
        choices=INTERPOLATION_CHOICES,
        default=INTERPOLATION_LINEAR,        # По умолчанию линейная интерполяция
        verbose_name='Метод интерполяции',
        help_text='Выберите метод интерполяции для расчёта стоимости при произвольном тираже',
    )

    # Дата и время создания записи (автоматически проставляется один раз при создании)
    created_at = models.DateTimeField(
        auto_now_add=True,   # Устанавливается автоматически при первом сохранении
        verbose_name='Дата создания',
    )

    # Дата и время последнего обновления (автоматически обновляется при каждом сохранении)
    updated_at = models.DateTimeField(
        auto_now=True,       # Обновляется при каждом вызове save()
        verbose_name='Дата обновления',
    )

    # ---------- Метаданные модели (внутренний класс Meta) ----------
    class Meta:
        # Сортировка по умолчанию: по полю name в алфавитном порядке (A→Z)
        ordering = ['name']

        # Человеко-читаемые имена в единственном и множественном числе (для админ-панели)
        verbose_name = 'Принтер'
        verbose_name_plural = 'Принтеры'

        # Индексы базы данных для ускорения поиска и фильтрации
        indexes = [
            models.Index(fields=['name']),                      # Быстрый поиск по названию
            models.Index(fields=['sheet_format']),              # Быстрая фильтрация по формату
            models.Index(fields=['created_at']),                # Сортировка по дате создания
            models.Index(fields=['devices_interpolation_method']), # Фильтрация по методу интерполяции
        ]

    # ---------- Методы модели ----------

    def __str__(self):
        """
        Строковое представление объекта (используется в админке, в выпадающих списках и т.д.).
        Возвращает, например: "RICOH Pro C7200S (A3+)"
        """
        return f"{self.name} ({self.sheet_format.name})"

    def get_dimensions_display(self):
        """
        Возвращает размеры формата в читаемом виде, делегируя вызов соответствующему методу связанного формата.
        Например: "320×450 мм"
        """
        return self.sheet_format.get_dimensions_display()

    def get_margin_display(self):
        """
        Возвращает строку с полями, например: "5 мм"
        """
        return f"{self.margin_mm} мм"

    def get_duplex_display(self):
        """
        Возвращает коэффициент двусторонней печати в удобном для отображения формате:
        - если коэффициент целый (например, 2.0), показываем "2"
        - иначе показываем с одним знаком после запятой (например, "2.5")
        """
        if self.duplex_coefficient.is_integer():
            return f"{int(self.duplex_coefficient)}"
        else:
            return f"{self.duplex_coefficient:.1f}"

    def get_duplex_coefficient_formatted(self):
        """
        Возвращает коэффициент с фиксированным форматом (всегда один знак после запятой).
        Это нужно для корректного отображения в HTML-поле input type="number".
        Без этого из-за проблем с плавающей точкой 2.0 могло отображаться как "1.999999999".
        """
        return f"{self.duplex_coefficient:.1f}"

    def get_interpolation_method_display_short(self):
        """
        Возвращает краткое название метода интерполяции для отображения в таблице.
        "Линейная" или "Логарифмическая" (без слова "интерполяция").
        """
        if self.devices_interpolation_method == self.INTERPOLATION_LINEAR:
            return "Линейная"
        else:
            return "Логарифмическая"

    def to_dict(self):
        """
        Преобразует объект принтера в словарь для передачи в JSON-ответы (AJAX).
        Используется в views.update_printer для отправки обновлённых данных клиенту.
        """
        # Безопасно получаем информацию о связанном формате (на случай, если формат удалён, но такого не должно быть из-за PROTECT)
        sheet_format_info = {
            'id': None,
            'name': 'Формат не указан',
            'dimensions': 'Не указаны'
        }
        if self.sheet_format:
            sheet_format_info = {
                'id': self.sheet_format.id,
                'name': self.sheet_format.name,
                'dimensions': self.sheet_format.get_dimensions_display()
            }

        # Формируем словарь со всеми необходимыми полями
        return {
            'id': self.id,
            'name': self.name,
            'sheet_format': sheet_format_info['name'],
            'sheet_format_id': sheet_format_info['id'],
            'sheet_format_dimensions': sheet_format_info['dimensions'],
            'margin_mm': self.margin_mm,
            'duplex_coefficient': float(self.duplex_coefficient),  # Преобразуем в float для JSON
            'duplex_coefficient_formatted': self.get_duplex_coefficient_formatted(),
            'devices_interpolation_method': self.devices_interpolation_method,
            'devices_interpolation_method_display': self.get_interpolation_method_display_short(),
            'margin_display': self.get_margin_display(),
            'duplex_display': self.get_duplex_display(),
            'created_at': self.created_at.strftime('%d.%m.%Y %H:%M') if self.created_at else '',
            'updated_at': self.updated_at.strftime('%d.%m.%Y %H:%M') if self.updated_at else '',
        }

    def calculate_price_for_arbitrary_copies_devices(self, copies):
        """
        Рассчитывает цену за лист для произвольного тиража, используя метод интерполяции,
        заданный в поле devices_interpolation_method.

        Аргументы:
            copies (int): произвольный тираж (количество копий)

        Возвращает:
            Decimal: цена за лист, округлённая до 2 знаков, либо None, если нет данных о ценах.

        Примечание: метод импортирует модель PrintPrice внутри функции, чтобы избежать циклических импортов.
        """
        from print_price.models import PrintPrice  # Импорт внутри метода, чтобы избежать круговой зависимости

        try:
            # Получаем все цены для этого принтера, отсортированные по тиражу
            price_points = PrintPrice.objects.filter(printer=self).order_by('copies')
            if not price_points:
                return None
            # Если только одна точка, возвращаем её цену
            if len(price_points) == 1:
                return price_points[0].price_per_sheet

            # Преобразуем QuerySet в список кортежей (copies, price)
            points = [(p.copies, p.price_per_sheet) for p in price_points]

            # Находим нижнюю и верхнюю точки для интерполяции
            lower = None
            upper = None
            for copies_point, price_point in points:
                if copies_point <= copies:
                    lower = (copies_point, price_point)
                else:
                    upper = (copies_point, price_point)
                    break

            # Если тираж меньше минимального — экстраполируем вниз, используя первые две точки
            if lower is None:
                lower = points[0]
                upper = points[1]
            # Если тираж больше максимального — экстраполируем вверх, используя последние две точки
            if upper is None:
                lower = points[-2]
                upper = points[-1]

            x1, y1 = lower
            x2, y2 = upper

            if x1 == x2:
                return y1

            # Выбираем метод интерполяции
            if self.devices_interpolation_method == self.INTERPOLATION_LINEAR:
                # Линейная интерполяция: y = y1 + (x - x1) * (y2 - y1) / (x2 - x1)
                result = y1 + Decimal(copies - x1) * (y2 - y1) / Decimal(x2 - x1)
            else:
                # Логарифмическая интерполяция: y = y1 + (ln(x) - ln(x1)) * (y2 - y1) / (ln(x2) - ln(x1))
                if x1 <= 0 or x2 <= 0 or copies <= 0:
                    return None
                ln_x1 = Decimal(math.log(x1))
                ln_x2 = Decimal(math.log(x2))
                ln_x = Decimal(math.log(copies))
                result = y1 + (ln_x - ln_x1) * (y2 - y1) / (ln_x2 - ln_x1)

            # Округление до 2 знаков после запятой (по правилам математического округления)
            return result.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

        except Exception:
            # При любой ошибке возвращаем None, чтобы вызвавший код мог обработать ситуацию
            return None

    def save(self, *args, **kwargs):
        """
        Переопределяем стандартный метод save() для дополнительной обработки перед сохранением.

        Что делаем:
        1. Округляем duplex_coefficient до одного знака после запятой.
           Это решает проблему с плавающей точкой (например, 2.0 может храниться как 1.9999999).
        2. Проверяем, что поля не отрицательные.
        3. Проверяем, что коэффициент не меньше 1.0.
        4. Вызываем оригинальный save() родительского класса.
        """
        # Округление коэффициента
        self.duplex_coefficient = round(self.duplex_coefficient, 1)

        # Дополнительная валидация (хотя валидаторы уже есть, но на всякий случай)
        if self.margin_mm < 0:
            raise ValueError("Поля не могут быть отрицательными")
        if self.duplex_coefficient < 1.0:
            raise ValueError("Коэффициент не может быть меньше 1.0")

        # Вызов оригинального метода save
        super().save(*args, **kwargs)


class Laminator(models.Model):
    """
    Модель "Ламинатор" — хранит информацию о ламинаторах типографии.

    Структура полностью аналогична модели Printer, но предназначена для другого типа оборудования.
    Все поля и методы повторяют Printer, за исключением:
    - Названия модели
    - related_name в ForeignKey (laminators)
    - Имени поля метода интерполяции (laminator_interpolation_method)
    - Констант выбора (LAMINATOR_INTERPOLATION_...)

    Это позволяет использовать одинаковую логику для разных типов устройств.
    """

    # Константы для метода интерполяции (префикс laminator_ для уникальности)
    LAMINATOR_INTERPOLATION_LINEAR = 'linear'
    LAMINATOR_INTERPOLATION_LOGARITHMIC = 'logarithmic'
    LAMINATOR_INTERPOLATION_CHOICES = [
        (LAMINATOR_INTERPOLATION_LINEAR, 'Линейная интерполяция'),
        (LAMINATOR_INTERPOLATION_LOGARITHMIC, 'Логарифмическая интерполяция'),
    ]

    # Название ламинатора (уникальное)
    name = models.CharField(
        max_length=200,
        verbose_name='Название ламинатора',
        help_text='Введите уникальное название ламинатора',
        unique=True,
    )

    # Связь с форматом листа (related_name='laminators', чтобы не конфликтовать с принтерами)
    sheet_format = models.ForeignKey(
        SheetFormat,
        on_delete=models.PROTECT,
        verbose_name='Формат листа',
        help_text='Выберите формат листа из списка созданных форматов',
        related_name='laminators',          # Обратная связь: формат.laminators.all()
    )

    # Поля (незапечатываемые области) в мм
    margin_mm = models.IntegerField(
        verbose_name='Поля (мм)',
        help_text='Размер незапечатываемых полей листа в миллиметрах',
        default=5,
        validators=[MinValueValidator(0), MaxValueValidator(50)],
    )

    # Коэффициент для двусторонней ламинации (аналог duplex_coefficient)
    duplex_coefficient = models.FloatField(
        verbose_name='Коэффициент',
        help_text='Коэффициент для двусторонней ламинации',
        default=2.0,
        validators=[MinValueValidator(1.0), MaxValueValidator(10.0)],
    )

    # Метод интерполяции для ламинатора (используется в будущих расчётах)
    laminator_interpolation_method = models.CharField(
        max_length=20,
        choices=LAMINATOR_INTERPOLATION_CHOICES,
        default=LAMINATOR_INTERPOLATION_LINEAR,
        verbose_name='Метод интерполяции',
        help_text='Выберите метод интерполяции для расчёта стоимости при произвольном тираже',
    )

    # Даты создания и обновления
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='Дата создания')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='Дата обновления')

    class Meta:
        ordering = ['name']
        verbose_name = 'Ламинатор'
        verbose_name_plural = 'Ламинаторы'
        indexes = [
            models.Index(fields=['name']),
            models.Index(fields=['sheet_format']),
            models.Index(fields=['created_at']),
            models.Index(fields=['laminator_interpolation_method']),
        ]

    def __str__(self):
        return f"{self.name} ({self.sheet_format.name})"

    def get_dimensions_display(self):
        return self.sheet_format.get_dimensions_display()

    def get_margin_display(self):
        return f"{self.margin_mm} мм"

    def get_duplex_display(self):
        if self.duplex_coefficient.is_integer():
            return f"{int(self.duplex_coefficient)}"
        return f"{self.duplex_coefficient:.1f}"

    def get_duplex_coefficient_formatted(self):
        return f"{self.duplex_coefficient:.1f}"

    def get_interpolation_method_display_short(self):
        return "Линейная" if self.laminator_interpolation_method == self.LAMINATOR_INTERPOLATION_LINEAR else "Логарифмическая"

    def to_dict(self):
        sheet_format_info = {
            'id': None,
            'name': 'Формат не указан',
            'dimensions': 'Не указаны'
        }
        if self.sheet_format:
            sheet_format_info = {
                'id': self.sheet_format.id,
                'name': self.sheet_format.name,
                'dimensions': self.sheet_format.get_dimensions_display()
            }
        return {
            'id': self.id,
            'name': self.name,
            'sheet_format': sheet_format_info['name'],
            'sheet_format_id': sheet_format_info['id'],
            'sheet_format_dimensions': sheet_format_info['dimensions'],
            'margin_mm': self.margin_mm,
            'duplex_coefficient': float(self.duplex_coefficient),
            'duplex_coefficient_formatted': self.get_duplex_coefficient_formatted(),
            'laminator_interpolation_method': self.laminator_interpolation_method,
            'laminator_interpolation_method_display': self.get_interpolation_method_display_short(),
            'margin_display': self.get_margin_display(),
            'duplex_display': self.get_duplex_display(),
            'created_at': self.created_at.strftime('%d.%m.%Y %H:%M') if self.created_at else '',
            'updated_at': self.updated_at.strftime('%d.%m.%Y %H:%M') if self.updated_at else '',
        }

    def save(self, *args, **kwargs):
        # Округляем коэффициент до одного знака после запятой
        self.duplex_coefficient = round(self.duplex_coefficient, 1)
        if self.margin_mm < 0:
            raise ValueError("Поля не могут быть отрицательными")
        if self.duplex_coefficient < 1.0:
            raise ValueError("Коэффициент не может быть меньше 1.0")
        super().save(*args, **kwargs)