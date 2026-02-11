"""
Файл models.py для приложения vichisliniya_listov.
ОБНОВЛЕНО: Теперь модель привязана к печатным компонентам (PrintComponent) вместо просчётов.
"""

# Импортируем модуль models из Django для создания моделей
from django.db import models

# Импортируем модель PrintComponent из приложения calculator
# ВАЖНО: Используем строковое значение для избежания циклических импортов
# ПРИМЕЧАНИЕ: PrintComponent находится в приложении calculator в файле models_list_proschet.py


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
    # Формат: (значение_в_базе, читаемое_название)
    VICHISLINIYA_LISTOV_COLOR_CHOICES = [
        ('1+0', '1+0 (односторонняя одноцветная)'),
        ('1+1', '1+1 (двусторонняя одноцветная)'),
        ('4+0', '4+0 (односторонняя полноцветная)'),
        ('4+4', '4+4 (двусторонняя полноцветная)'),
    ]
    
    # ===== ОСНОВНЫЕ ПОЛЯ МОДЕЛИ =====
    
    # ВАЖНОЕ ИЗМЕНЕНИЕ: Заменяем proschet_id на ForeignKey к PrintComponent
    # Связь один-к-одному с печатным компонентом
    vichisliniya_listov_print_component = models.ForeignKey(
        'calculator.PrintComponent',  # Ссылка на модель PrintComponent в приложении calculator
        verbose_name='Печатный компонент',  # Человекочитаемое имя для админки
        on_delete=models.CASCADE,  # При удалении компонента удаляются и связанные вычисления
        related_name='vichisliniya_listov_data',  # Имя для обратной связи из PrintComponent
        help_text='Печатный компонент, для которого выполняются вычисления листов',
        db_index=True,  # Создаёт индекс для ускорения поиска
        unique=True  # Гарантирует, что для каждого компонента будет только одна запись
    )
    
    # Количество листов - основное вычисляемое значение
    # Пока что получаем из значения тиража, в будущем может быть расчётным
    # DecimalField: для точного хранения десятичных чисел
    vichisliniya_listov_list_count = models.DecimalField(
        verbose_name='Количество листов',
        help_text='Расчётное количество листов на основе тиража и других параметров',
        max_digits=10,          # Максимальное количество цифр всего
        decimal_places=2,       # Количество цифр после запятой
        default=0.00            # Значение по умолчанию
    )
    
    # Вылеты - количество дополнительных листов на обрезку/брак
    # PositiveIntegerField: только положительные целые числа
    vichisliniya_listov_vyleta = models.PositiveIntegerField(
        verbose_name='Вылеты',
        help_text='Количество дополнительных листов на обрезку и возможный брак',
        default=1               # Значение по умолчанию: 1
    )
    
    # Количество полос - сколько полос (страниц) помещается на одном листе
    # PositiveIntegerField: только положительные целые числа
    vichisliniya_listov_polosa_count = models.PositiveIntegerField(
        verbose_name='Количество полос',
        help_text='Количество полос (страниц), размещаемых на одном листе',
        default=1               # Значение по умолчанию: 1
    )
    
    # Цветность - вариант печати
    # CharField с choices: текстовое поле с ограниченным набором значений
    vichisliniya_listov_color = models.CharField(
        verbose_name='Цветность',
        help_text='Вариант цветности печати',
        max_length=10,          # Максимальная длина текста
        choices=VICHISLINIYA_LISTOV_COLOR_CHOICES,  # Ограниченный выбор значений
        default='4+0'           # Значение по умолчанию: 4+0
    )
    
    # ===== МЕТАДАННЫЕ И СЛУЖЕБНЫЕ ПОЛЯ =====
    
    # Дата и время создания записи
    # auto_now_add=True: автоматически устанавливается при создании
    vichisliniya_listov_created_at = models.DateTimeField(
        verbose_name='Дата создания',
        auto_now_add=True       # Автоматически устанавливается при создании
    )
    
    # Дата и время последнего обновления записи
    # auto_now=True: автоматически обновляется при каждом сохранении
    vichisliniya_listov_updated_at = models.DateTimeField(
        verbose_name='Дата обновления',
        auto_now=True           # Автоматически обновляется при каждом сохранении
    )
    
    # ===== МЕТАКЛАСС ДЛЯ НАСТРОЙКИ ПОВЕДЕНИЯ МОДЕЛИ =====
    
    class Meta:
        """
        Класс Meta содержит метаданные модели.
        Здесь настраиваются дополнительные параметры поведения модели.
        """
        
        # Имя таблицы в базе данных
        db_table = 'vichisliniya_listov_data'
        
        # ВАЖНОЕ ИЗМЕНЕНИЕ: Убираем UniqueConstraint для proschet_id, так как теперь используем unique=True в поле
        # constraints больше не нужны, так как unique=True в поле обеспечивает уникальность
        
        # Порядок сортировки по умолчанию
        ordering = ['-vichisliniya_listov_created_at']
        
        # Человеко-читаемое имя модели в единственном числе
        verbose_name = 'Вычисление листов'
        
        # Человеко-читаемое имя модели во множественном числе
        verbose_name_plural = 'Вычисления листов'
    
    # ===== МАГИЧЕСКИЕ МЕТОДЫ =====
    
    def __str__(self):
        """
        Магический метод __str__ возвращает строковое представление объекта.
        Используется в административной панели и при отладке.
        
        Возвращает:
            str: Строковое представление объекта
        """
        # Получаем ID компонента печати
        component_id = self.vichisliniya_listov_print_component_id
        # Получаем номер компонента
        component_number = self.vichisliniya_listov_print_component.number if self.vichisliniya_listov_print_component else "N/A"
        
        return (f"Вычисления для компонента {component_number} (ID: {component_id}): "
                f"{self.vichisliniya_listov_list_count} листов")
    
    # ===== ПОЛЬЗОВАТЕЛЬСКИЕ МЕТОДЫ =====
    
    def vichisliniya_listov_calculate_list_count(self, circulation):
        """
        Метод для расчёта количества листов на основе тиража и параметров.
        Пока что используем простую формулу: тираж / количество полос + вылеты.
        
        Аргументы:
            circulation (int): Значение тиража из печатного компонента
            
        Возвращает:
            Decimal: Рассчитанное количество листов
        """
        from decimal import Decimal
        
        # Преобразуем тираж в Decimal для точных вычислений
        circulation_decimal = Decimal(str(circulation))
        
        # Расчёт количества листов по формуле:
        # (тираж / количество полос) + вылеты
        # Используем Decimal для избежания ошибок округления
        calculated_list_count = (
            circulation_decimal / Decimal(self.vichisliniya_listov_polosa_count)
        ) + Decimal(self.vichisliniya_listov_vyleta)
        
        # Округляем до 2 знаков после запятой
        calculated_list_count = calculated_list_count.quantize(Decimal('0.01'))
        
        # Сохраняем расчётное значение
        self.vichisliniya_listov_list_count = calculated_list_count
        
        return calculated_list_count
    
    def vichisliniya_listov_get_color_display_name(self):
        """
        Метод для получения читаемого названия цветности.
        
        Возвращает:
            str: Человеко-читаемое название цветности
        """
        # Проходим по всем вариантам цветности
        for value, display_name in self.VICHISLINIYA_LISTOV_COLOR_CHOICES:
            # Если нашли совпадение, возвращаем читаемое название
            if value == self.vichisliniya_listov_color:
                return display_name
        # Если не нашли, возвращаем значение из базы
        return self.vichisliniya_listov_color
    
    def vichisliniya_listov_to_dict(self):
        """
        Метод для преобразования объекта в словарь.
        Используется для передачи данных в JSON-формате.
        
        Возвращает:
            dict: Словарь с данными модели
        """
        return {
            'print_component_id': self.vichisliniya_listov_print_component_id,
            'print_component_number': self.vichisliniya_listov_print_component.number if self.vichisliniya_listov_print_component else None,
            'list_count': float(self.vichisliniya_listov_list_count),
            'vyleta': self.vichisliniya_listov_vyleta,
            'polosa_count': self.vichisliniya_listov_polosa_count,
            'color': self.vichisliniya_listov_color,
            'color_display': self.vichisliniya_listov_get_color_display_name(),
            'created_at': self.vichisliniya_listov_created_at.isoformat(),
            'updated_at': self.vichisliniya_listov_updated_at.isoformat(),
        }
    
    # ===== НОВЫЕ МЕТОДЫ ДЛЯ РАБОТЫ С ПЕЧАТНЫМИ КОМПОНЕНТАМИ =====
    
    def vichisliniya_listov_get_proschet_id(self):
        """
        Метод для получения ID просчёта через связанный печатный компонент.
        Это позволяет сохранить обратную совместимость с кодом, который ожидает proschet_id.
        
        Возвращает:
            int: ID просчёта или None, если компонент не связан с просчётом
        """
        # Проверяем, есть ли связанный печатный компонент
        if self.vichisliniya_listov_print_component and self.vichisliniya_listov_print_component.proschet:
            return self.vichisliniya_listov_print_component.proschet_id
        return None
    
    def vichisliniya_listov_get_proschet_info(self):
        """
        Метод для получения информации о просчёте через связанный печатный компонент.
        
        Возвращает:
            dict: Словарь с информацией о просчёте или None
        """
        # Проверяем наличие связанного компонента и просчёта
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