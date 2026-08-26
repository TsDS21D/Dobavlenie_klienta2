"""
Маршруты для многостраничных API.
"""

from django.urls import path
from . import multipage_views

app_name = 'vichisliniya_listov_multipage'

urlpatterns = [
    path('bindings/', multipage_views.multipage_get_bindings, name='bindings'),
    path('get/<int:print_component_id>/', multipage_views.multipage_get_data, name='get_data'),
    path('save/', multipage_views.multipage_save_data, name='save_data'),
    path('calculate/<int:print_component_id>/', multipage_views.multipage_calculate, name='calculate'),
    path('calculate/<int:print_component_id>/<int:copies>/', multipage_views.multipage_calculate, name='calculate_with_copies'),
    path('delete/', multipage_views.multipage_delete_data, name='delete_data'),
]