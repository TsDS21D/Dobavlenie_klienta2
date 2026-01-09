"""
models.py для приложения devices
Модели базы данных для хранения информации о принтерах/устройствах типографии
"""

from django.db import models
from django.core.validators import MinValueValidator, MaxValueValidator
from sheet_formats.models import SheetFormat  # Импортируем модель форматов
from decimal import Decimal, ROUND_HALF_UP  # Импортируем для округления
import math  # Импортируем для логарифмической интерполяции


class Printer(models.Model):
    """
    Модель "Принтер" - хранит информацию о печатных устройствах
    
    Каждый принтер связан с форматом листа из приложения sheet_formats
    """
    
    # Константы для выбора метода интерполяции (добавляем НОВОЕ поле)
    # Чтобы избежать конфликтов с другими приложениями, используем префикс devices_
    INTERPOLATION_LINEAR = 'linear'
    INTERPOLATION_LOGARITHMIC = 'logarithmic'
    INTERPOLATION_CHOICES = [
        (INTERPOLATION_LINEAR, 'Линейная интерполяция'),
        (INTERPOLATION_LOGARITHMIC, 'Логарифмическая интерполяция'),
    ]
    
    # Название принтера (уникальное)
    name = models.CharField(
        max_length=200,
        verbose_name='Название принтера',
        help_text='Введите уникальное название принтера',
        unique=True,
    )
    
    # Связь с форматом листа (ForeignKey вместо CharField)
    # При удалении формата устанавливаем защиту (нельзя удалить формат, если он используется)
    sheet_format = models.ForeignKey(
        SheetFormat,
        on_delete=models.PROTECT,  # Защита от удаления используемого формата
        verbose_name='Формат листа',
        help_text='Выберите формат листа из списка созданных форматов',
        related_name='printers',  # Обратная связь: формат.printers.all()
    )
    
    # Поля (незапечатываемые области) листа в миллиметрах
    margin_mm = models.IntegerField(
        verbose_name='Поля (мм)',
        help_text='Размер незапечатываемых полей листа в миллиметрах',
        default=5,  # Значение по умолчанию: 5 мм
        validators=[
            MinValueValidator(0),   # Минимальное значение: 0 мм
            MaxValueValidator(50),  # Максимальное значение: 50 мм
        ],
    )
    
    # Коэффициент увеличения при двусторонней печати
    duplex_coefficient = models.FloatField(
        verbose_name='Коэффициент двусторонней печати',
        help_text='Коэффициент увеличения при двусторонней печати',
        default=2.0,  # Значение по умолчанию: 2.0
        validators=[
            MinValueValidator(1.0),   # Минимальное значение: 1.0
            MaxValueValidator(10.0),  # Максимальное значение: 10.0
        ],
    )
    
    # НОВОЕ ПОЛЕ: Метод интерполяции для расчета стоимости (линейная или логарифмическая)
    # Используем devices_ в имени переменной, чтобы избежать конфликтов
    devices_interpolation_method = models.CharField(
        max_length=20,
        choices=INTERPOLATION_CHOICES,
        default=INTERPOLATION_LINEAR,  # Значение по умолчанию: линейная интерполяция
        verbose_name='Метод интерполяции',
        help_text='Выберите метод интерполяции для расчета стоимости при произвольном тираже',
    )
    
    # Дата и время создания записи (автоматически добавляется при создании)
    created_at = models.DateTimeField(
        auto_now_add=True,  # Автоматически устанавливается при создании
        verbose_name='Дата создания',
    )
    
    # Дата и время последнего обновления (автоматически обновляется)
    updated_at = models.DateTimeField(
        auto_now=True,  # Автоматически обновляется при сохранении
        verbose_name='Дата обновления',
    )
    
    # Метаданные модели
    class Meta:
        # Сортировка по умолчанию: по названию (A-Z)
        ordering = ['name']
        
        # Человеко-читаемые имена для админ-панели
        verbose_name = 'Принтер'
        verbose_name_plural = 'Принтеры'
        
        # Индексы для оптимизации запросов
        indexes = [
            models.Index(fields=['name']),  # Индекс для поиска по названию
            models.Index(fields=['sheet_format']),  # Индекс для фильтрации по формату
            models.Index(fields=['created_at']),  # Индекс для сортировки по дате
            models.Index(fields=['devices_interpolation_method']),  # Индекс для метода интерполяции
        ]
    
    def __str__(self):
        """
        Строковое представление объекта принтера
        
        Returns:
            str: Название принтера и связанного формата
        """
        return f"{self.name} ({self.sheet_format.name})"
    
    def get_dimensions_display(self):
        """
        Возвращает строку с размерами формата в читаемом виде
        
        Returns:
            str: Строка вида "320×450 мм"
        """
        return self.sheet_format.get_dimensions_display()
    
    def get_margin_display(self):
        """
        Возвращает строку с размерами полей
        
        Returns:
            str: Строка вида "5 мм"
        """
        return f"{self.margin_mm} мм"
    
    def get_duplex_display(self):
        """
        Возвращает строку с коэффициентом
        
        Returns:
            str: Строка вида "2.0"
        """
        # Если коэффициент целый, показываем без десятичной части
        if self.duplex_coefficient.is_integer():
            return f"{int(self.duplex_coefficient)}"
        else:
            # Иначе показываем с одним знаком после запятой
            return f"{self.duplex_coefficient:.1f}"
    
    def get_duplex_coefficient_formatted(self):
        """
        Возвращает коэффициент с фиксированным форматом для отображения в поле ввода
        Всегда показывает один знак после запятой
        
        Returns:
            str: Строка с коэффициентом в формате "2.0"
        """
        # Форматируем до одного знака после запятой, даже если число целое
        return f"{self.duplex_coefficient:.1f}"
    
    def get_interpolation_method_display_short(self):
        """
        Возвращает краткое отображение метода интерполяции для отображения в интерфейсе
        
        Returns:
            str: "Линейная" или "Логарифмическая"
        """
        if self.devices_interpolation_method == self.INTERPOLATION_LINEAR:
            return "Линейная"
        else:
            return "Логарифмическая"
    
