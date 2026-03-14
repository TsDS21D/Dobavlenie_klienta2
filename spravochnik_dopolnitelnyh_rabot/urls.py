"""
urls.py для приложения spravochnik_dopolnitelnyh_rabot.
Добавлены маршруты для работы с опорными точками цен (WorkPrice и WorkCirculationPrice)
и методом интерполяции.
"""

from django.urls import path
from . import views

app_name = 'spravochnik_dopolnitelnyh_rabot'

urlpatterns = [
    # Главная страница справочника
    path('', views.index, name='index'),

    # API для работы с работами
    path('api/create/', views.create_work, name='create'),
    path('api/update/<int:work_id>/', views.update_work, name='update'),
    path('api/get/<int:work_id>/', views.get_work, name='get_work'),
    path('delete/<int:work_id>/', views.delete_work, name='delete'),

    # Опорные точки по листам (WorkPrice)
    path('api/work_price/create/', views.create_work_price, name='create_work_price'),
    path('api/work_price/update/<int:price_id>/', views.update_work_price, name='update_work_price'),
    path('work_price/delete/<int:price_id>/', views.delete_work_price, name='delete_work_price'),

    # ===== НОВЫЕ МАРШРУТЫ ДЛЯ ОПОРНЫХ ТОЧЕК ПО ТИРАЖУ (WorkCirculationPrice) =====
    path('api/circulation_price/create/', views.create_circulation_price, name='create_circulation_price'),
    path('api/circulation_price/update/<int:price_id>/', views.update_circulation_price, name='update_circulation_price'),
    path('circulation_price/delete/<int:price_id>/', views.delete_circulation_price, name='delete_circulation_price'),

    # Метод интерполяции
    path('api/update_interpolation_method/<int:work_id>/', views.update_work_interpolation_method, name='update_work_interpolation_method'),

    # Расчёт для произвольного количества листов
    path('api/calculate_arbitrary_price/<int:work_id>/', views.calculate_arbitrary_sheets_price, name='calculate_arbitrary_sheets_price'),

    # ===== НОВЫЙ МАРШРУТ: расчёт для произвольного тиража =====
    path('api/calculate_arbitrary_circulation_price/<int:work_id>/', views.calculate_arbitrary_circulation_price, name='calculate_arbitrary_circulation_price'),
]