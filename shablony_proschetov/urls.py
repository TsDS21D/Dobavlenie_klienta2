# shablony_proschetov/urls.py
"""
URL-маршруты приложения "Справочник шаблонов просчётов" (shablony_proschetov).

Префикс URL задаётся в корневом urls.py проекта (clickcounter/urls.py).
Здесь описаны только внутренние маршруты приложения.

app_name = 'shablony_proschetov' даёт пространство имён.
В шаблонах можно писать: {% url 'shablony_proschetov:index' %}

ЛОГИКА (по образцу sklad):
- Категории — form-POST + редирект (messages + flash).
- Шаблоны — инлайн-редактирование одного поля через JSON,
  сохранение порядка и смена категории — через JSON (drag-and-drop),
  удаление — form-POST через модалку.
- Создание/превью/«Сохранить из просчёта» — AJAX (как раньше).
"""

from django.urls import path
from . import views

# Пространство имён приложения.
# Позволяет избежать конфликтов имён маршрутов между приложениями.
app_name = 'shablony_proschetov'

urlpatterns = [
    # Главная страница справочника — дерево категорий и список шаблонов.
    path('', views.index, name='index'),

    # ==== ШАБЛОНЫ: чтение и AJAX-действия ====

    # AJAX: превью шаблона по id (используется при раскрытии карточки-аккордеона).
    path('api/template/<int:template_id>/preview/', views.template_preview, name='template_preview'),

    # AJAX: создание просчёта из шаблона.
    path('api/template/<int:template_id>/create-proschet/', views.create_proschet, name='create_proschet'),

    # AJAX: сохранить просчёт как шаблон (панель ?proschet_id=).
    path('api/save-from-proschet/', views.save_from_proschet, name='save_from_proschet'),

    # Инлайн-обновление одного поля шаблона (name / comment / circulation / category_id).
    # Аналог sklad:api_update_material_field.
    path('template/<int:template_id>/update-field/', views.api_update_template_field, name='api_update_template_field'),

    # Смена категории шаблона перетаскиванием на узел дерева.
    # Аналог sklad:api_update_material_category.
    path('template/<int:template_id>/update-category/', views.api_update_template_category, name='api_update_template_category'),

    # Сохранение нового порядка шаблонов (drag-and-drop внутри списка).
    # Аналог sklad:api_update_materials_order.
    path('templates/update-order/', views.api_update_templates_order, name='api_update_templates_order'),

    # Удаление шаблона через модалку (form-POST).
    path('template/<int:template_id>/delete/', views.template_delete, name='template_delete'),

    # ==== КАТЕГОРИИ: form-POST + редирект (как в sklad) ====

    path('category/create/', views.category_create, name='category_create'),
    path('category/<int:category_id>/update/', views.category_update, name='category_update'),
    path('category/<int:category_id>/delete/', views.category_delete, name='category_delete'),
]