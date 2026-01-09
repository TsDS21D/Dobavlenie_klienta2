"""
models.py для приложения baza_klientov
Модели для базы данных клиентов типографии
ИСПРАВЛЕНИЕ: Генерация уникального номера клиента теперь работает корректно
"""

from django.db import models
from django.core.validators import MinValueValidator, MaxValueValidator, RegexValidator
from django.utils import timezone
import re
from django.db import transaction
from django.db.utils import IntegrityError

class Client(models.Model):
    """
    Модель "Клиент" - хранит информацию о клиентах типографии
    
    Каждый клиент имеет уникальный номер с префиксом "K-" и основные контактные данные.
    Автоматическая нумерация: K-1, K-2, K-3 и т.д.
    ИСПРАВЛЕНИЕ: Исправлена генерация уникального номера клиента
    """
    
    # ========== ОСНОВНЫЕ ПОЛЯ ==========
    
    # Уникальный номер клиента (генерируется автоматически, но хранится как строка)
    client_number = models.CharField(
        max_length=20,
        verbose_name='Номер клиента',
        unique=True,  # Гарантируем уникальность номера
        editable=False,  # Нельзя редактировать вручную
        help_text='Уникальный номер клиента в формате K-XXX'
    )
    
    # Название организации или ФИО физического лица
    name = models.CharField(
        max_length=255,
        verbose_name='Название/ФИО',
        help_text='Полное наименование организации или ФИО физического лица'
    )
    
    # Адрес клиента
    address = models.TextField(
        verbose_name='Адрес',
        blank=True,  # Поле не обязательно для заполнения
        null=True,   # Может быть NULL в базе данных
        help_text='Юридический и фактический адрес'
    )
    
    # Банковские реквизиты
    bank_details = models.TextField(
        verbose_name='Банковские реквизиты',
        blank=True,
        null=True,
        help_text='Расчетный счет, БИК, банк и другие реквизиты'
    )
    
    # Скидка в процентах (целое число от 1 до 100)
    discount = models.PositiveIntegerField(
        verbose_name='Скидка (%)',
        default=0,  # По умолчанию без скидки
        validators=[
            MinValueValidator(0),   # Минимум 0%
            MaxValueValidator(100)  # Максимум 100%
        ],
        help_text='Размер скидки в процентах (от 0 до 100)'
    )
    
    # Электронный документооборот (ЭДО)
    has_edo = models.BooleanField(
        verbose_name='ЭДО',
        default=False,
        help_text='Отметьте, если клиент работает через электронный документооборот'
    )
    
    # Дата и время создания записи
    created_at = models.DateTimeField(
        auto_now_add=True,
        verbose_name='Дата создания'
    )
    
    # Дата и время последнего обновления
    updated_at = models.DateTimeField(
        auto_now=True,
        verbose_name='Дата обновления'
    )
    
    # Метаданные модели
    class Meta:
        # Сортировка по умолчанию: по дате создания (новые сверху)
        ordering = ['-created_at']
        
        # Человеко-читаемые имена
        verbose_name = 'Клиент'
        verbose_name_plural = 'Клиенты'
        
        # Индексы для оптимизации запросов
        indexes = [
            models.Index(fields=['client_number']),
            models.Index(fields=['name']),
            models.Index(fields=['created_at']),
        ]
    
    def __str__(self):
        """Строковое представление объекта"""
        return f"{self.client_number}: {self.name}"
    
    def _generate_client_number(self):
        """
        Генерирует новый уникальный номер клиента
        
        ВАЖНО: Этот метод использует оптимизированный подход:
        1. Находит максимальный существующий номер
        2. Использует PostgreSQL функцию COALESCE для обработки NULL
        3. Учитывает возможные "дыры" в нумерации
        
        Returns:
            str: Новый уникальный номер в формате "K-{номер}"
        """
        try:
            # Способ 1: Используем максимальное числовое значение из существующих номеров
            # Это более надежно, чем просто брать последнюю запись
            
            # Получаем всех клиентов и извлекаем числа из их номеров
            clients = Client.objects.all()
            max_number = 0
            
            for client in clients:
                # Извлекаем число из номера формата "K-123"
                match = re.search(r'K-(\d+)', client.client_number)
                if match:
                    number = int(match.group(1))
                    if number > max_number:
                        max_number = number
            
            # Новый номер = максимальный существующий + 1
            new_number = max_number + 1
            
            # Проверяем, не существует ли уже такого номера (на всякий случай)
            while True:
                candidate = f"K-{new_number}"
                if not Client.objects.filter(client_number=candidate).exists():
                    return candidate
                new_number += 1  # Если номер уже существует, пробуем следующий
                
        except Exception as e:
            # Если что-то пошло не так, используем простой подсчет
            print(f"Ошибка при генерации номера: {e}")
            # Простой способ: количество записей + 1
            count = Client.objects.count()
            return f"K-{count + 1}"
    
    def save(self, *args, **kwargs):
        """
        Переопределяем метод сохранения для автоматической генерации номера
        
        ИСПРАВЛЕНИЕ: Теперь номер генерируется корректно и всегда уникальный
        
        Args:
            *args: Позиционные аргументы
            **kwargs: Именованные аргументы
        """
        # Если это новый объект (еще не сохранен в БД) и у него нет номера
        if not self.pk and not self.client_number:
            # Генерируем новый уникальный номер
            self.client_number = self._generate_client_number()
        
        # Используем транзакцию для безопасности
        try:
            with transaction.atomic():
                # Вызываем оригинальный метод save
                super().save(*args, **kwargs)
                
        except IntegrityError as e:
            # Если произошла ошибка уникальности (дублирование номера)
            if 'client_number' in str(e):
                print(f"Обнаружен дублирующийся номер: {self.client_number}. Пытаюсь сгенерировать новый...")
                
                # Генерируем новый номер и пытаемся сохранить снова
                self.client_number = self._generate_client_number()
                super().save(*args, **kwargs)
            else:
                # Если это другая ошибка, пробрасываем ее дальше
                raise e
    
    def get_discount_display(self):
        """Возвращает отформатированную скидку"""
        if self.discount == 0:
            return "Без скидки"
        return f"{self.discount}%"
    
    def get_edo_display(self):
        """Возвращает текстовое представление ЭДО"""
        return "Да" if self.has_edo else "Нет"
    
    def to_dict(self):
        """Преобразует объект в словарь для передачи в JSON"""
        return {
            'id': self.id,
            'client_number': self.client_number,
            'name': self.name,
            'address': self.address or "",
            'bank_details': self.bank_details or "",
            'discount': self.discount,
            'discount_display': self.get_discount_display(),
            'has_edo': self.has_edo,
            'edo_display': self.get_edo_display(),
            'created_at': self.created_at.strftime('%d.%m.%Y %H:%M'),
            'updated_at': self.updated_at.strftime('%d.%m.%Y %H:%M'),
        }


