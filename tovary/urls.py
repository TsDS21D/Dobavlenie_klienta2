# tovary/urls.py
"""
URL-маршруты приложения "tovary" (Справочник товаров + Дерево категорий).
"""

from django.urls import path
from . import views

app_name = 'tovary'

urlpatterns = [
    # Главная страница: дерево + список товаров.
    path('', views.index, name='index'),

    # Товары.
    path('tovar/<int:tovar_id>/update/', views.update_tovar, name='update_tovar'),
    path('tovar/<int:tovar_id>/delete/', views.delete_tovar, name='delete_tovar'),

    # Категории.
    path('category/create/', views.category_create, name='category_create'),
    path('category/<int:category_id>/update/', views.category_update, name='category_update'),
    path('category/<int:category_id>/delete/', views.category_delete, name='category_delete'),

    path('tovar/<int:tovar_id>/move/', views.api_move_tovar, name='api_move_tovar'),
    path('tovar/<int:tovar_id>/update-field/', views.api_update_tovar_field, name='api_update_tovar_field'),
]