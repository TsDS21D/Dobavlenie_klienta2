"""
urls.py для приложения sklad
Добавлены URL для AJAX-загрузки материалов и данных категорий.
"""

# sklad/urls.py
"""
URL-маршруты приложения "sklad" (Склад материалов).
"""
from django.urls import path
from . import views

app_name = 'sklad'

urlpatterns = [
    # Главная страница (рендер шаблона)
    path('', views.index, name='index'),

    # Управление материалами
    # Маршрут create_material удалён — создание происходит через POST на главную (index)
    path('material/<int:material_id>/update-field/', views.api_update_material_field, name='api_update_material_field'),
    path('material/<int:material_id>/update-category/', views.api_update_material_category, name='api_update_material_category'),
    path('material/<int:material_id>/delete/', views.delete_material, name='delete_material'),
    path('materials/update-order/', views.api_update_materials_order, name='api_update_materials_order'),

    # Управление категориями
    path('category/create/', views.category_create, name='category_create'),
    path('category/<int:category_id>/update/', views.category_update, name='category_update'),
    path('category/<int:category_id>/delete/', views.category_delete, name='category_delete'),

    # Для других приложений (получение списка плёнок)
    path('api/films/', views.get_films_list, name='get_films_list'),
]