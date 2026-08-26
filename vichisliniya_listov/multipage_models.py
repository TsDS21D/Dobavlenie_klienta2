"""
Файл multipage_models.py для приложения vichisliniya_listov.
Содержит модели для поддержки многостраничных изделий (брошюр, книг).

ОСНОВНЫЕ МОДЕЛИ:
- MultipageBinding: справочник способов скрепления (скрепка, пружина, КБС).
- VichisliniyaMultipageModel: основная модель для хранения параметров
  многостраничного расчёта и результатов размещения страниц на листе.

ИСПРАВЛЕНИЯ (для поддержки сохранения активного режима):
- Добавлено поле is_active (булево), указывающее, выбран ли многостраничный режим
  для данного печатного компонента. Если False – используется одностраничный режим.

ИСПРАВЛЕНИЕ ДЛЯ УЧЁТА РЕЖИМА ПЕЧАТИ И КРАТНОСТИ СТРАНИЦ (2026-08-12):
- Метод calculate_sheet_count() теперь:
  1. Округляет total_pages вверх до кратного page_multiple (из способа скрепления).
  2. Для двусторонней печати эффективное количество страниц на физическом листе
     вычисляется как fit_total * 2, потому что fit_total хранит количество страниц на ОДНОЙ стороне.
  3. Для односторонней печати effective_fit_total = fit_total.
- Формула: sheet_count = ceil( (adjusted_pages * copies) / effective_fit_total )
"""

# Импортируем необходимые модули Django для работы с базой данных и моделями.
from django.db import models          # Модуль для создания моделей и работы с БД.
from decimal import Decimal           # Для точных десятичных вычислений (количество листов – дробное).
import math                           # Для функции округления вверх (math.ceil).

# Импортируем существующую модель VichisliniyaListovModel из текущего приложения,
# чтобы переиспользовать её выборы (choices) для цветности и ориентации.
from .models import VichisliniyaListovModel


# ============================================================================
# МОДЕЛЬ 1: MultipageBinding (Способ скрепления)
# ============================================================================

class MultipageBinding(models.Model):
    """
    Модель для хранения способов скрепления многостраничных изделий.
    Например: 'скрепка', 'пружина', 'КБС' (клеевое бесшвейное скрепление).
    Каждый способ имеет свои правила кратности страниц и коэффициент расхода бумаги.
    """

    # Поле "Название" – текстовое, уникальное, максимум 50 символов.
    # Используется для отображения в выпадающих списках и идентификации способа.
    name = models.CharField(
        verbose_name='Название',          # Отображаемое имя в админке и формах.
        max_length=50,                    # Максимальная длина строки.
        unique=True,                      # Запрещаем дублирование названий.
        help_text='Например: скрепка, пружина, КБС'  # Подсказка для пользователя.
    )

    # Кратность количества страниц (для скрепки – 4, для пружины – 2, для КБС – 2).
    # Это число означает, что общее количество страниц в брошюре должно быть кратно этому значению.
    # При расчёте количество страниц будет округлено вверх до ближайшего кратного.
    page_multiple = models.PositiveSmallIntegerField(
        verbose_name='Кратность страниц',  # Отображаемое имя.
        help_text='Количество страниц должно быть кратно этому числу. '
                  'Для скрепки = 4, для пружины = 2, для КБС = 2'
    )

    # Коэффициент расхода бумаги – учитывает возможный дополнительный расход (например, на обложку).
    # Значение по умолчанию 1.00 (без дополнительного расхода).
    paper_coefficient = models.DecimalField(
        verbose_name='Коэффициент бумаги',
        max_digits=5,          # Всего цифр в числе (включая дробную часть).
        decimal_places=2,      # Количество знаков после запятой.
        default=1.00,          # Значение по умолчанию.
        help_text='Коэффициент, учитывающий дополнительный расход бумаги '
                  '(например, на обложку)'
    )

    # Описание способа (необязательное поле, может быть пустым).
    description = models.TextField(
        verbose_name='Описание',
        blank=True,            # Разрешено пустое значение.
        help_text='Подробное описание технологии скрепления'
    )

    # Порядок сортировки при отображении (чем меньше число, тем выше в списке).
    # Удобно для упорядочивания способов в выпадающем списке.
    order = models.PositiveSmallIntegerField(
        verbose_name='Порядок',
        default=0,
        help_text='Чем меньше число, тем выше в списке'
    )

    # Внутренний класс Meta для метаданных модели.
    class Meta:
        db_table = 'vichisliniya_listov_multipage_bindings'  # Имя таблицы в БД.
        ordering = ['order', 'name']                         # Сортировка по умолчанию.
        verbose_name = 'Способ скрепления (многостраничное)'  # Имя в единственном числе.
        verbose_name_plural = 'Способы скрепления (многостраничное)'  # Во множественном.

    # Строковое представление объекта – возвращает название способа.
    # Используется в админке и в выпадающих списках.
    def __str__(self):
        return self.name


