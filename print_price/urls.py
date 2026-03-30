"""
urls.py для приложения print_price
Маршруты для работы с ценами на печать (принтеры) и ламинирование (ламинаторы).
"""

from django.urls import path
from . import views

app_name = 'print_price'

urlpatterns = [
    # --- Принтеры (существующие) ---
    path('', views.index, name='index'),
    path('api/create/', views.create_print_price, name='create_print_price'),
    path('api/update/<int:price_id>/', views.update_print_price, name='update_print_price'),
    path('delete/<int:price_id>/', views.delete_print_price, name='delete_print_price'),
    path('api/update_interpolation_method/<int:printer_id>/', views.update_printer_interpolation_method, name='update_printer_interpolation_method'),
    path('api/calculate_arbitrary_price/<int:printer_id>/', views.calculate_arbitrary_copies_price, name='calculate_arbitrary_copies_price'),

    # --- Ламинаторы (новые) ---
    path('laminators/', views.laminator_index, name='laminator_index'),
    path('laminators/api/create/', views.create_laminator_price, name='create_laminator_price'),
    path('laminators/api/update/<int:price_id>/', views.update_laminator_price, name='update_laminator_price'),
    path('laminators/delete/<int:price_id>/', views.delete_laminator_price, name='delete_laminator_price'),
    path('laminators/api/update_interpolation_method/<int:laminator_id>/', views.update_laminator_interpolation_method, name='update_laminator_interpolation_method'),
    path('laminators/api/calculate_arbitrary_price/<int:laminator_id>/', views.calculate_arbitrary_laminator_price, name='calculate_arbitrary_laminator_price'),
    # Список ламинаторов для выпадающего списка в калькуляторе
    path('laminators/api/get_laminators/', views.get_laminators_list, name='get_laminators_list'),
]