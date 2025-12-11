"""
models.py
Модели базы данных для приложения counter.
Здесь определяем структуру таблиц и бизнес-логику работы с данными.
"""

from django.db import models
from django.utils import timezone
from datetime import timedelta


class Order(models.Model):
    """
    Модель Order (Заказ) - основная сущность системы.
    Хранит всю информацию о заказе в типографии.
    """
    
    # ===== СТАТУСЫ ЗАКАЗА =====
    # Константы для статусов заказа, чтобы избежать "магических строк" в коде
    STATUS_ACCEPTED = 'accepted'      # Заказ принят, но работа еще не начата
    STATUS_IN_PROGRESS = 'in_progress'  # Заказ в процессе выполнения
    STATUS_READY = 'ready'            # Заказ готов к выдаче
    STATUS_COMPLETED = 'completed'    # Заказ выдан клиенту (выполнен)
    
    # Кортеж вариантов для поля status
    # Каждый элемент кортежа - это кортеж из двух элементов:
    # (значение_в_базе_данных, читаемое_название_для_пользователя)
    STATUS_CHOICES = [
        (STATUS_ACCEPTED, 'Принят'),          # Клиент оформил заказ
        (STATUS_IN_PROGRESS, 'В работе'),     # Мастера работают над заказом
        (STATUS_READY, 'Готов'),              # Заказ выполнен, можно забирать
        (STATUS_COMPLETED, 'Выдан'),          # Клиент получил заказ
    ]
    
    # ===== ПОЛЯ МОДЕЛИ =====
    
    # order_number - уникальный номер заказа
    # AutoField - автоматически увеличивающееся целое число
    # primary_key=True - это поле является первичным ключом таблицы
    # db_column='order_number' - явно указываем имя колонки в БД
    order_number = models.AutoField(
        primary_key=True, 
        db_column='order_number',
        verbose_name='Номер заказа'  # Читаемое название для админ-панели
    )
    
    # customer_name - имя клиента
    # CharField - поле для строк с ограниченной длиной
    # max_length=100 - максимальная длина 100 символов
    customer_name = models.CharField(
        max_length=100,
        verbose_name='Имя клиента'
    )
    
    # description - описание заказа
    # TextField - поле для длинного текста без ограничения длины (в пределах БД)
    description = models.TextField(
        verbose_name='Описание заказа'
    )
    
    # ready_datetime - дата и время готовности заказа
    # DateTimeField - поле для хранения даты и времени
    # help_text - подсказка, которая отображается в форме админ-панели
    ready_datetime = models.DateTimeField(
        help_text="Когда должен быть готов заказ",
        verbose_name='Дата готовности'
    )
    
    # status - текущий статус заказа
    # CharField с choices - поле с ограниченным набором значений
    # max_length=20 - максимальная длина строки статуса
    # choices=STATUS_CHOICES - ограничиваем возможные значения списком STATUS_CHOICES
    # default=STATUS_ACCEPTED - значение по умолчанию при создании нового заказа
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default=STATUS_ACCEPTED,
        verbose_name='Статус заказа'
    )
    
    # created_at - дата и время создания заказа
    # auto_now_add=True - автоматически устанавливается в текущее время
    # при создании объекта (не изменяется при обновлении)
    created_at = models.DateTimeField(
        auto_now_add=True,
        verbose_name='Дата создания'
    )
    
    class Meta:
        """
        Класс Meta содержит метаданные модели.
        Не влияет на структуру таблицы, но влияет на поведение модели.
        """
        # ordering - порядок сортировки по умолчанию при запросе объектов
        # ['-created_at'] - сортировка по убыванию даты создания (новые сверху)
        ordering = ['-created_at']
        
        # verbose_name - человекочитаемое название модели в единственном числе
        verbose_name = 'Заказ'
        
        # verbose_name_plural - название модели во множественном числе
        verbose_name_plural = 'Заказы'
    
    def __str__(self):
        """
        Магический метод __str__ возвращает строковое представление объекта.
        Используется в админ-панели Django и при выводе в консоли.
        
        Формат: "#0001 - Иван Иванов (Принят)"
        """
        status_display = dict(self.STATUS_CHOICES).get(self.status, self.status)
        return f"#{self.order_number:04d} - {self.customer_name} ({status_display})"
    
    def get_working_hours_remaining(self):
        """
        Рассчитывает количество РАБОЧИХ часов до готовности заказа.
        Рабочее время: понедельник-пятница с 10:00 до 18:00.
        
        Алгоритм:
        1. Берём текущее время (now) и время готовности заказа (ready_dt)
        2. Если текущее время уже позже времени готовности - возвращаем 0
        3. Итеративно проходим каждый час от now до ready_dt
        4. Если час попадает в рабочий день и рабочее время - считаем его
        
        Возвращает: целое число - количество оставшихся рабочих часов
        """
        # timezone.now() - текущее время с учётом часового пояса проекта
        now = timezone.now()
        
        # Время, к которому должен быть готов заказ
        ready_dt = self.ready_datetime
        
        # Если срок уже прошёл - осталось 0 часов
        if now >= ready_dt:
            return 0
        
        # Счётчик рабочих часов
        total_hours = 0
        
        # Начинаем отсчёт с текущего времени
        current = now
        
        # Цикл по каждому часу от now до ready_dt
        while current < ready_dt:
            # current.weekday() возвращает день недели: 0=понедельник, 6=воскресенье
            day_of_week = current.weekday()
            
            # current.hour возвращает час от 0 до 23
            hour = current.hour
            
            # Проверяем, рабочий ли это час:
            # 1. День недели с понедельника по пятницу (0-4)
            # 2. Час с 10:00 до 17:00 (включительно, 18:00 уже не рабочий)
            if day_of_week < 5 and 10 <= hour < 18:
                total_hours += 1  # Это рабочий час
            
            # Переходим к следующему часу
            # timedelta(hours=1) - интервал в 1 час
            current += timedelta(hours=1)
        
        return total_hours
    
    def is_active(self):
        """
        Проверяет, является ли заказ активным (не выполненным).
        Активными считаются заказы со статусами: принят, в работе, готов.
        
        Возвращает: True если заказ активный, False если выполнен
        """
        return self.status != self.STATUS_COMPLETED
    
    def get_status_display_name(self):
        """
        Возвращает читаемое название статуса на русском языке.
        Использует словарь STATUS_CHOICES для преобразования.
        
        Возвращает: строку с названием статуса
        """
        # dict(self.STATUS_CHOICES) создаёт словарь:
        # {'accepted': 'Принят', 'in_progress': 'В работе', ...}
        status_dict = dict(self.STATUS_CHOICES)
        
        # .get() возвращает значение по ключу или само значение, если ключа нет
        return status_dict.get(self.status, self.status)
    
    def to_dict(self):
        """
        Преобразует объект заказа в словарь для передачи через JSON.
        Этот метод используется WebSocket для отправки данных клиенту.
        
        Возвращает: словарь с полями заказа
        """
        return {
            # Форматируем номер заказа с ведущими нулями (4 цифры)
            'order_number': f'{self.order_number:04d}',
            
            # Имя клиента
            'customer_name': self.customer_name,
            
            # Описание заказа
            'description': self.description,
            
            # Дата готовности в формате "день.месяц.год часы:минуты"
            'ready_datetime': self.ready_datetime.strftime('%d.%m.%Y %H:%M'),
            
            # Количество оставшихся рабочих часов
            'working_hours_remaining': self.get_working_hours_remaining(),
            
            # Дата создания в формате "день.месяц.год часы:минуты:секунды"
            'created_at': self.created_at.strftime('%d.%m.%Y %H:%M:%S'),
            
            # Текущий статус заказа (значение из базы данных)
            'status': self.status,
            
            # Читаемое название статуса на русском языке
            'status_display': self.get_status_display_name(),
            
            # Флаг, является ли заказ активным (для удобства на фронтенде)
            'is_active': self.is_active(),
        }