# ============================================================================
# МОДЕЛЬ 2: VichisliniyaMultipageModel (Основная модель многостраничных вычислений)
# ============================================================================

class VichisliniyaMultipageModel(models.Model):
    """
    Модель для хранения данных многостраничных вычислений (брошюры, книги).
    Связана с печатным компонентом (один к одному), так как для одного компонента
    может быть либо одностраничный расчёт (существующая модель VichisliniyaListovModel),
    либо многостраничный (эта модель). Используем OneToOneField.
    """

    # ===== ВЫБОРЫ ДЛЯ ПОЛЕЙ =====
    # Варианты ориентации готовой брошюры (для способа "скрепка").
    ORIENTATION_CHOICES = [
        ('portrait', 'Вертикальная (портретная)'),   # Книжная ориентация.
        ('landscape', 'Горизонтальная (альбомная)'), # Альбомная ориентация.
    ]

    # ===== СВЯЗЬ С ПЕЧАТНЫМ КОМПОНЕНТОМ =====
    # Один-к-одному с моделью PrintComponent из приложения calculator.
    # При удалении компонента автоматически удаляется и эта запись (CASCADE).
    print_component = models.OneToOneField(
        'calculator.PrintComponent',          # Ссылка на модель (строка, чтобы избежать циклического импорта).
        verbose_name='Печатный компонент',
        on_delete=models.CASCADE,             # Каскадное удаление.
        related_name='multipage_data',        # Обратная связь: component.multipage_data.
        help_text='Печатный компонент, для которого выполняются многостраничные вычисления'
    )

    # ===== СПОСОБ СКРЕПЛЕНИЯ (внешний ключ на справочник) =====
    # Может быть NULL, если способ не выбран (тогда скрепление не учитывается).
    binding = models.ForeignKey(
        MultipageBinding,                     # Ссылка на модель MultipageBinding.
        verbose_name='Способ скрепления',
        on_delete=models.SET_NULL,            # При удалении способа – поле становится NULL.
        null=True,                            # Разрешено пустое значение.
        blank=True,                           # В формах поле может быть пустым.
        help_text='Как будет скреплена брошюра: скрепка, пружина, КБС'
    )

    # ===== ОСНОВНЫЕ ПАРАМЕТРЫ БРОШЮРЫ =====
    # Общее количество страниц в готовом изделии (например, 4, 8, 12, 16 и т.д.).
    total_pages = models.PositiveIntegerField(
        verbose_name='Количество страниц',
        default=4,
        help_text='Общее количество страниц в готовом изделии'
    )

    # Количество копий (экземпляров) брошюры – обычно равно тиражу просчёта.
    # По умолчанию 1, но при сохранении автоматически подставляется тираж из просчёта.
    copies = models.PositiveIntegerField(
        verbose_name='Количество экземпляров',
        default=1,
        help_text='Количество готовых брошюр (обычно равно тиражу просчёта)'
    )

    # ===== ПАРАМЕТРЫ СТРАНИЦЫ И ПЕЧАТИ =====
    # Ширина страницы в миллиметрах (десятичное число, точность до 2 знаков).
    finished_width = models.DecimalField(
        verbose_name='Ширина страницы (мм)',
        max_digits=6,
        decimal_places=2,
        default=210.00,
        help_text='Ширина одной страницы в миллиметрах (например, 210 для A4)'
    )

    # Высота страницы в миллиметрах.
    finished_height = models.DecimalField(
        verbose_name='Высота страницы (мм)',
        max_digits=6,
        decimal_places=2,
        default=297.00,
        help_text='Высота одной страницы в миллиметрах (например, 297 для A4)'
    )

    # Зазор (вылеты) между страницами/разворотами на печатном листе (в миллиметрах).
    vyleta = models.PositiveIntegerField(
        verbose_name='Вылеты (зазор) (мм)',
        default=1,
        help_text='Расстояние между страницами/разворотами на листе в миллиметрах'
    )

    # Цветность (используем те же выборы, что и в одностраничной модели).
    color = models.CharField(
        verbose_name='Цветность',
        max_length=10,
        choices=VichisliniyaListovModel.VICHISLINIYA_LISTOV_COLOR_CHOICES,
        default='4+0'
    )

    # ===== НОВОЕ ПОЛЕ: ОРИЕНТАЦИЯ ГОТОВОЙ БРОШЮРЫ =====
    # Влияет на размещение разворотов при способе скрепления "скрепка".
    # Например, для вертикальной брошюры две страницы располагаются рядом,
    # для горизонтальной – одна над другой.
    booklet_orientation = models.CharField(
        verbose_name='Ориентация брошюры',
        max_length=10,
        choices=ORIENTATION_CHOICES,
        default='portrait',
        help_text='Вертикальная (портретная) или горизонтальная (альбомная) ориентация готовой брошюры. '
                  'Влияет на то, как развороты размещаются на листе.'
    )

    # ===== ПОЛЯ ДЛЯ РАЗМЕЩЕНИЯ СТРАНИЦ/РАЗВОРОТОВ НА ЛИСТЕ =====
    # Эти поля заполняются автоматически при расчёте размещения (на фронтенде или в админке).
    # ВАЖНО: fit_total хранит количество страниц, помещающихся на ОДНОЙ стороне листа.
    # Для двусторонней печати эффективное количество страниц на физическом листе = fit_total * 2.

    # Количество страниц/разворотов, помещающихся по горизонтали на одной стороне.
    fit_horizontal = models.PositiveIntegerField(
        verbose_name='По горизонтали (на одной стороне)',
        default=0,
        help_text='Количество страниц/разворотов, помещающихся по горизонтали на одной стороне листа'
    )

    # Количество по вертикали на одной стороне.
    fit_vertical = models.PositiveIntegerField(
        verbose_name='По вертикали (на одной стороне)',
        default=0,
        help_text='Количество страниц/разворотов, помещающихся по вертикали на одной стороне листа'
    )

    # Общее количество страниц на ОДНОЙ стороне листа при выбранной ориентации.
    fit_total = models.PositiveIntegerField(
        verbose_name='Всего страниц на одной стороне листа',
        default=0,
        help_text='Общее количество страниц, помещающихся на ОДНОЙ стороне листа при выбранной ориентации'
    )

    # Количество страниц на одной стороне при альбомной ориентации размещения (без поворота).
    fit_landscape_total = models.PositiveIntegerField(
        verbose_name='Альбомная ориентация (на одной стороне)',
        default=0,
        help_text='Количество страниц на одной стороне, если размещать их в альбомной ориентации (без поворота)'
    )

    # Количество страниц на одной стороне при портретной ориентации (с поворотом).
    fit_portrait_total = models.PositiveIntegerField(
        verbose_name='Портретная ориентация (на одной стороне)',
        default=0,
        help_text='Количество страниц на одной стороне, если размещать их в портретной ориентации (с поворотом на 90°)'
    )

    # Выбранная ориентация размещения ('landscape', 'portrait' или 'auto').
    fit_selected_orientation = models.CharField(
        verbose_name='Выбранная ориентация',
        max_length=10,
        choices=VichisliniyaListovModel.VICHISLINIYA_LISTOV_ORIENTATION_CHOICES,
        default='auto',
        help_text='Какая ориентация размещения выбрана в данный момент (для способов, отличных от скрепки)'
    )

    # ===== РЕЗУЛЬТАТ РАСЧЁТА =====
    # Количество печатных листов, необходимое для изготовления тиража.
    # Это поле сохраняется в БД и обновляется автоматически при каждом сохранении.
    sheet_count = models.DecimalField(
        verbose_name='Количество печатных листов',
        max_digits=10,
        decimal_places=2,
        default=0.00,
        help_text='Расчётное количество печатных листов на тираж (с округлением вверх) – уже с учётом тиража'
    )

    # ===== НОВОЕ ПОЛЕ: АКТИВЕН ЛИ МНОГОСТРАНИЧНЫЙ РЕЖИМ =====
    # Если True – для данного компонента используется многостраничный расчёт,
    # если False – одностраничный (даже если запись существует).
    # Это позволяет сохранять выбор пользователя между сессиями.
    is_active = models.BooleanField(
        verbose_name='Многостраничный режим активен',
        default=False,
        help_text='Определяет, выбран ли многостраничный режим для этого компонента. '
                  'Если False – используется одностраничный режим.'
    )

    # ===== СЛУЖЕБНЫЕ ПОЛЯ (даты) =====
    created_at = models.DateTimeField(
        verbose_name='Дата создания',
        auto_now_add=True      # Автоматически устанавливается при первом сохранении.
    )
    updated_at = models.DateTimeField(
        verbose_name='Дата обновления',
        auto_now=True          # Автоматически обновляется при каждом сохранении.
    )

    # ===== МЕТАКЛАСС =====
    class Meta:
        db_table = 'vichisliniya_listov_multipage_data'   # Имя таблицы в БД.
        ordering = ['-created_at']                        # Сортировка: сначала новые.
        verbose_name = 'Многостраничное вычисление'       # Имя в единственном числе.
        verbose_name_plural = 'Многостраничные вычисления' # Во множественном.

    # ===== МАГИЧЕСКИЙ МЕТОД __str__ (для отображения в админке) =====
    def __str__(self):
        return (f"Многостраничное для компонента {self.print_component_id}: "
                f"{self.total_pages} стр., {self.sheet_count} листов, "
                f"активен: {self.is_active}")

    # ===== ПОЛЬЗОВАТЕЛЬСКИЕ МЕТОДЫ =====

    def calculate_sheet_count(self):
        """
        Расчёт количества печатных листов для заданного тиража (copies).
        ПРАВИЛЬНАЯ ФОРМУЛА (с учётом кратности страниц и режима печати):
            1. Округляем total_pages вверх до кратного page_multiple (если задан способ скрепления).
            2. Определяем эффективное количество страниц на физическом листе:
               - для двусторонней печати: effective_fit_total = fit_total * 2
               - для односторонней печати: effective_fit_total = fit_total
            3. sheet_count = ceil( (adjusted_pages * copies) / effective_fit_total )

        Почему fit_total умножается на 2 при двусторонней печати?
        Потому что fit_total хранит количество страниц на ОДНОЙ стороне листа.
        При двусторонней печати на одном физическом листе помещается вдвое больше страниц.
        """
        # Защита от деления на ноль: если на одной стороне не помещается ни одной страницы,
        # то расчёт невозможен, устанавливаем 0.
        if self.fit_total <= 0:
            self.sheet_count = Decimal('0.00')
            return self.sheet_count

        # ===== ШАГ 1: Корректировка количества страниц до кратности =====
        # Начинаем с исходного количества страниц.
        adjusted_pages = self.total_pages
        # Если выбран способ скрепления и у него задана кратность > 0,
        # округляем total_pages вверх до ближайшего числа, кратного page_multiple.
        if self.binding and self.binding.page_multiple > 0:
            multiple = self.binding.page_multiple
            # math.ceil(self.total_pages / multiple) * multiple – классическая формула
            # округления вверх до кратного.
            adjusted_pages = math.ceil(self.total_pages / multiple) * multiple

        # ===== ШАГ 2: Определение режима печати =====
        # Получаем режим печати из связанного печатного компонента.
        # По умолчанию считаем одностороннюю печать ('single').
        printing_mode = 'single'
        if self.print_component and hasattr(self.print_component, 'printing_mode'):
            printing_mode = self.print_component.printing_mode

        # ===== ШАГ 3: Эффективное количество страниц на физическом листе =====
        if printing_mode == 'duplex':
            # Двусторонняя печать: на листе две стороны, значит страниц вдвое больше.
            effective_fit_total = self.fit_total * 2
        else:
            # Односторонняя печать: только одна сторона.
            effective_fit_total = self.fit_total

        # ===== ШАГ 4: Расчёт общего количества листов =====
        # Общее количество страниц во всём тираже (скорректированное).
        total_pages_all = adjusted_pages * self.copies
        # Количество физических листов = округление вверх от деления общего числа страниц
        # на количество страниц, помещающихся на одном физическом листе.
        ceil_total = math.ceil(total_pages_all / effective_fit_total)
        # Сохраняем результат с двумя знаками после запятой (как Decimal).
        self.sheet_count = Decimal(ceil_total).quantize(Decimal('0.00'))
        return self.sheet_count

    def validate_pages_multiple(self):
        """
        Проверка, что количество страниц кратно требуемому для выбранного способа скрепления.
        Возвращает True, если кратно или способ не выбран, иначе False.
        Используется для вывода предупреждения пользователю.
        """
        if self.binding and self.binding.page_multiple > 0:
            return self.total_pages % self.binding.page_multiple == 0
        return True  # Если способ не выбран, считаем, что всё правильно.

    def save(self, *args, **kwargs):
        """
        Переопределяем метод save() для автоматического пересчёта количества листов
        перед сохранением в базу данных.
        Также пытаемся получить тираж из связанного просчёта, если copies не заданы.
        """
        # Если copies не заданы (равны 1 по умолчанию) и есть связанный просчёт,
        # то берём тираж из просчёта.
        if self.copies == 1 and self.print_component and self.print_component.proschet:
            self.copies = self.print_component.proschet.circulation

        # Пересчитываем количество листов на основе текущих параметров
        # (с учётом кратности и режима печати).
        self.calculate_sheet_count()

        # Вызываем оригинальный метод save() родительского класса,
        # чтобы сохранить объект в базу данных.
        super().save(*args, **kwargs)

    def to_dict(self):
        """
        Преобразование объекта модели в словарь для JSON-ответов API.
        Используется в представлениях (views) для отправки данных клиенту.
        """
        return {
            'id': self.id,
            'print_component_id': self.print_component_id,
            'binding_id': self.binding_id if self.binding else None,
            'binding_name': self.binding.name if self.binding else None,
            'total_pages': self.total_pages,
            'finished_width': float(self.finished_width),
            'finished_height': float(self.finished_height),
            'vyleta': self.vyleta,
            'color': self.color,
            'booklet_orientation': self.booklet_orientation,
            'is_active': self.is_active,
            'fit_horizontal': self.fit_horizontal,
            'fit_vertical': self.fit_vertical,
            'fit_total': self.fit_total,
            'fit_landscape_total': self.fit_landscape_total,
            'fit_portrait_total': self.fit_portrait_total,
            'fit_selected_orientation': self.fit_selected_orientation,
            'sheet_count': float(self.sheet_count),
            'copies': self.copies,
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat(),
            'is_valid_pages': self.validate_pages_multiple(),
        }