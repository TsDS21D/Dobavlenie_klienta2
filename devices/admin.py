"""
admin.py для приложения devices

Этот файл регистрирует модели Printer и Laminator в административной панели Django.
Здесь настраивается, как модели отображаются, фильтруются, редактируются и ищутся
в интерфейсе администратора (http://127.0.0.1:5000/admin/).

Каждый класс администратора (PrinterAdmin, LaminatorAdmin) определяет:
- Какие поля показывать в списке объектов (list_display)
- По каким полям фильтровать (list_filter)
- Какие поля искать (search_fields)
- Какие поля можно редактировать прямо из списка (list_editable)
- Группировку полей на странице редактирования (fieldsets)
- Поля только для чтения (readonly_fields)
- Сортировку по умолчанию (ordering)
- И дополнительные методы для отображения вычисляемых полей.
"""

# Импортируем модуль admin из Django — он предоставляет декоратор @admin.register
# и базовый класс ModelAdmin для настройки админки.
from django.contrib import admin

# Импортируем модели, которые будем регистрировать в админке.
from .models import Printer, Laminator


# ==================== НАСТРОЙКА АДМИНКИ ДЛЯ ПРИНТЕРОВ ====================

# Декоратор @admin.register(Printer) связывает класс PrinterAdmin с моделью Printer.
# Это современный способ регистрации (вместо admin.site.register).
@admin.register(Printer)
class PrinterAdmin(admin.ModelAdmin):
    """
    Настройка отображения модели Printer в административной панели.

    Все атрибуты и методы этого класса управляют интерфейсом админки
    для принтеров.
    """

    # ---------- Атрибуты для списка объектов (страница со списком всех принтеров) ----------

    # list_display — кортеж или список полей, которые отображаются в таблице списка.
    # Здесь перечислены имена полей модели, а также имена методов (например, get_dimensions_display).
    # Можно указывать как строки с именами полей, так и вызываемые объекты.
    list_display = (
        'name',                     # Название принтера
        'sheet_format',             # Формат листа (ForeignKey, отображается как __str__ связанного объекта)
        'get_dimensions_display',   # Метод, возвращающий размеры формата (например, "320×450 мм")
        'margin_mm',                # Поля в мм (целое число)
        'duplex_coefficient',       # Коэффициент двусторонней печати
        'devices_interpolation_method',  # Метод интерполяции (линейный/логарифмический)
        'created_at',               # Дата создания
    )

    # list_filter — поля, по которым можно фильтровать список справа в боковой панели.
    # Django автоматически создаст виджеты фильтрации для этих полей.
    list_filter = (
        'sheet_format',                  # Фильтр по формату листа (выпадающий список)
        'devices_interpolation_method',  # Фильтр по методу интерполяции
        'created_at',                    # Фильтр по дате (с возможностью выбора периода)
    )

    # search_fields — поля, по которым будет выполняться поиск через строку поиска.
    # Можно указывать поля с двойным подчёркиванием для поиска по связанным моделям.
    search_fields = (
        'name',                    # Поиск по названию принтера
        'sheet_format__name',      # Поиск по названию формата (через ForeignKey)
    )

    # list_editable — поля, которые можно редактировать прямо в списке (без перехода на страницу редактирования).
    # Эти поля появятся в виде полей ввода в каждой строке таблицы.
    list_editable = (
        'margin_mm',                     # Можно менять поля прямо из списка
        'duplex_coefficient',
        'devices_interpolation_method',
    )

    # list_per_page — количество объектов, отображаемых на одной странице списка.
    list_per_page = 20

    # ordering — сортировка по умолчанию для списка объектов.
    # Можно указать несколько полей, знак минус означает обратный порядок.
    ordering = ('name',)   # Сортировка по названию в алфавитном порядке

    # ---------- Настройка страницы редактирования отдельного объекта ----------

    # fieldsets — группировка полей на странице редактирования.
    # Каждый элемент — кортеж: (название группы, словарь с опциями).
    fieldsets = (
        # Первая группа: основная информация
        ('Основная информация', {
            'fields': ('name', 'sheet_format')   # Поля, входящие в группу
        }),
        # Вторая группа: параметры печати
        ('Параметры печати', {
            'fields': ('margin_mm', 'duplex_coefficient')
        }),
        # Третья группа: метод интерполяции (выделена отдельно для наглядности)
        ('Метод интерполяции', {
            'fields': ('devices_interpolation_method',),
            'description': 'Выберите метод интерполяции для расчёта стоимости при произвольном тираже',
        }),
        # Четвёртая группа: даты (сворачиваемая — класс 'collapse')
        ('Даты', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)   # Эта группа будет изначально свёрнута
        }),
    )

    # readonly_fields — поля, которые нельзя редактировать на странице редактирования (только для чтения).
    # Обычно это автоматически заполняемые поля (created_at, updated_at).
    readonly_fields = ('created_at', 'updated_at')

    # ---------- Дополнительные методы для отображения вычисляемых полей ----------

    # Эти методы используются в list_display для показа информации,
    # которая не является прямым полем модели.

    def get_dimensions_display(self, obj):
        """
        Возвращает размеры формата листа для отображения в админ-панели.
        obj — текущий объект Printer.
        Вызывается для каждого принтера в списке.
        """
        return obj.get_dimensions_display()

    # short_description — задаёт заголовок колонки в списке.
    get_dimensions_display.short_description = 'Размеры формата'

    def get_margin_display(self, obj):
        """
        Возвращает строку с полями (например, "5 мм").
        """
        return obj.get_margin_display()
    get_margin_display.short_description = 'Поля'

    def get_duplex_display(self, obj):
        """
        Возвращает коэффициент в удобном формате (целое или с одним знаком после запятой).
        """
        return obj.get_duplex_display()
    get_duplex_display.short_description = 'Коэффициент'

    def devices_interpolation_method_display(self, obj):
        """
        Возвращает краткое название метода интерполяции ("Линейная" или "Логарифмическая").
        """
        return obj.get_interpolation_method_display_short()
    devices_interpolation_method_display.short_description = 'Интерполяция'


