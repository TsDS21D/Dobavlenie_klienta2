"""
forms.py
Формы Django для аутентификации пользователей и работы с данными.
"""

from django import forms
from django.contrib.auth.forms import AuthenticationForm
from django.contrib.auth.models import User
from .models import Client, Order


class LoginForm(AuthenticationForm):
    """
    Форма для входа пользователя в систему.
    """
    
    username = forms.CharField(
        label='Имя пользователя',
        widget=forms.TextInput(attrs={
            'class': 'form-control',
            'placeholder': 'Введите имя пользователя',
            'autofocus': True
        }),
        max_length=150,
    )
    
    password = forms.CharField(
        label='Пароль',
        widget=forms.PasswordInput(attrs={
            'class': 'form-control',
            'placeholder': 'Введите пароль'
        }),
        strip=False,
    )
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        
        self.error_messages = {
            'invalid_login': 'Неверное имя пользователя или пароль.',
            'inactive': 'Аккаунт неактивен.',
        }
    
    class Meta:
        model = User
        fields = ['username', 'password']


class RegistrationForm(forms.ModelForm):
    """
    Форма для регистрации новых пользователей.
    """
    
    password1 = forms.CharField(
        label='Пароль',
        widget=forms.PasswordInput(attrs={
            'class': 'form-control',
            'placeholder': 'Введите пароль'
        }),
        min_length=8,
        help_text='Минимум 8 символов'
    )
    
    password2 = forms.CharField(
        label='Подтверждение пароля',
        widget=forms.PasswordInput(attrs={
            'class': 'form-control',
            'placeholder': 'Повторите пароль'
        }),
        help_text='Введите пароль еще раз для подтверждения'
    )
    
    email = forms.EmailField(
        label='Email',
        widget=forms.EmailInput(attrs={
            'class': 'form-control',
            'placeholder': 'Введите email'
        }),
        required=True
    )
    
    class Meta:
        model = User
        fields = ['username', 'email', 'first_name', 'last_name']
        widgets = {
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
        labels = {
            'username': 'Имя пользователя',
            'first_name': 'Имя',
            'last_name': 'Фамилия',
        }
    
    def clean_username(self):
        username = self.cleaned_data.get('username')
        
        if User.objects.filter(username=username).exists():
            raise forms.ValidationError('Пользователь с таким именем уже существует.')
        
        return username
    
    def clean_email(self):
        email = self.cleaned_data.get('email')
        
        if User.objects.filter(email=email).exists():
            raise forms.ValidationError('Пользователь с таким email уже существует.')
        
        return email
    
    def clean_password2(self):
        password1 = self.cleaned_data.get('password1')
        password2 = self.cleaned_data.get('password2')
        
        if password1 and password2 and password1 != password2:
            raise forms.ValidationError('Пароли не совпадают.')
        
        return password2
    
    def save(self, commit=True):
        user = super().save(commit=False)
        user.set_password(self.cleaned_data['password1'])
        
        if commit:
            user.save()
        
        return user


class ClientForm(forms.ModelForm):
    """
    Форма для добавления и редактирования клиентов.
    """
    
    class Meta:
        model = Client
        fields = ['name', 'phone', 'email', 'uses_edo', 'notes']
        widgets = {
            'name': forms.TextInput(attrs={
                'class': 'form-control',
                'placeholder': 'Название компании или ФИО',
                'required': True
            }),
            'phone': forms.TextInput(attrs={
                'class': 'form-control',
                'placeholder': '+7 (999) 123-45-67'
            }),
            'email': forms.EmailInput(attrs={
                'class': 'form-control',
                'placeholder': 'email@example.com'
            }),
            'uses_edo': forms.CheckboxInput(attrs={
                'class': 'form-check-input'
            }),
            'notes': forms.Textarea(attrs={
                'class': 'form-control',
                'placeholder': 'Дополнительная информация о клиенте',
                'rows': 3
            }),
        }
        labels = {
            'name': 'Название клиента*',
            'phone': 'Телефон',
            'email': 'Email',
            'uses_edo': 'Работает через ЭДО',
            'notes': 'Дополнительная информация',
        }
        help_texts = {
            'name': 'Обязательное поле',
            'phone': 'Формат: +7 (XXX) XXX-XX-XX',
        }
    
    def clean_phone(self):
        phone = self.cleaned_data.get('phone', '').strip()
        
        if phone and not any(char.isdigit() for char in phone):
            raise forms.ValidationError('Телефон должен содержать цифры')
        
        return phone
    
    def clean_email(self):
        email = self.cleaned_data.get('email', '').strip()
        
        if email and Client.objects.filter(email=email).exists():
            if self.instance and self.instance.email == email:
                return email
            raise forms.ValidationError('Клиент с таким email уже существует')
        
        return email