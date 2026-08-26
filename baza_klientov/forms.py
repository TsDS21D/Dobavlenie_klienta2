"""
forms.py для приложения baza_klientov
Формы для добавления и редактирования клиентов и контактных лиц
ИЗМЕНЕНИЕ: Убрана валидация на обязательные контакты для ContactPersonForm
"""

from django import forms
from django.core.validators import MinValueValidator, MaxValueValidator
from .models import Client, ContactPerson


class ClientForm(forms.ModelForm):
    """
    Форма для создания и редактирования клиента
    
    Используется для основной информации о клиенте
    """
    
    # Название организации или ФИО
    name = forms.CharField(
        max_length=255,
        label='Название/ФИО*',
        help_text='Введите полное наименование организации или ФИО физического лица',
        widget=forms.TextInput(attrs={
            'class': 'form-control',
            'id': 'client-name',
            'placeholder': 'Например: ООО "Ромашка" или Иванов Иван Иванович',
        })
    )
    
    # Адрес (текстовое поле)
    address = forms.CharField(
        label='Адрес',
        required=False,  # Не обязательное поле
        help_text='Введите юридический и фактический адрес',
        widget=forms.Textarea(attrs={
            'class': 'form-control',
            'id': 'client-address',
            'rows': 3,
            'placeholder': 'Например: г. Москва, ул. Ленина, д. 1, оф. 101',
        })
    )
    
    # Банковские реквизиты
    bank_details = forms.CharField(
        label='Банковские реквизиты',
        required=False,
        help_text='Введите расчетный счет, БИК, банк и другие реквизиты',
        widget=forms.Textarea(attrs={
            'class': 'form-control',
            'id': 'client-bank-details',
            'rows': 4,
            'placeholder': 'Например: ИНН 1234567890, КПП 123456789, р/с 40702810100000012345 в ПАО "Сбербанк", БИК 044525225',
        })
    )
    
    # Скидка
    discount = forms.IntegerField(
        label='Скидка (%)',
        initial=0,  # Значение по умолчанию
        help_text='Введите размер скидки от 0 до 100 процентов',
        min_value=0,
        max_value=100,
        widget=forms.NumberInput(attrs={
            'class': 'form-control',
            'id': 'client-discount',
            'placeholder': '0',
        })
    )
    
    # ЭДО (чекбокс)
    has_edo = forms.BooleanField(
        label='Электронный документооборот (ЭДО)',
        required=False,  # Не обязательное поле
        help_text='Отметьте, если клиент работает через электронный документооборот',
        widget=forms.CheckboxInput(attrs={
            'class': 'form-check-input',
            'id': 'client-has-edo',
        })
    )
    
    class Meta:
        """Метаданные формы - связь с моделью Client"""
        model = Client
        fields = ['name', 'address', 'bank_details', 'discount', 'has_edo']
    
    def clean_discount(self):
        """Дополнительная валидация поля скидки"""
        discount = self.cleaned_data.get('discount')
        
        # Проверяем, что скидка в допустимом диапазоне
        if discount < 0 or discount > 100:
            raise forms.ValidationError("Скидка должна быть в диапазоне от 0 до 100%")
        
        return discount