def to_dict(self):
    """
    Преобразует объект принтера в словарь для передачи в JSON
    
    Returns:
        dict: Словарь с данными принтера
    """
    # Проверяем, существует ли связанный формат
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
        'sheet_format': sheet_format_info['name'],  # Только имя формата
        'sheet_format_id': sheet_format_info['id'],
        'sheet_format_dimensions': sheet_format_info['dimensions'],
        'margin_mm': self.margin_mm,
        'duplex_coefficient': float(self.duplex_coefficient),  # Преобразуем Decimal в float
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
        НОВЫЙ МЕТОД: Рассчитывает цену за лист для произвольного тиража
        Использует заданные точки из модели PrintPrice и выбранный метод интерполяции
        
        Args:
            copies (int): Произвольный тираж (количество копий)
            
        Returns:
            Decimal: Рассчитанная цена за лист для заданного тиража
                     Возвращает None, если нет данных для расчета
        """
        # Импортируем модель PrintPrice здесь, чтобы избежать циклических импортов
        from print_price.models import PrintPrice
        
        try:
            # Получаем все цены для этого принтера, отсортированные по тиражу
            print_prices = PrintPrice.objects.filter(
                printer=self
            ).order_by('copies')  # Сортируем по возрастанию тиража
            
            # Преобразуем в список кортежей (тираж, цена)
            price_points = [(pp.copies, pp.price_per_sheet) for pp in print_prices]
            
            # Если нет данных о ценах, возвращаем None
            if not price_points:
                return None
            
            # Если есть только одна точка, возвращаем ее цену
            if len(price_points) == 1:
                return price_points[0][1]
            
            # Находим две ближайшие точки для интерполяции
            # Ищем точку, где тираж меньше или равен заданному
            lower_point = None
            upper_point = None
            
            for copies_point, price_point in price_points:
                if copies_point <= copies:
                    lower_point = (copies_point, price_point)
                else:
                    upper_point = (copies_point, price_point)
                    break
            
            # Если заданный тираж меньше минимального
            if lower_point is None:
                # Берем две первые точки для экстраполяции вниз
                lower_point = price_points[0]
                upper_point = price_points[1]
            
            # Если заданный тираж больше максимального
            if upper_point is None:
                # Берем две последние точки для экстраполяции вверх
                lower_point = price_points[-2]
                upper_point = price_points[-1]
            
            # Разбираем найденные точки
            x1, y1 = lower_point  # x1 - тираж нижней точки, y1 - цена нижней точки
            x2, y2 = upper_point  # x2 - тираж верхней точки, y2 - цена верхней точки
            
            # Проверяем, что тиражи разные (чтобы избежать деления на ноль)
            if x1 == x2:
                # Если тиражи одинаковые, возвращаем цену из любой точки
                return y1
            
            # Выполняем интерполяцию в зависимости от выбранного метода
            if self.devices_interpolation_method == self.INTERPOLATION_LINEAR:
                # Линейная интерполяция: y = y1 + (x - x1) * (y2 - y1) / (x2 - x1)
                result = y1 + Decimal(copies - x1) * (y2 - y1) / Decimal(x2 - x1)
            else:
                # Логарифмическая интерполяция: y = y1 + (ln(x) - ln(x1)) * (y2 - y1) / (ln(x2) - ln(x1))
                # Проверяем, что тиражи положительные (логарифм определен только для положительных чисел)
                if x1 <= 0 or x2 <= 0 or copies <= 0:
                    # Если тираж не положительный, возвращаем None
                    return None
                
                # Выполняем логарифмическую интерполяцию
                ln_x1 = Decimal(math.log(x1))
                ln_x2 = Decimal(math.log(x2))
                ln_x = Decimal(math.log(copies))
                
                result = y1 + (ln_x - ln_x1) * (y2 - y1) / (ln_x2 - ln_x1)
            
            # Округляем результат до 2 знаков после запятой
            return result.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
            
        except Exception as e:
            # В случае любой ошибки возвращаем None
            print(f"Ошибка при расчете цены для принтера {self.id}: {str(e)}")
            return None
    
    def save(self, *args, **kwargs):
        """
        Переопределяем метод сохранения для дополнительной логики
        
        Важно: округляем duplex_coefficient до одного знака после запятой
        для стабильного отображения в HTML-поле input type="number"
        """
        # Округляем коэффициент до одного знака после запятой
        # Это решает проблему с плавающей точкой (например, 2.0 может сохраняться как 1.999999999)
        self.duplex_coefficient = round(self.duplex_coefficient, 1)
        
        # Дополнительная валидация
        if self.margin_mm < 0:
            raise ValueError("Поля не могут быть отрицательными")
        
        if self.duplex_coefficient < 1.0:
            raise ValueError("Коэффициент не может быть меньше 1.0")
        
        # Вызываем оригинальный метод save
        super().save(*args, **kwargs)