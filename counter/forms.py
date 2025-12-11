"""
forms.py
Формы Django для ввода данных пользователями.
Используются для валидации и отображения HTML форм.
"""

from django import forms
from django.contrib.auth.forms import AuthenticationForm
from django.contrib.auth.models import User


class LoginForm(AuthenticationForm):
    """
    Форма для входа пользователя в систему.
    Наследуется от стандартной формы AuthenticationForm Django.
    """
    
    # Переопределяем поля для добавления атрибутов и классов CSS
    username = forms.CharField(
        label='Имя пользователя',  # Текст метки поля
        widget=forms.TextInput(attrs={  # Виджет для отображения поля
            'class': 'form-control',  # CSS класс для стилизации
            'placeholder': 'Введите имя пользователя',  # Текст-подсказка
            'autofocus': True  # Автоматический фокус на поле при загрузке
        }),
        max_length=150,  # Максимальная длина имени пользователя
        required=True  # Поле обязательно для заполнения
    )
    
    password = forms.CharField(
        label='Пароль',
        widget=forms.PasswordInput(attrs={  # Виджет для поля пароля (скрывает ввод)
            'class': 'form-control',
            'placeholder': 'Введите пароль'
        }),
        required=True
    )
    
    def __init__(self, *args, **kwargs):
        """
        Конструктор формы. Вызывается при создании экземпляра формы.
        Здесь мы можем настроить дополнительные параметры.
        """
        super().__init__(*args, **kwargs)
        
        # Убираем стандартные сообщения об ошибках Django
        # Мы будем показывать свои сообщения в шаблоне
        self.error_messages['invalid_login'] = 'Неверное имя пользователя или пароль.'
        
    class Meta:
        """
        Метаданные формы.
        Определяют модель и поля для работы.
        """
        model = User  # Модель, с которой работает форма
        fields = ['username', 'password']  # Поля, которые использует форма


class RegistrationForm(forms.ModelForm):
    """
    Форма для регистрации новых пользователей.
    Наследуется от ModelForm для работы с моделью User.
    """
    
    # Дополнительные поля для подтверждения пароля
    password1 = forms.CharField(
        label='Пароль',
        widget=forms.PasswordInput(attrs={
            'class': 'form-control',
            'placeholder': 'Введите пароль'
        }),
        min_length=8,  # Минимальная длина пароля
        help_text='Минимум 8 символов'  # Подсказка под полем
    )
    
    password2 = forms.CharField(
        label='Подтверждение пароля',
        widget=forms.PasswordInput(attrs={
            'class': 'form-control',
            'placeholder': 'Повторите пароль'
        }),
        help_text='Введите пароль еще раз для подтверждения'
    )
    
    # Поле email для пользователя
    email = forms.EmailField(
        label='Email',
        widget=forms.EmailInput(attrs={
            'class': 'form-control',
            'placeholder': 'Введите email'
        }),
        required=True
    )
    
    class Meta:
        """
        Метаданные формы регистрации.
        """
        model = User  # Работаем с моделью User Django
        fields = ['username', 'email', 'first_name', 'last_name']  # Поля из модели
        widgets = {  # Виджеты для полей модели
            'username': forms.TextInput(attrs={
                'class': 'form-control',
                'placeholder': 'Введите имя пользователя'
            }),
            'first_name': forms.TextInput(attrs={
                'class': 'form-control',
                'placeholder': 'Введите имя'
            }),
            'last_name': forms.TextInput(attrs={
                'class': 'form-control',
                'placeholder': 'Введите фамилию'
            }),
        }
        labels = {  # Человекочитаемые названия полей
            'username': 'Имя пользователя',
            'first_name': 'Имя',
            'last_name': 'Фамилия',
        }
    
    def clean_username(self):
        """
        Валидация имени пользователя.
        Проверяет, что имя пользователя не занято.
        """
        username = self.cleaned_data.get('username')
        
        # Проверяем, существует ли пользователь с таким именем
        if User.objects.filter(username=username).exists():
            raise forms.ValidationError('Пользователь с таким именем уже существует.')
        
        return username
    
    def clean_email(self):
        """
        Валидация email.
        Проверяет, что email не занят.
        """
        email = self.cleaned_data.get('email')
        
        # Проверяем, существует ли пользователь с таким email
        if User.objects.filter(email=email).exists():
            raise forms.ValidationError('Пользователь с таким email уже существует.')
        
        return email
    
    def clean_password2(self):
        """
        Валидация подтверждения пароля.
        Проверяет, что пароли совпадают.
        """
        password1 = self.cleaned_data.get('password1')
        password2 = self.cleaned_data.get('password2')
        
        # Проверяем, что пароли не пустые и совпадают
        if password1 and password2 and password1 != password2:
            raise forms.ValidationError('Пароли не совпадают.')
        
        return password2
    
    def save(self, commit=True):
        """
        Сохранение пользователя.
        Создает пользователя с хешированным паролем.
        """
        # Создаем пользователя, но пока не сохраняем в БД
        user = super().save(commit=False)
        
        # Устанавливаем хешированный пароль
        user.set_password(self.cleaned_data['password1'])
        
        # Сохраняем пользователя в БД, если commit=True
        if commit:
            user.save()
        
        return user