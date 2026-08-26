"""
apps.py для приложения spravochnik_dopolnitelnyh_rabot.

Здесь определяется конфигурация приложения и подключаются сигналы.
"""

from django.apps import AppConfig


class SpravochnikDopolnitelnyhRabotConfig(AppConfig):
    """
    Класс конфигурации приложения. Django автоматически использует его
    для настройки приложения (имя, путь и т.д.).
    """

    # Тип поля для автоматических первичных ключей (рекомендовано Django 3.2+)
    default_auto_field = 'django.db.models.BigAutoField'

    # Полное имя приложения (путь в проекте)
    name = 'spravochnik_dopolnitelnyh_rabot'

    # Человеко-понятное имя, отображаемое в админке
    verbose_name = 'Справочник дополнительных работ'

    def ready(self):
        """
        Метод ready вызывается Django после того, как все модели приложения загружены.
        Здесь нужно импортировать модуль signals, чтобы сигналы были зарегистрированы.
        """
        # Импортируем модуль signals данного приложения.
        # Это необходимо для того, чтобы декоратор @receiver выполнился
        # и подключил функцию update_related_additional_works к сигналу post_save.
        import spravochnik_dopolnitelnyh_rabot.signals