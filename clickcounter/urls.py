"""
clickcounter/urls.py
Главный файл URL-маршрутов проекта.
Определяет, какие URL ведут к каким приложениям.
"""

# Импортируем необходимые модули Django
from django.contrib import admin  # Модуль административной панели
from django.urls import path, include  # Функции для работы с URL
from django.conf import settings  # Настройки проекта
from django.conf.urls.static import static  # Функция для обслуживания статических файлов
from django.views.generic.base import RedirectView  # Класс для перенаправления
from counter import views as counter_views  # Импортируем views из counter

# Список URL-шаблонов проекта
urlpatterns = [
    # Перенаправление с корневого URL на страницу управления заказами
    # permanent=True означает постоянное перенаправление (код 301)
    path('', RedirectView.as_view(url='/counter/', permanent=True)),
    
    # Административная панель Django (доступна по адресу /admin/)
    path('admin/', admin.site.urls),
    
    # URL-адреса приложения counter (Управление заказами)
    # Все URL, начинающиеся с /counter/, будут обрабатываться в counter.urls
    path('counter/', include('counter.urls')),
    
    # URL-адреса нового приложения calculator (Калькулятор заказов)
    # Все URL, начинающиеся с /calculator/, будут обрабатываться в calculator.urls
    # namespace='calculator' позволяет обращаться к URL по имени с префиксом 'calculator:'
    path('calculator/', include(('calculator.urls', 'calculator'), namespace='calculator')),

    # НОВЫЙ МАРШРУТ: подключаем URL приложения product_templates
    # Все URL, начинающиеся с /product_templates/, будут обрабатываться в product_templates.urls
    # namespace='product_templates' позволяет обращаться к URL по имени с префиксом 'product_templates:'
    path('product_templates/', include(('product_templates.urls', 'product_templates'), namespace='product_templates')),

    # НОВОЕ ПРИЛОЖЕНИЕ: directories (справочники)
    # Все URL, начинающиеся с /directories/, передаются на обработку в directories.urls
    # namespace='directories' создает пространство имен для этого приложения
    # В шаблонах можно использовать: {% url 'directories:index' %}
    path('directories/', include(('directories.urls', 'directories'), namespace='directories')),

    # НОВОЕ ПРИЛОЖЕНИЕ: devices (устройства)
    # Все URL, начинающиеся с /devices/, передаются на обработку в devices.urls
    # namespace='devices' создает пространство имен для этого приложения
    # В шаблонах можно использовать: {% url 'devices:index' %}
    path('devices/', include(('devices.urls', 'devices'), namespace='devices')),

    # НОВОЕ ПРИЛОЖЕНИЕ: sheet_formats (форматы печатных листов)
    # Все URL, начинающиеся с /sheet_formats/, передаются на обработку в sheet_formats.urls
    # namespace='sheet_formats' создает пространство имен для этого приложения
    # В шаблонах можно использовать: {% url 'sheet_formats:index' %}
    path('sheet_formats/', include(('sheet_formats.urls', 'sheet_formats'), namespace='sheet_formats')),

    # Новое приложение: sklad (Склад бумаги)
    path('sklad/', include(('sklad.urls', 'sklad'), namespace='sklad')),

    path('print_price/', include('print_price.urls')),

     # База клиентов
    path('baza_klientov/', include(('baza_klientov.urls', 'baza_klientov'), namespace='baza_klientov')),

    # Маршруты для аутентификации пользователей
    # Вход в систему - используем кастомную view из приложения counter
    path('login/', counter_views.login_view, name='login'),
    
    # Выход из системы - используем кастомную view из приложения counter
    path('logout/', counter_views.logout_view, name='logout'),
]

# В режиме отладки добавляем обслуживание статических и медиа файлов
if settings.DEBUG:
    # static() добавляет маршруты для обслуживания статических файлов
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)