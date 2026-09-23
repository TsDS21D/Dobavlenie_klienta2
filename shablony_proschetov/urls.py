# shablony_proschetov/urls.py
"""
URL-маршруты приложения "Справочник шаблонов просчётов" (shablony_proschetov).

Префикс URL задаётся в корневом urls.py проекта (clickcounter/urls.py).
Здесь описаны только внутренние маршруты приложения.

app_name = 'shablony_proschetov' даёт пространство имён.
В шаблонах можно писать: {% url 'shablony_proschetov:index' %}
"""

from django.urls import path
from . import views

# Пространство имён приложения.
# Позволяет избежать конфликтов имён маршрутов между приложениями.
app_name = 'shablony_proschetov'

urlpatterns = [
    # Главная страница справочника — дерево категорий и шаблонов.
    path('', views.index, name='index'),

    # AJAX: превью шаблона по id.
    path('api/template/<int:template_id>/preview/', views.template_preview, name='template_preview'),

    # AJAX: создание просчёта из шаблона.
    path('api/template/<int:template_id>/create-proschet/', views.create_proschet, name='create_proschet'),

    # AJAX: категории (только для админа).
    path('api/category/create/', views.category_create, name='category_create'),
    path('api/category/<int:category_id>/rename/', views.category_rename, name='category_rename'),
    path('api/category/<int:category_id>/delete/', views.category_delete, name='category_delete'),

    # AJAX: сохранить просчёт как шаблон.
    path('api/save-from-proschet/', views.save_from_proschet, name='save_from_proschet'),

    # AJAX: переименование и изменение комментария шаблона.
    path('api/template/<int:template_id>/update/', views.template_update, name='template_update'),   
    # AJAX: удаление шаблона.
    path('api/template/<int:template_id>/delete/', views.template_delete, name='template_delete'),
     

]