"""
Файл apps.py для приложения vichisliniya_listov.
Этот файл содержит конфигурацию приложения Django.
"""

from django.apps import AppConfig


class VichisliniyaListovConfig(AppConfig):
    # Уникальное имя приложения (должно совпадать с именем папки приложения)
    default_auto_field = 'django.db.models.BigAutoField'
    # Имя приложения, которое будет отображаться в админке
    name = 'vichisliniya_listov'
    # Человекочитаемое имя приложения (отображается в админке)
    verbose_name = 'Вычисления листов'