# ==================== НАСТРОЙКА АДМИНКИ ДЛЯ ЛАМИНАТОРОВ ====================

# Регистрируем модель Laminator с собственным классом администратора.
@admin.register(Laminator)
class LaminatorAdmin(admin.ModelAdmin):
    """
    Настройка отображения модели Laminator в административной панели.
    Полностью аналогична PrinterAdmin, но с учётом особенностей модели Laminator:
    - Поле метода интерполяции называется laminator_interpolation_method
    - Используются свои методы get_..._display
    """

    # Список отображаемых полей (аналогично принтерам, но с laminator_interpolation_method)
    list_display = (
        'name',
        'sheet_format',
        'get_dimensions_display',
        'margin_mm',
        'duplex_coefficient',
        'laminator_interpolation_method',   # Отличие: поле называется laminator_interpolation_method
        'created_at',
    )

    # Фильтры
    list_filter = (
        'sheet_format',
        'laminator_interpolation_method',   # Фильтр по методу интерполяции ламинатора
        'created_at',
    )

    # Поиск
    search_fields = (
        'name',
        'sheet_format__name',
    )

    # Редактируемые поля прямо из списка
    list_editable = (
        'margin_mm',
        'duplex_coefficient',
        'laminator_interpolation_method',
    )

    list_per_page = 20
    ordering = ('name',)

    # Группировка полей на странице редактирования
    fieldsets = (
        ('Основная информация', {
            'fields': ('name', 'sheet_format')
        }),
        ('Параметры ламинации', {
            'fields': ('margin_mm', 'duplex_coefficient')
        }),
        ('Метод интерполяции', {
            'fields': ('laminator_interpolation_method',),
            'description': 'Выберите метод интерполяции для расчёта стоимости при произвольном тираже',
        }),
        ('Даты', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )

    readonly_fields = ('created_at', 'updated_at')

    # Вспомогательные методы для отображения вычисляемых полей (аналогично принтерам)

    def get_dimensions_display(self, obj):
        """Возвращает размеры формата."""
        return obj.get_dimensions_display()
    get_dimensions_display.short_description = 'Размеры формата'

    def get_margin_display(self, obj):
        """Возвращает поля."""
        return obj.get_margin_display()
    get_margin_display.short_description = 'Поля'

    def get_duplex_display(self, obj):
        """Возвращает коэффициент."""
        return obj.get_duplex_display()
    get_duplex_display.short_description = 'Коэффициент'

    def laminator_interpolation_method_display(self, obj):
        """Возвращает краткое название метода интерполяции для ламинатора."""
        return obj.get_interpolation_method_display_short()
    laminator_interpolation_method_display.short_description = 'Интерполяция'