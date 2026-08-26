"""
urls.py для приложения sklad
Добавлены URL для AJAX-загрузки материалов и данных категорий.
"""

from django.urls import path
from . import views

app_name = 'sklad'

urlpatterns = [
    # Главная страница
    path('', views.index, name='index'),
    
    # AJAX API
    path('api/category/<int:category_id>/', views.get_category_data, name='get_category_data'),
    path('api/category/all/', views.get_all_materials, name='get_all_materials'),
    path('api/category/<int:category_id>/children/', views.get_category_children, name='get_category_children'),
    path('category/tree/', views.get_category_tree, name='get_category_tree'),
    path('material/update/<int:material_id>/', views.update_material, name='update_material'),
    path('api/categories/for-form/', views.get_categories_for_form, name='categories_for_form'),
    path('api/test/<int:category_id>/', views.test_api, name='test_api'),
    
    # Создание
    path('category/create/', views.create_category, name='create_category'),
    path('material/create/', views.create_material, name='create_material'),
    
    # Удаление
    path('category/delete/<int:category_id>/', views.delete_category, name='delete_category'),
    path('material/delete/<int:material_id>/', views.delete_material, name='delete_material'),
    path('api/films/', views.get_films_list, name='get_films_list'),
]