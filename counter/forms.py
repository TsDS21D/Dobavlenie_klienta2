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