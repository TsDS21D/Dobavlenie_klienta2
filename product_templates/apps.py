from django.apps import AppConfig

# Настройки приложения product_templates
class ProductTemplatesConfig(AppConfig):
    # Уникальное имя приложения (используется в INSTALLED_APPS)
    default_auto_field = 'django.db.models.BigAutoField'
    
    # Имя приложения, должно совпадать с именем папки приложения
    name = 'product_templates'
    
    # Человекочитаемое название приложения (отображается в админке)
    verbose_name = 'Шаблоны изделий'
    
    # Метод ready() вызывается при запуске приложения
    # Здесь можно регистрировать сигналы или выполнять инициализацию
    def ready(self):
        # Пока оставляем пустым, добавим позже при необходимости
        pass