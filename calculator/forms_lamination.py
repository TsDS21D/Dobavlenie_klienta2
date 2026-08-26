# calculator/forms_lamination.py
from django import forms
from .models_lamination import Laminate


class LaminateForm(forms.ModelForm):
    """Форма для создания/обновления ламинации через AJAX."""
    class Meta:
        model = Laminate
        fields = ['is_enabled', 'laminator', 'film']
        widgets = {
            'is_enabled': forms.CheckboxInput(attrs={'class': 'lamination-toggle'}),
            'laminator': forms.Select(attrs={'class': 'laminator-select'}),
            'film': forms.Select(attrs={'class': 'film-select'}),
        }