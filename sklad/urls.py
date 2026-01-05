"""
urls.py для приложения sklad
ДОБАВЛЕНЫ: URL для AJAX-загрузки материалов и данных категорий
"""

from django.urls import path
from . import views

app_name = 'sklad'

urlpatterns = [
    # Главная страница (только для первоначальной загрузки)
    path('', views.index, name='index'),
    
    # AJAX API для беcперезагрузочной работы
    path('api/category/<int:category_id>/', views.get_category_data, name='get_category_data'),
    path('api/category/all/', views.get_all_materials, name='get_all_materials'),
    
    # Получение подкатегорий для информационного блока
    path('api/category/<int:category_id>/children/', views.get_category_children, name='get_category_children'),


    # Древовидная структура (AJAX)
    path('category/tree/', views.get_category_tree, name='get_category_tree'),
    
    # AJAX-обновление материала (для inline-редактирования)
    path('material/update/<int:material_id>/', views.update_material, name='update_material'),

    path('api/categories/for-form/', views.get_categories_for_form, name='categories_for_form'),
    path('api/test/<int:category_id>/', views.test_api, name='test_api'),
    
    # Создание
    path('category/create/', views.create_category, name='create_category'),
    path('material/create/', views.create_material, name='create_material'),
    
    # Удаление
    path('category/delete/<int:category_id>/', views.delete_category, name='delete_category'),
    path('material/delete/<int:material_id>/', views.delete_material, name='delete_material'),
]