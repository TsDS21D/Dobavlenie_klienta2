# calculator/forms.py
"""
Формы для приложения Calculator.
Содержит формы для работы с моделями просчётов.
"""

from django import forms
from django.core.validators import MinValueValidator
from .models_list_proschet import Proschet


class ProschetForm(forms.ModelForm):
    """
    Форма для создания и редактирования просчётов.
    Включает поле тиража между названием и клиентом.
    ИСПРАВЛЕНО: поле тиража сделано необязательным.
    """
    
    class Meta:
        model = Proschet
        fields = ['title', 'circulation', 'client']  # ДОБАВЛЕНО: circulation
        
        # Настройка виджетов для полей
        widgets = {
            'title': forms.TextInput(attrs={
                'class': 'form-control',
                'placeholder': 'Введите название просчёта',
                'required': True,
            }),
            'circulation': forms.NumberInput(attrs={  # ДОБАВЛЕНО: Виджет для тиража
                'class': 'form-control',
                'placeholder': 'Введите тираж (необязательно)',
                'min': 1,  # Минимальное значение 1 (если указано)
            }),
            'client': forms.Select(attrs={
                'class': 'form-control',
                'placeholder': 'Выберите клиента',
            }),
        }
        
        # Настройка лейблов полей
        labels = {
            'title': 'Название просчёта:',
            'circulation': 'Тираж (необязательно):',  # ИСПРАВЛЕНО: указано, что необязательно
            'client': 'Клиент:',
        }
        
        # Настройка сообщений помощи
        help_texts = {
            'title': 'Краткое описание заказа',
            'circulation': 'Количество экземпляров продукции. Может быть пустым.',  # ИСПРАВЛЕНО: пояснение
            'client': 'Клиент, для которого выполняется просчёт',
        }
    
    def __init__(self, *args, **kwargs):
        """
        Инициализация формы с дополнительными настройками.
        """
        super().__init__(*args, **kwargs)
        
        # Поле circulation НЕ является обязательным
        self.fields['circulation'].required = False
        
        # Если у формы есть экземпляр (редактирование существующего просчёта)
        if self.instance and self.instance.pk:
            # Устанавливаем текущее значение тиража
            self.initial['circulation'] = self.instance.circulation
    
    def clean_circulation(self):
        """
        Валидация поля тиража.
        Разрешаем пустое значение или положительное целое число.
        """
        circulation = self.cleaned_data.get('circulation')
        
        # Если поле пустое - разрешаем (возвращаем None)
        if circulation in ['', None]:
            return None
        
        # Если значение указано, проверяем, что это положительное число
        try:
            circulation_value = int(circulation)
            if circulation_value < 1:
                raise forms.ValidationError('Тираж должен быть положительным числом (не менее 1)')
            return circulation_value
        except (ValueError, TypeError):
            raise forms.ValidationError('Тираж должен быть целым числом')
    
    def save(self, commit=True):
        """
        Сохранение формы с дополнительной логикой.
        """
        # Получаем экземпляр модели, но пока не сохраняем в базу
        proschet = super().save(commit=False)
        
        # Устанавливаем тираж из очищенных данных формы (может быть None)
        proschet.circulation = self.cleaned_data.get('circulation')
        
        # Если commit=True, сохраняем в базу данных
        if commit:
            proschet.save()
            self.save_m2m()  # Сохраняем связи many-to-many, если они есть
        
        return proschet