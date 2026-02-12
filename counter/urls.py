"""
counter/urls.py
URL-маршруты для приложения counter.
ДОБАВЛЕНЫ МАРШРУТЫ ДЛЯ ЭКСПОРТА В EXCEL И РЕЗЕРВНОГО КОПИРОВАНИЯ.
"""

from django.urls import path
from . import views

urlpatterns = [
    path('', views.index, name='index'),
    path('login/', views.login_view, name='login'),
    path('logout/', views.logout_view, name='logout'),
    
    # ===== НОВЫЕ МАРШРУТЫ =====
    # Экспорт заказов в Excel
    path('orders/export/excel/', views.export_orders_excel, name='export_orders_excel'),
    
    # Скачать резервную копию БД (JSON)
    path('backup/download/', views.backup_download, name='backup_download'),
    
    # Загрузить резервную копию и восстановить БД (POST)
    path('backup/upload/', views.backup_upload, name='backup_upload'),
]