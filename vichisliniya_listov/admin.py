"""
Файл admin.py для приложения vichisliniya_listov.
Регистрация моделей в административной панели Django.
ОБНОВЛЕНО: Теперь модель связана с печатными компонентами.
"""

# Импортируем модуль admin из Django для регистрации моделей
from django.contrib import admin

# Импортируем нашу модель из models.py
from .models import VichisliniyaListovModel


@admin.register(VichisliniyaListovModel)
class VichisliniyaListovModelAdmin(admin.ModelAdmin):
    """
    Класс VichisliniyaListovModelAdmin для настройки отображения модели 
    VichisliniyaListovModel в административной панели Django.
    ВАЖНОЕ ИЗМЕНЕНИЕ: Теперь модель связана с печатными компонентами.
    """
    
    # ===== НАСТРОЙКА ОТОБРАЖАЕМЫХ ПОЛЕЙ В СПИСКЕ =====
    
    # Поля, которые будут отображаться в списке записей
    list_display = [
        'vichisliniya_listov_get_print_component_number',  # Номер печатного компонента
        'vichisliniya_listov_get_proschet_info',           # Информация о просчёте
        'vichisliniya_listov_list_count',                  # Количество листов
        'vichisliniya_listov_vyleta',                      # Вылеты
        'vichisliniya_listov_polosa_count',                # Количество полос
        'vichisliniya_listov_color',                       # Цветность
        'vichisliniya_listov_created_at',                  # Дата создания
        'vichisliniya_listov_updated_at',                  # Дата обновления
    ]
    
    # ===== НАСТРОЙКА ФИЛЬТРОВ В СПРАВА =====
    
    # Поля, по которым можно фильтровать записи в правой панели
    list_filter = [
        'vichisliniya_listov_color',            # Фильтр по цветности
        'vichisliniya_listov_created_at',       # Фильтр по дате создания
    ]
    
    # ===== НАСТРОЙКА ПОИСКА =====
    
    # Поля, по которым будет работать поиск в административной панели
    search_fields = [
        'vichisliniya_listov_print_component__number',  # Поиск по номеру компонента
        'vichisliniya_listov_print_component__proschet__number',  # Поиск по номеру просчёта
    ]
    
    # ===== НАСТРОЙКА ПОЛЕЙ ТОЛЬКО ДЛЯ ЧТЕНИЯ =====
    
    # Поля, которые нельзя редактировать в форме редактирования
    readonly_fields = [
        'vichisliniya_listov_created_at',       # Дата создания (автоматическая)
        'vichisliniya_listov_updated_at',       # Дата обновления (автоматическая)
        'vichisliniya_listov_get_proschet_info_display',  # Информация о просчёте (только для чтения)
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
        
        # Вторая группа: Основные параметры
        ('Основные параметры', {
            'fields': (
                'vichisliniya_listov_list_count',
                'vichisliniya_listov_vyleta',
            ),
            'description': 'Основные параметры вычислений листов',
        }),
        
        # Третья группа: Параметры печати
        ('Параметры печати', {
            'fields': (
                'vichisliniya_listov_polosa_count',
                'vichisliniya_listov_color',
            ),
            'description': 'Параметры, влияющие на расчёт листов',
        }),
        
        # Четвёртая группа: Служебная информация
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
        
        Аргументы:
            obj: Объект модели VichisliniyaListovModel
            
        Возвращает:
            str: HTML с информацией о просчёте
        """
        # Получаем информацию о просчёте
        if (obj.vichisliniya_listov_print_component and 
            obj.vichisliniya_listov_print_component.proschet):
            
            proschet = obj.vichisliniya_listov_print_component.proschet
            
            # Формируем HTML для отображения
            return f"""
                <div style="padding: 10px; background-color: #f8f9fa; border-radius: 5px;">
                    <strong>Просчёт:</strong> {proschet.number} - {proschet.title}<br>
                    <strong>Тираж:</strong> {proschet.circulation} шт.<br>
                    <strong>Клиент:</strong> {proschet.client.name if proschet.client else 'Не указан'}
                </div>
            """
        return "Не указано"
    
    # Устанавливаем, что это поле содержит HTML
    vichisliniya_listov_get_proschet_info_display.allow_tags = True
    vichisliniya_listov_get_proschet_info_display.short_description = 'Информация о просчёте'
    
    def vichisliniya_listov_calculate_all(self, request, queryset):
        """
        Действие для пересчёта количества листов для выбранных записей.
        Теперь использует тираж из связанного печатного компонента.
        
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
                
                # Выполняем расчёт
                obj.vichisliniya_listov_calculate_list_count(circulation)
                obj.save()  # Сохраняем изменения в базе данных
                updated_count += 1
        
        # Показываем сообщение пользователю
        self.message_user(
            request, 
            f'Количество листов пересчитано для {updated_count} записей.'
        )
    
    # Устанавливаем читаемое название действия
    vichisliniya_listov_calculate_all.short_description = 'Пересчитать количество листов'