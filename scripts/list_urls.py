# scripts/list_urls.py
"""
Скрипт для печати ВСЕХ URL-маршрутов Django-проекта.

Запуск (локально или на сервере):

    python manage.py shell -c "exec(open('scripts/list_urls.py', encoding='utf-8').read())"

Скрипт рекурсивно обходит дерево urlpatterns и выводит таблицу:

    <URL-шаблон>   name=<имя маршрута>   view=<модуль.функция>
"""

from django.urls import get_resolver
from django.urls.resolvers import URLPattern, URLResolver


def walk(patterns, prefix=''):
    """
    Рекурсивно обходит urlpatterns.

    Аргументы:
        patterns — список паттернов (обычно get_resolver().url_patterns).
        prefix   — накопленный префикс URL (например, 'calculator/'),
                   по мере спуска в include(...).
    """
    for p in patterns:
        # Полный URL-шаблон = накопленный префикс + текущий паттерн.
        pattern = prefix + str(p.pattern)

        if isinstance(p, URLPattern):
            # Это конечный паттерн — за ним стоит view-функция.
            name = getattr(p, 'name', '') or ''
            callback = getattr(p, 'callback', None)
            view_name = ''
            if callback is not None:
                # callback — это функция или class-based view.
                module = getattr(callback, '__module__', '?')
                qualname = getattr(callback, '__qualname__', getattr(callback, '__name__', '?'))
                view_name = f'{module}.{qualname}'

            print(f'  {pattern:<70}  name={name:<45}  view={view_name}')

        elif isinstance(p, URLResolver):
            # Это include(...) — рекурсивно спускаемся внутрь.
            print(f'  {pattern:<70}  (include -> {p.namespace or ""})')
            walk(p.url_patterns, pattern)


print('=' * 160)
print('Все URL-маршруты проекта')
print('=' * 160)
walk(get_resolver().url_patterns)
print('=' * 160)