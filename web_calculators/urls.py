# web_calculators/urls.py
"""
URL-маршруты приложения "Веб-калькуляторы".
Все маршруты встраиваются под префиксом /web-calc/ (см. clickcounter/urls.py).
"""
from django.urls import path
from . import views

app_name = 'web_calculators'

urlpatterns = [
    # Публичная HTML-страница калькулятора.
    path('<slug:slug>/', views.web_calculator_view, name='calculator'),

    # API: опции и расчёт.
    path('api/<slug:slug>/options/', views.web_calculator_options_api, name='options_api'),
    path('api/<slug:slug>/price/', views.web_calculator_price_api, name='price_api'),

    # API: создание просчёта из веб-калькулятора (только для сотрудников).
    path('api/<slug:slug>/create-proschet/',
         views.web_calculator_create_proschet_api,
         name='create_proschet_api'),
]