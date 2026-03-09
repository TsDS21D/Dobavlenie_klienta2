"""
Файл admin.py для приложения vichisliniya_listov.
Регистрация моделей в административной панели Django.
ОБНОВЛЕНО: 
- Добавлены новые поля для размеров изделия, размещения на листе и количества резов.
- Поля list_count и cuts_count теперь readonly – они автоматически пересчитываются в модели.
- Исправлено отображение HTML в поле "Информация о просчёте" с помощью mark_safe.
"""

# Импортируем модуль admin из Django для регистрации моделей
from django.contrib import admin
# Импортируем функцию для пометки строки как безопасной (не экранировать HTML)
from django.utils.safestring import mark_safe

# Импортируем нашу модель из models.py
from .models import VichisliniyaListovModel


@admin.register(VichisliniyaListovModel)
class VichisliniyaListovModelAdmin(admin.ModelAdmin):
    """
    Класс VichisliniyaListovModelAdmin для настройки отображения модели 
    VichisliniyaListovModel в административной панели Django.
    ВАЖНОЕ ИЗМЕНЕНИЕ: Теперь модель связана с печатными компонентами.
    Добавлены новые поля для размеров изделия и расчёта размещения.
    Поля list_count и cuts_count доступны только для чтения (пересчитываются автоматически).
    """

    # ===== НАСТРОЙКА ОТОБРАЖАЕМЫХ ПОЛЕЙ В СПИСКЕ =====

    # Поля, которые будут отображаться в списке записей
    list_display = [
        'vichisliniya_listov_get_print_component_number',  # Номер печатного компонента
        'vichisliniya_listov_get_proschet_info',           # Информация о просчёте
        'vichisliniya_listov_list_count',                  # Количество листов
        'vichisliniya_listov_vyleta',                      # Вылеты (расстояние)
        'vichisliniya_listov_item_width',                  # Ширина изделия
        'vichisliniya_listov_item_height',                 # Высота изделия
        'vichisliniya_listov_fit_total',                   # Всего изделий на листе
        'vichisliniya_listov_fit_selected_orientation',    # Выбранная ориентация
        'vichisliniya_listov_cuts_count',                  # Количество резов (НОВОЕ)
        'vichisliniya_listov_color',                       # Цветность
        'vichisliniya_listov_created_at',                  # Дата создания
        'vichisliniya_listov_updated_at',                  # Дата обновления
    ]

    # ===== НАСТРОЙКА ФИЛЬТРОВ В СПРАВА =====

    # Поля, по которым можно фильтровать записи в правой панели
    list_filter = [
        'vichisliniya_listov_color',                        # Фильтр по цветности
        'vichisliniya_listov_fit_selected_orientation',     # Фильтр по выбранной ориентации
        'vichisliniya_listov_created_at',                   # Фильтр по дате создания
    ]

    # ===== НАСТРОЙКА ПОИСКА =====

    # Поля, по которым будет работать поиск в административной панели
    search_fields = [
        'vichisliniya_listov_print_component__number',       # Поиск по номеру компонента
        'vichisliniya_listov_print_component__proschet__number',  # Поиск по номеру просчёта
    ]

    # ===== НАСТРОЙКА ПОЛЕЙ ТОЛЬКО ДЛЯ ЧТЕНИЯ =====
    # Теперь добавляем list_count и cuts_count, чтобы пользователь не мог их изменять вручную,
    # так как они пересчитываются автоматически при сохранении.
    readonly_fields = [
        'vichisliniya_listov_created_at',                    # Дата создания (автоматическая)
        'vichisliniya_listov_updated_at',                    # Дата обновления (автоматическая)
        'vichisliniya_listov_get_proschet_info_display',     # Информация о просчёте (только для чтения, но с HTML)
        'vichisliniya_listov_list_count',                    # Количество листов (пересчитывается)
        'vichisliniya_listov_cuts_count',                    # Количество резов (пересчитывается)
    ]

    # ===== НАСТРОЙКА ГРУППИРОВКИ ПОЛЕЙ В ФОРМЕ =====

    # Группировка полей в форме редактирования
    fieldsets = (
        # Первая группа: Связь с печатным компонентом
        ('Связь с печатным компонентом', {
            'fields': (
                'vichisliniya_listov_print_component',
                'vichisliniya_listov_get_proschet_info_display',
            ),
            'description': 'Связь с печатным компонентом и просчётом',
        }),

        # Вторая группа: Основные параметры (результаты)
        ('Основные результаты', {
            'fields': (
                'vichisliniya_listov_list_count',
                'vichisliniya_listov_vyleta',
            ),
            'description': 'Основные параметры вычислений листов',
        }),

        # Третья группа: Параметры изделия
        ('Параметры изделия', {
            'fields': (
                'vichisliniya_listov_item_width',
                'vichisliniya_listov_item_height',
            ),
            'description': 'Размеры одного изделия в миллиметрах',
        }),

        # Четвёртая группа: Результаты размещения на листе
        ('Размещение на листе', {
            'fields': (
                'vichisliniya_listov_fit_horizontal',
                'vichisliniya_listov_fit_vertical',
                'vichisliniya_listov_fit_total',
                'vichisliniya_listov_fit_landscape_total',
                'vichisliniya_listov_fit_portrait_total',
                'vichisliniya_listov_fit_selected_orientation',
                'vichisliniya_listov_cuts_count',  # НОВОЕ ПОЛЕ
            ),
            'description': 'Количество изделий, помещающихся на листе (рассчитывается автоматически), и количество резов',
        }),

        # Пятая группа: Параметры печати
        ('Параметры печати', {
            'fields': (
                'vichisliniya_listov_polosa_count',
                'vichisliniya_listov_color',
            ),
            'description': 'Параметры, влияющие на расчёт листов (устаревшие)',
        }),

        # Шестая группа: Служебная информация
        ('Служебная информация', {
            'fields': (
                'vichisliniya_listov_created_at',
                'vichisliniya_listov_updated_at',
            ),
            'classes': ('collapse',),  # Группа свёрнута по умолчанию
            'description': 'Автоматически заполняемые поля',
        }),
    )

    # ===== НАСТРОЙКА СОРТИРОВКИ =====

    # Поле, по которому по умолчанию сортируется список
    ordering = ('-vichisliniya_listov_created_at',)

    # ===== НАСТРОЙКА КНОПОК ДЕЙСТВИЙ =====

    # Действия, доступные в выпадающем списке "Действие"
    actions = ['vichisliniya_listov_calculate_all']

    # ===== КАСТОМНЫЕ МЕТОДЫ ДЛЯ ОТОБРАЖЕНИЯ =====

    def vichisliniya_listov_get_print_component_number(self, obj):
        """
        Метод для отображения номера печатного компонента в списке.

        Аргументы:
            obj: Объект модели VichisliniyaListovModel

        Возвращает:
            str: Номер печатного компонента или сообщение об ошибке
        """
        # Проверяем наличие связанного печатного компонента
        if obj.vichisliniya_listov_print_component:
            return obj.vichisliniya_listov_print_component.number
        return "Не указан"

    # Устанавливаем читаемое название для колонки
    vichisliniya_listov_get_print_component_number.short_description = '№ компонента'
    vichisliniya_listov_get_print_component_number.admin_order_field = 'vichisliniya_listov_print_component__number'

    def vichisliniya_listov_get_proschet_info(self, obj):
        """
        Метод для отображения информации о просчёте в списке.

        Аргументы:
            obj: Объект модели VichisliniyaListovModel

        Возвращает:
            str: Информация о просчёте
        """
        # Получаем информацию о просчёте через связанный компонент
        if (obj.vichisliniya_listov_print_component and 
            obj.vichisliniya_listov_print_component.proschet):

            proschet = obj.vichisliniya_listov_print_component.proschet
            return f"{proschet.number}: {proschet.title}"
        return "Не указан"

    # Устанавливаем читаемое название для колонки
    vichisliniya_listov_get_proschet_info.short_description = 'Просчёт'
    vichisliniya_listov_get_proschet_info.admin_order_field = 'vichisliniya_listov_print_component__proschet__number'

    def vichisliniya_listov_get_proschet_info_display(self, obj):
        """
        Метод для отображения информации о просчёте в форме редактирования.
        Возвращает HTML-блок с информацией, который будет корректно отображаться в админке.

        Аргументы:
            obj: Объект модели VichisliniyaListovModel

        Возвращает:
            str: HTML-код с информацией о просчёте (помечен как безопасный)
        """
        # Получаем информацию о просчёте
        if (obj.vichisliniya_listov_print_component and 
            obj.vichisliniya_listov_print_component.proschet):

            proschet = obj.vichisliniya_listov_print_component.proschet

            # Формируем HTML для отображения
            html = f"""
                <div style="padding: 10px; background-color: #f8f9fa; border-radius: 5px;">
                    <strong>Просчёт:</strong> {proschet.number} - {proschet.title}<br>
                    <strong>Тираж:</strong> {proschet.circulation} шт.<br>
                    <strong>Клиент:</strong> {proschet.client.name if proschet.client else 'Не указан'}
                </div>
            """
            # Помечаем строку как безопасную, чтобы Django не экранировал HTML-теги
            return mark_safe(html)
        return "Не указано"

    # Указываем, что это поле содержит HTML (необязательно, но полезно)
    vichisliniya_listov_get_proschet_info_display.short_description = 'Информация о просчёте'

    def vichisliniya_listov_calculate_all(self, request, queryset):
        """
        Действие для пересчёта количества листов для выбранных записей.
        Теперь использует тираж из связанного печатного компонента и новую формулу.

        Аргументы:
            request: HTTP-запрос
            queryset: Выбранные записи для обработки

        Возвращает:
            None
        """
        # Счётчик обновлённых записей
        updated_count = 0

        # Проходим по всем выбранным записям
        for obj in queryset:
            # Проверяем наличие связанного печатного компонента
            if (obj.vichisliniya_listov_print_component and 
                obj.vichisliniya_listov_print_component.proschet):

                # Получаем тираж из связанного просчёта
                circulation = obj.vichisliniya_listov_print_component.proschet.circulation

                # Выполняем расчёт с использованием нового метода модели
                obj.vichisliniya_listov_calculate_list_count(circulation)
                obj.save()  # Сохраняем изменения в базе данных
                updated_count += 1

        # Показываем сообщение пользователю
        self.message_user(
            request, 
            f'Количество листов пересчитано для {updated_count} записей (с округлением вверх).'
        )

    # Устанавливаем читаемое название действия
    vichisliniya_listov_calculate_all.short_description = 'Пересчитать количество листов (новая формула)'