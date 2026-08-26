"""
urls.py для приложения devices

Этот файл определяет все URL-маршруты (эндпоинты) приложения devices.
Каждый маршрут связывает определённый URL с view-функцией (обработчиком).

Пространство имён 'devices' позволяет использовать в шаблонах обратные ссылки вида:
{% url 'devices:index' %}, {% url 'devices:delete_printer' printer.id %} и т.д.

Все маршруты доступны по префиксу /devices/ (основной URLconf проекта включает их).
"""

# Импортируем функцию path из модуля django.urls.
# path — основной способ определения маршрутов в Django (начиная с версии 2.0).
from django.urls import path

# Импортируем все view-функции из текущего приложения (devices.views).
# Звёздочка означает импорт всего, что определено в __all__ модуля views.
# В нашем случае это функции: index, delete_printer, update_printer,
# delete_laminator, update_laminator.
from . import views

# Пространство имён приложения.
# Оно нужно, чтобы различать URL с одинаковыми именами в разных приложениях.
# Например, в шаблоне можно написать {% url 'devices:index' %} и Django поймёт,
# что нужен именно index из devices, а не из другого приложения.
app_name = 'devices'

# Список URL-паттернов (маршрутов) приложения.
# Каждый элемент — это вызов функции path().
urlpatterns = [
    # ---------- Главная страница (объединяет принтеры и ламинаторы) ----------
    # URL: /devices/ (пустая строка после префикса)
    # Вызывается view-функция views.index.
    # Имя маршрута: 'index' — используется для обратной ссылки в шаблонах.
    path('', views.index, name='index'),

    # ---------- Маршруты для работы с принтерами ----------
    # Удаление принтера по его ID.
    # Пример URL: /devices/printer/delete/5/
    # <int:printer_id> — динамический сегмент, который преобразуется в целое число
    # и передаётся в view-функцию как параметр printer_id.
    path('printer/delete/<int:printer_id>/', views.delete_printer, name='delete_printer'),

    # Обновление принтера (AJAX-запрос из inline-редактирования).
    # URL: /devices/printer/update/5/
    # Данные передаются методом POST в формате JSON или обычных полей формы.
    path('printer/update/<int:printer_id>/', views.update_printer, name='update_printer'),

    # ---------- Маршруты для работы с ламинаторами ----------
    # Удаление ламинатора по его ID.
    # URL: /devices/laminator/delete/3/
    path('laminator/delete/<int:laminator_id>/', views.delete_laminator, name='delete_laminator'),

    # Обновление ламинатора (AJAX-запрос).
    # URL: /devices/laminator/update/3/
    path('laminator/update/<int:laminator_id>/', views.update_laminator, name='update_laminator'),
]

# Примечание: в этом файле нет отдельных маршрутов для страниц типа /devices/laminators/,
# потому что оба раздела (принтеры и ламинаторы) отображаются на одной главной странице
# с помощью единой view-функции index. Поэтому достаточно только маршрутов для AJAX-операций
# и удаления, которые вызываются из этой же страницы.