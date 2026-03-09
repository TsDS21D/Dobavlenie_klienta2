"""
urls.py для приложения spravochnik_dopolnitelnyh_rabot.
Добавлены маршруты для работы с опорными точками цен (WorkPrice) и методом интерполяции.
"""

from django.urls import path
from . import views

app_name = 'spravochnik_dopolnitelnyh_rabot'

urlpatterns = [
    # Главная страница справочника
    path('', views.index, name='index'),

    # API для работы с работами (существующие)
    path('api/create/', views.create_work, name='create'),
    path('api/update/<int:work_id>/', views.update_work, name='update'),
    path('api/get/<int:work_id>/', views.get_work, name='get_work'),
    path('delete/<int:work_id>/', views.delete_work, name='delete'),

    # ===== НОВЫЕ МАРШРУТЫ ДЛЯ ОПОРНЫХ ТОЧЕК ЦЕН (WorkPrice) =====
    # Создание новой опорной точки
    path('api/work_price/create/', views.create_work_price, name='create_work_price'),
    # Обновление существующей опорной точки (inline-редактирование)
    path('api/work_price/update/<int:price_id>/', views.update_work_price, name='update_work_price'),
    # Удаление опорной точки
    path('work_price/delete/<int:price_id>/', views.delete_work_price, name='delete_work_price'),

    # ===== НОВЫЕ МАРШРУТЫ ДЛЯ ИНТЕРПОЛЯЦИИ =====
    # Обновление метода интерполяции для работы
    path('api/update_interpolation_method/<int:work_id>/', views.update_work_interpolation_method, name='update_work_interpolation_method'),
    # Расчёт цены для произвольного количества листов
    path('api/calculate_arbitrary_price/<int:work_id>/', views.calculate_arbitrary_sheets_price, name='calculate_arbitrary_sheets_price'),
]