class ContactPersonForm(forms.ModelForm):
    """
    Форма для создания и редактирования контактного лица
    
    Используется для добавления контактных лиц к клиенту
    ИЗМЕНЕНИЕ: Убрана валидация на обязательные контакты
    Теперь контактное лицо можно добавить только с ФИО
    """
    
    # ФИО контактного лица (единственное обязательное поле)
    full_name = forms.CharField(
        max_length=255,
        label='ФИО*',
        help_text='Введите полное имя контактного лица',
        widget=forms.TextInput(attrs={
            'class': 'form-control',
            'id': 'contact-full-name',
            'placeholder': 'Например: Петров Петр Петрович',
        })
    )
    
    # Должность (не обязательное поле)
    position = forms.CharField(
        max_length=255,
        label='Должность',
        required=False,  # Не обязательное поле
        help_text='Введите должность контактного лица',
        widget=forms.TextInput(attrs={
            'class': 'form-control',
            'id': 'contact-position',
            'placeholder': 'Например: Менеджер по продажам',
        })
    )
    
    # Телефон (не обязательное поле)
    phone = forms.CharField(
        max_length=50,
        label='Телефон',
        required=False,  # Не обязательное поле
        help_text='Введите стационарный телефон с кодом города',
        widget=forms.TextInput(attrs={
            'class': 'form-control',
            'id': 'contact-phone',
            'placeholder': 'Например: +7 (495) 123-45-67',
        })
    )
    
    # Мобильный телефон (не обязательное поле)
    mobile = forms.CharField(
        max_length=50,
        label='Сотовый',
        required=False,  # Не обязательное поле
        help_text='Введите мобильный телефон',
        widget=forms.TextInput(attrs={
            'class': 'form-control',
            'id': 'contact-mobile',
            'placeholder': 'Например: +7 (900) 123-45-67',
        })
    )
    
    # Email (не обязательное поле)
    email = forms.EmailField(
        label='E-mail',
        required=False,  # Не обязательное поле
        help_text='Введите адрес электронной почты',
        widget=forms.EmailInput(attrs={
            'class': 'form-control',
            'id': 'contact-email',
            'placeholder': 'Например: petrov@example.com',
        })
    )
    
    # Комментарии (не обязательное поле)
    comments = forms.CharField(
        label='Комментарии',
        required=False,  # Не обязательное поле
        help_text='Дополнительная информация о контактном лице',
        widget=forms.Textarea(attrs={
            'class': 'form-control',
            'id': 'contact-comments',
            'rows': 2,
            'placeholder': 'Любая дополнительная информация',
        })
    )
    
    # Основное контактное лицо (не обязательное поле)
    is_primary = forms.BooleanField(
        label='Основное контактное лицо',
        required=False,  # Не обязательное поле
        help_text='Отметьте, если это основное контактное лицо',
        widget=forms.CheckboxInput(attrs={
            'class': 'form-check-input',
            'id': 'contact-is-primary',
        })
    )
    
    class Meta:
        """Метаданные формы - связь с моделью ContactPerson"""
        model = ContactPerson
        fields = ['full_name', 'position', 'phone', 'mobile', 'email', 'comments', 'is_primary']
    
    # ИЗМЕНЕНИЕ: Убрана валидация на обязательные контакты
    # Теперь форма проходит валидацию даже если нет телефона, email и т.д.
    # Остается только проверка на обязательное поле full_name (делается автоматически)


class ClientInlineUpdateForm(forms.ModelForm):
    """
    Форма для быстрого редактирования клиента (in-line редактирование)
    
    Используется для редактирования полей прямо в таблице через AJAX
    """
    
    class Meta:
        model = Client
        fields = ['name', 'discount', 'has_edo']
    
    def __init__(self, *args, **kwargs):
        """
        Инициализация формы - настройка полей для in-line редактирования
        """
        super().__init__(*args, **kwargs)
        
        # Настраиваем поле названия
        self.fields['name'].widget = forms.TextInput(attrs={
            'class': 'inline-edit-input client-name-input',
            'placeholder': 'Введите название',
        })
        
        # Настраиваем поле скидки
        self.fields['discount'].widget = forms.NumberInput(attrs={
            'class': 'inline-edit-input discount-input',
            'min': 0,
            'max': 100,
            'step': 1,
        })
        
        # Настраиваем поле ЭДО (чекбокс)
        self.fields['has_edo'].widget = forms.CheckboxInput(attrs={
            'class': 'inline-edit-checkbox edo-checkbox',
        })


class ContactPersonInlineUpdateForm(forms.ModelForm):
    """
    Форма для быстрого редактирования контактного лица (in-line редактирование)
    
    ИСПРАВЛЕНИЕ: Добавлена новая форма для in-line редактирования контактов
    """
    
    class Meta:
        model = ContactPerson
        fields = ['full_name', 'position', 'phone', 'mobile', 'email', 'comments', 'is_primary']
    
    def __init__(self, *args, **kwargs):
        """
        Инициализация формы - настройка полей для in-line редактирования
        """
        super().__init__(*args, **kwargs)
        
        # Настраиваем все поля для in-line редактирования
        # ФИО
        self.fields['full_name'].widget = forms.TextInput(attrs={
            'class': 'inline-edit-input contact-full-name-input',
            'placeholder': 'Введите ФИО',
        })
        
        # Должность
        self.fields['position'].widget = forms.TextInput(attrs={
            'class': 'inline-edit-input contact-position-input',
            'placeholder': 'Введите должность',
        })
        
        # Телефон
        self.fields['phone'].widget = forms.TextInput(attrs={
            'class': 'inline-edit-input contact-phone-input',
            'placeholder': 'Введите телефон',
        })
        
        # Сотовый
        self.fields['mobile'].widget = forms.TextInput(attrs={
            'class': 'inline-edit-input contact-mobile-input',
            'placeholder': 'Введите сотовый',
        })
        
        # Email
        self.fields['email'].widget = forms.EmailInput(attrs={
            'class': 'inline-edit-input contact-email-input',
            'placeholder': 'Введите email',
        })
        
        # Комментарии (текстовое поле)
        self.fields['comments'].widget = forms.Textarea(attrs={
            'class': 'inline-edit-textarea contact-comments-textarea',
            'placeholder': 'Введите комментарии',
            'rows': 2,
        })
        
        # Основное контактное лицо (чекбокс)
        self.fields['is_primary'].widget = forms.CheckboxInput(attrs={
            'class': 'inline-edit-checkbox contact-is-primary-checkbox',
        })