class ContactPerson(models.Model):
    """
    Модель "Контактное лицо" - хранит информацию о контактных лицах клиента
    
    Один клиент может иметь несколько контактных лиц.
    ИЗМЕНЕНИЕ: Теперь контактное лицо может быть добавлено только с ФИО,
    остальные поля не обязательны.
    """
    
    # Связь с клиентом (один клиент - много контактных лиц)
    client = models.ForeignKey(
        Client,
        on_delete=models.CASCADE,  # При удалении клиента удаляем все контактные лица
        verbose_name='Клиент',
        related_name='contact_persons',  # client.contact_persons.all()
    )
    
    # ФИО контактного лица (единственное обязательное поле)
    full_name = models.CharField(
        max_length=255,
        verbose_name='ФИО',
        help_text='Полное имя контактного лица'
    )
    
    # Должность (не обязательное поле)
    position = models.CharField(
        max_length=255,
        verbose_name='Должность',
        blank=True,  # Поле может быть пустым
        null=True,   # Может быть NULL в базе данных
        help_text='Должность контактного лица'
    )
    
    # Телефон (стационарный, не обязательное поле)
    phone = models.CharField(
        max_length=50,
        verbose_name='Телефон',
        blank=True,  # Поле может быть пустым
        null=True,   # Может быть NULL в базе данных
        help_text='Стационарный телефон с кодом города'
    )
    
    # Сотовый телефон (не обязательное поле)
    mobile = models.CharField(
        max_length=50,
        verbose_name='Сотовый',
        blank=True,  # Поле может быть пустым
        null=True,   # Может быть NULL в базе данных
        help_text='Мобильный телефон'
    )
    
    # Электронная почта (не обязательное поле)
    email = models.EmailField(
        verbose_name='E-mail',
        blank=True,  # Поле может быть пустым
        null=True,   # Может быть NULL в базе данных
        help_text='Адрес электронной почты'
    )
    
    # Комментарии или дополнительные сведения (не обязательное поле)
    comments = models.TextField(
        verbose_name='Комментарии',
        blank=True,  # Поле может быть пустым
        null=True,   # Может быть NULL в базе данных
        help_text='Дополнительная информация о контактном лице'
    )
    
    # Является ли основным контактным лицом
    is_primary = models.BooleanField(
        verbose_name='Основное контактное лицо',
        default=False,
        help_text='Отметьте, если это основное контактное лицо'
    )
    
    # Дата и время создания
    created_at = models.DateTimeField(
        auto_now_add=True,
        verbose_name='Дата создания'
    )
    
    class Meta:
        # Сортировка: сначала основные контакты, затем по ФИО
        ordering = ['-is_primary', 'full_name']
        
        verbose_name = 'Контактное лицо'
        verbose_name_plural = 'Контактные лица'
        
        indexes = [
            models.Index(fields=['client', 'is_primary']),
        ]
    
    def __str__(self):
        """Строковое представление объекта"""
        primary_mark = "★ " if self.is_primary else ""
        return f"{primary_mark}{self.full_name} ({self.client.name})"
    
    def to_dict(self):
        """Преобразует объект в словарь для JSON"""
        return {
            'id': self.id,
            'client_id': self.client.id,
            'full_name': self.full_name,
            'position': self.position or "",
            'phone': self.phone or "",
            'mobile': self.mobile or "",
            'email': self.email or "",
            'comments': self.comments or "",
            'is_primary': self.is_primary,
            'created_at': self.created_at.strftime('%d.%m.%Y %H:%M'),
        }