"""
models.py
Модели базы данных для приложения counter.
Здесь определяем структуру таблиц и бизнес-логику работы с данными.
"""

from django.db import models
from django.utils import timezone
from datetime import timedelta


class Client(models.Model):
    """
    Модель для хранения информации о клиентах типографии.
    Каждый клиент может иметь несколько заказов.
    """
    
    # Название клиента (название компании или ФИО)
    name = models.CharField(
        max_length=200,
        verbose_name='Название клиента',
        help_text='Полное название компании или ФИО'
    )
    
    # Контактный телефон
    phone = models.CharField(
        max_length=20,
        blank=True,
        verbose_name='Телефон',
        help_text='Контактный телефон в формате +7 (XXX) XXX-XX-XX'
    )
    
    # Email клиента
    email = models.EmailField(
        max_length=100,
        blank=True,
        verbose_name='Email',
        help_text='Электронная почта для связи'
    )
    
    # Флаг электронного документооборота
    # Если True - клиент работает через ЭДО
    uses_edo = models.BooleanField(
        default=False,
        verbose_name='Работает через ЭДО',
        help_text='Отметьте, если с клиентом ведется электронный документооборот'
    )
    
    # Дополнительные заметки о клиенте
    notes = models.TextField(
        blank=True,
        verbose_name='Дополнительная информация',
        help_text='Дополнительные сведения о клиенте'
    )
    
    # Дата создания записи
    created_at = models.DateTimeField(
        auto_now_add=True,
        verbose_name='Дата создания'
    )
    
    # Дата последнего обновления
    updated_at = models.DateTimeField(
        auto_now=True,
        verbose_name='Дата обновления'
    )
    
    class Meta:
        ordering = ['name']  # Сортировка по имени по алфавиту
        verbose_name = 'Клиент'
        verbose_name_plural = 'Клиенты'
        indexes = [
            models.Index(fields=['name']),  # Индекс для быстрого поиска по имени
            models.Index(fields=['uses_edo']),  # Индекс для фильтрации по ЭДО
        ]
    
    def __str__(self):
        """Строковое представление клиента."""
        edo_marker = " [ЭДО]" if self.uses_edo else ""
        return f"{self.name}{edo_marker}"
    
    def to_dict(self):
        """Преобразует объект клиента в словарь для JSON."""
        return {
            'id': self.id,
            'name': self.name,
            'phone': self.phone,
            'email': self.email,
            'uses_edo': self.uses_edo,
            'notes': self.notes,
            'created_at': self.created_at.strftime('%d.%m.%Y %H:%M'),
        }


class Order(models.Model):
    """
    Модель Order (Заказ) - основная сущность системы.
    Хранит всю информацию о заказе в типографии.
    """
    
    # ===== СТАТУСЫ ЗАКАЗА =====
    STATUS_ACCEPTED = 'accepted'
    STATUS_IN_PROGRESS = 'in_progress'
    STATUS_READY = 'ready'
    STATUS_COMPLETED = 'completed'
    
    STATUS_CHOICES = [
        (STATUS_ACCEPTED, 'Принят'),
        (STATUS_IN_PROGRESS, 'В работе'),
        (STATUS_READY, 'Готов'),
        (STATUS_COMPLETED, 'Выдан'),
    ]
    
    # ===== ПОЛЯ МОДЕЛИ =====
    
    order_number = models.AutoField(
        primary_key=True,
        db_column='order_number',
        verbose_name='Номер заказа'
    )
    
    # Связь с моделью клиента - теперь это основной способ указания клиента
    client = models.ForeignKey(
        Client,
        on_delete=models.SET_NULL,
        null=True,
        blank=False,  # Изменяем на False? Нет, оставляем True для обратной совместимости
        verbose_name='Клиент',
        help_text='Выберите клиента из базы данных'
    )
    
    # Поле для ручного ввода имени клиента
    # ВАЖНО: Оставляем поле для обратной совместимости, но оно больше не используется
    customer_name = models.CharField(
        max_length=100,
        blank=True,
        verbose_name='Имя клиента (ручной ввод)',
        help_text='Используйте это поле, если клиента нет в базе данных'
    )
    
    description = models.TextField(
        verbose_name='Описание заказа'
    )
    
    ready_datetime = models.DateTimeField(
        help_text="Когда должен быть готов заказ",
        verbose_name='Дата готовности'
    )
    
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default=STATUS_ACCEPTED,
        verbose_name='Статус заказа'
    )
    
    created_at = models.DateTimeField(
        auto_now_add=True,
        verbose_name='Дата создания'
    )
    
    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Заказ'
        verbose_name_plural = 'Заказы'
    
    def __str__(self):
        """Строковое представление заказа."""
        # Теперь всегда используем client, так как ручной ввод убран
        if self.client:
            client_name = self.client.name
        else:
            # Для старых заказов может быть customer_name
            client_name = self.customer_name or "Без клиента"
        
        status_display = dict(self.STATUS_CHOICES).get(self.status, self.status)
        return f"#{self.order_number:04d} - {client_name} ({status_display})"
    
    def get_client_display(self):
        """Возвращает отображаемое имя клиента."""
        # Теперь всегда используем client из базы данных
        if self.client:
            return self.client.name
        # Для обратной совместимости со старыми заказами
        return self.customer_name
    
    def get_working_hours_remaining(self):
        """Рассчитывает количество рабочих часов до готовности заказа."""
        now = timezone.now()
        ready_dt = self.ready_datetime
        
        if now >= ready_dt:
            return 0
        
        total_hours = 0
        current = now
        
        while current < ready_dt:
            day_of_week = current.weekday()
            hour = current.hour
            
            if day_of_week < 5 and 10 <= hour < 18:
                total_hours += 1
            
            current += timedelta(hours=1)
        
        return total_hours
    
    def is_active(self):
        """Проверяет, является ли заказ активным (не выполненным)."""
        return self.status != self.STATUS_COMPLETED
    
    def get_status_display_name(self):
        """Возвращает читаемое название статуса на русском языке."""
        status_dict = dict(self.STATUS_CHOICES)
        return status_dict.get(self.status, self.status)
    
    def to_dict(self):
        """Преобразует объект заказа в словарь для передачи через JSON."""
        # Получаем данные клиента (теперь всегда из базы)
        client_data = None
        if self.client:
            client_data = self.client.to_dict()
        
        return {
            'order_number': f'{self.order_number:04d}',
            'client': client_data,
            'customer_name': self.customer_name,
            'client_display': self.get_client_display(),
            'description': self.description,
            'ready_datetime': self.ready_datetime.strftime('%d.%m.%Y %H:%M'),
            'working_hours_remaining': self.get_working_hours_remaining(),
            'created_at': self.created_at.strftime('%d.%m.%Y %H:%M:%S'),
            'status': self.status,
            'status_display': self.get_status_display_name(),
            'is_active': self.is_active(),
        }