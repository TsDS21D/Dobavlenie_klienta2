"""
Файл views.py для приложения vichisliniya_listov.
ОБНОВЛЕНО: Теперь все API работают с печатными компонентами вместо просчётов.
"""

# Импортируем стандартные модули Django для работы с представлениями
from django.shortcuts import render, get_object_or_404
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from django.views.decorators.csrf import csrf_exempt
from django.db import DatabaseError, OperationalError, ProgrammingError
import json

# Импортируем нашу модель данных
from .models import VichisliniyaListovModel

# Импортируем модель PrintComponent из приложения calculator
from calculator.models_list_proschet import PrintComponent


def vichisliniya_listov_view(request):
    """
    Основное представление для отображения страницы вычислений листов.
    Эта функция рендерит HTML-шаблон секции "Вычисления листов".
    
    Аргументы:
        request: HTTP-запрос от клиента
        
    Возвращает:
        HttpResponse: HTML-страница с секцией вычислений листов
    """
    # Функция render комбинирует шаблон с контекстом и возвращает HttpResponse
    return render(request, 'vichisliniya_listov/sections/vichisliniya_listov.html')


@require_http_methods(["GET"])
def vichisliniya_listov_get_data(request, print_component_id):
    """
    API-представление для получения данных вычислений листов.
    ВАЖНОЕ ИЗМЕНЕНИЕ: Теперь функция работает с ID печатного компонента, а не просчёта.
    
    Логика работы:
    1. Получает ID печатного компонента из URL
    2. Ищет запись в базе данных по этому ID компонента
    3. Если запись найдена - возвращает данные в JSON формате
    4. Если запись не найдена - возвращает значения по умолчанию
    5. Если таблица не существует - возвращает значения по умолчанию с предупреждением
    
    Аргументы:
        request: HTTP-запрос от клиента
        print_component_id: ID печатного компонента (положительное целое число)
        
    Возвращает:
        JsonResponse: JSON-ответ с данными или сообщением об ошибке
    """
    try:
        # Пытаемся найти печатный компонент по ID
        # Это нужно для получения тиража из связанного просчёта
        print_component = get_object_or_404(PrintComponent, id=print_component_id)
        
        # Получаем тираж из связанного просчёта
        # ИЗМЕНЕНО: Теперь circulation всегда имеет значение (по умолчанию 1)
        circulation = print_component.proschet.circulation if print_component.proschet else 1
        
        # ДОБАВЛЕНО: Получаем информацию о просчёте
        proschet_info = {}
        if print_component.proschet:
            proschet = print_component.proschet
            proschet_info = {
                'proschet_id': proschet.id,
                'proschet_number': proschet.number,
                'proschet_title': proschet.title,
                'client_name': proschet.client.name if proschet.client else None,
                'created_at': proschet.created_at.strftime('%d.%m.%Y %H:%M') if proschet.created_at else None,
            }
        
        try:
            # Пытаемся найти запись вычислений листов для этого компонента
            vichisliniya_listov_data = VichisliniyaListovModel.objects.get(
                vichisliniya_listov_print_component_id=print_component_id
            )
            
            # Преобразуем объект модели в словарь для JSON-сериализации
            data = vichisliniya_listov_data.vichisliniya_listov_to_dict()
            
            # Добавляем информацию о тираже из печатного компонента
            data['circulation'] = circulation
            
            # Добавляем флаг успеха и сообщение
            data['success'] = True
            data['message'] = 'Данные успешно загружены'
            
        except VichisliniyaListovModel.DoesNotExist:
            # Исключение DoesNotExist возникает, если запись с таким ID компонента не найдена
            # В этом случае возвращаем значения по умолчанию
            
            data = {
                'success': True,
                'message': 'Используются значения по умолчанию',
                'print_component_id': print_component_id,
                'print_component_number': print_component.number if print_component else None,
                'circulation': circulation,  # Важно: передаём тираж из печатного компонента
                'list_count': 0.00,
                'vyleta': 1,
                'polosa_count': 1,
                'color': '4+0',
                'color_display': '4+0 (односторонняя полноцветная)',
                'is_default': True,  # Флаг, указывающий что данные по умолчанию
            }
    
    except (DatabaseError, OperationalError, ProgrammingError) as db_error:
        # Исключения базы данных возникают при проблемах с SQL-запросах
        # OperationalError: ошибки подключения, потеря соединения
        # ProgrammingError: ошибки в SQL-запросе
        # DatabaseError: общие ошибки базы данных
        
        error_message = str(db_error)
        
        # Проверяем, если ошибка связана с отсутствием таблицы
        # Это происходит когда миграции не применены
        if 'relation "vichisliniya_listov_data" does not exist' in error_message.lower() or \
           'таблица "vichisliniya_listov_data" не существует' in error_message.lower():
            
            data = {
                'success': True,
                'message': 'Таблица данных не существует. Используются значения по умолчанию.',
                'print_component_id': print_component_id,
                'circulation': 1,  # Значение по умолчанию для тиража
                'list_count': 0.00,
                'vyleta': 1,
                'polosa_count': 1,
                'color': '4+0',
                'color_display': '4+0 (односторонняя полноцветная)',
                'is_default': True,
                'database_error': 'Table does not exist. Please run migrations.',
                'hint': 'Выполните команды: python manage.py makemigrations vichisliniya_listov && python manage.py migrate vichisliniya_listov',
            }
        else:
            # Другие ошибки базы данных
            data = {
                'success': False,
                'message': f'Ошибка базы данных: {error_message}',
                'print_component_id': print_component_id,
                'error_type': 'database_error',
            }
    
    except Exception as e:
        # Общий обработчик для любых других исключений
        data = {
            'success': False,
            'message': f'Ошибка при загрузке данных: {str(e)}',
            'print_component_id': print_component_id,
            'error_type': 'general_error',
        }
    
    # Возвращаем JSON-ответ
    # safe=False позволяет возвращать не только словари, но и другие типы данных
    return JsonResponse(data, safe=False)


@csrf_exempt  # Отключаем проверку CSRF для API (для AJAX-запросов)
@require_http_methods(["POST"])  # Разрешаем только POST-запросы
def vichisliniya_listov_save_data(request):
    """
    API-представление для сохранения данных вычислений листов.
    ВАЖНОЕ ИЗМЕНЕНИЕ: Теперь функция работает с ID печатного компонента.
    
    Логика работы:
    1. Парсит JSON данные из тела запроса
    2. Проверяет обязательные поля (ID печатного компонента)
    3. Ищет существующую запись или создаёт новую
    4. Сохраняет данные в базе данных
    5. Возвращает результат операции
    
    Аргументы:
        request: HTTP-запрос от клиента с JSON данными в теле
        
    Возвращает:
        JsonResponse: JSON-ответ с результатом операции
    """
    try:
        # Парсим JSON данные из тела запроса
        # request.body содержит сырые байты запроса
        request_data = json.loads(request.body)
        
        # Извлекаем ID печатного компонента - обязательное поле
        print_component_id = request_data.get('print_component_id')
        
        # Проверяем, что ID печатного компонента указан
        if not print_component_id:
            return JsonResponse({
                'success': False,
                'message': 'Не указан ID печатного компонента',
                'error_type': 'validation_error',
            }, status=400)  # 400 Bad Request - ошибка клиента
        
        # Проверяем существование печатного компонента
        try:
            print_component = PrintComponent.objects.get(id=print_component_id)
        except PrintComponent.DoesNotExist:
            return JsonResponse({
                'success': False,
                'message': f'Печатный компонент с ID {print_component_id} не найден',
                'error_type': 'not_found',
            }, status=404)  # 404 Not Found
        
        # Извлекаем остальные данные с значениями по умолчанию
        list_count = request_data.get('list_count', 0.00)
        vyleta = request_data.get('vyleta', 1)
        polosa_count = request_data.get('polosa_count', 1)
        color = request_data.get('color', '4+0')
        
        # Проверяем, что цветность имеет допустимое значение
        # Это защита от некорректных данных от клиента
        valid_colors = ['1+0', '1+1', '4+0', '4+4']
        if color not in valid_colors:
            color = '4+0'  # Устанавливаем значение по умолчанию
        
        try:
            # Ищем существующую запись или создаём новую
            # Метод get_or_create возвращает кортеж (объект, создан_ли_объект)
            vichisliniya_listov_data, created = VichisliniyaListovModel.objects.get_or_create(
                vichisliniya_listov_print_component_id=print_component_id,
                defaults={
                    'vichisliniya_listov_list_count': list_count,
                    'vichisliniya_listov_vyleta': vyleta,
                    'vichisliniya_listov_polosa_count': polosa_count,
                    'vichisliniya_listov_color': color,
                }
            )
            
            if not created:
                # Если запись существовала, обновляем её поля
                vichisliniya_listov_data.vichisliniya_listov_list_count = list_count
                vichisliniya_listov_data.vichisliniya_listov_vyleta = vyleta
                vichisliniya_listov_data.vichisliniya_listov_polosa_count = polosa_count
                vichisliniya_listov_data.vichisliniya_listov_color = color
                
                # Сохраняем изменения в базе данных
                # При сохранении автоматически обновится vichisliniya_listov_updated_at
                vichisliniya_listov_data.save()
            
            # Получаем тираж из связанного просчёта
            circulation = print_component.proschet.circulation if print_component.proschet else 1
            
            # Формируем успешный ответ
            response_data = {
                'success': True,
                'message': 'Данные успешно сохранены' if created else 'Данные успешно обновлены',
                'print_component_id': print_component_id,
                'print_component_number': print_component.number,
                'circulation': circulation,
                'list_count': float(vichisliniya_listov_data.vichisliniya_listov_list_count),
                'vyleta': vichisliniya_listov_data.vichisliniya_listov_vyleta,
                'polosa_count': vichisliniya_listov_data.vichisliniya_listov_polosa_count,
                'color': vichisliniya_listov_data.vichisliniya_listov_color,
                'color_display': vichisliniya_listov_data.vichisliniya_listov_get_color_display_name(),
                'created': created,  # Флаг: была ли создана новая запись
                'created_at': vichisliniya_listov_data.vichisliniya_listov_created_at.isoformat(),
                'updated_at': vichisliniya_listov_data.vichisliniya_listov_updated_at.isoformat(),
            }
            
            # Возвращаем ответ с соответствующим статусом HTTP
            # 201 Created - для новой записи, 200 OK - для обновления существующей
            return JsonResponse(response_data, status=201 if created else 200)
            
        except (DatabaseError, OperationalError, ProgrammingError) as db_error:
            # Обработка ошибок базы данных при сохранении
            error_message = str(db_error)
            
            # Проверяем, если ошибка связана с отсутствием таблицы
            if 'relation "vichisliniya_listov_data" does not exist' in error_message.lower() or \
               'таблица "vichisliniya_listov_data" не существует' in error_message.lower():
                
                return JsonResponse({
                    'success': False,
                    'message': 'Таблица данных не существует. Пожалуйста, выполните миграции базы данных.',
                    'print_component_id': print_component_id,
                    'database_error': 'Table does not exist. Please run migrations.',
                    'hint': 'Выполните команды: python manage.py makemigrations vichisliniya_listov && python manage.py migrate vichisliniya_listov',
                }, status=503)  # 503 Service Unavailable - сервис временно недоступен
            
            # Другие ошибки базы данных
            return JsonResponse({
                'success': False,
                'message': f'Ошибка базы данных при сохранении: {error_message}',
                'print_component_id': print_component_id,
                'error_type': 'database_error',
            }, status=500)  # 500 Internal Server Error
            
    except json.JSONDecodeError:
        # Ошибка парсинга JSON (некорректный формат JSON)
        return JsonResponse({
            'success': False,
            'message': 'Неверный формат JSON в запросе',
            'error_type': 'json_decode_error',
        }, status=400)
        
    except Exception as e:
        # Общий обработчик исключений
        return JsonResponse({
            'success': False,
            'message': f'Ошибка при сохранении данных: {str(e)}',
            'error_type': 'general_error',
        }, status=500)


@require_http_methods(["GET"])
def vichisliniya_listov_calculate(request, print_component_id, circulation):
    """
    API-представление для расчёта количества листов на основе тиража.
    ВАЖНОЕ ИЗМЕНЕНИЕ: Теперь функция работает с ID печатного компонента.
    
    Логика работы:
    1. Получает ID печатного компонента и тираж из URL
    2. Преобразует тираж в число
    3. Ищет параметры вычислений для данного компонента
    4. Выполняет расчёт по формуле: (тираж / количество полос) + вылеты
    5. Возвращает результат расчёта
    
    Аргументы:
        request: HTTP-запрос от клиента
        print_component_id: ID печатного компонента (положительное целое число)
        circulation: значение тиража (может быть строкой или числом)
        
    Возвращает:
        JsonResponse: JSON-ответ с результатом расчёта
    """
    try:
        # Преобразуем тираж в целое число
        # int() может вызвать ValueError если circulation не число
        circulation_int = int(circulation)
        
        try:
            # Пытаемся найти данные для печатного компонента в базе данных
            vichisliniya_listov_data = VichisliniyaListovModel.objects.get(
                vichisliniya_listov_print_component_id=print_component_id
            )
        except VichisliniyaListovModel.DoesNotExist:
            # Если данных нет, создаём временный объект с значениями по умолчанию
            vichisliniya_listov_data = VichisliniyaListovModel(
                vichisliniya_listov_print_component_id=print_component_id,
                vichisliniya_listov_vyleta=1,
                vichisliniya_listov_polosa_count=1,
                vichisliniya_listov_color='4+0',
            )
        except (DatabaseError, OperationalError, ProgrammingError) as db_error:
            # Ошибки базы данных при поиске записи
            return JsonResponse({
                'success': False,
                'message': f'Ошибка базы данных: {str(db_error)}',
                'print_component_id': print_component_id,
                'circulation': circulation_int,
                'error_type': 'database_error',
            }, status=500)
        
        # Выполняем расчёт количества листов
        # Используем метод модели calculate_list_count который мы определили в models.py
        calculated_list_count = vichisliniya_listov_data.vichisliniya_listov_calculate_list_count(
            circulation_int
        )
        
        # Формируем успешный ответ с результатами расчёта
        response_data = {
            'success': True,
            'message': 'Расчёт выполнен успешно',
            'print_component_id': print_component_id,
            'circulation': circulation_int,
            'calculated_list_count': float(calculated_list_count),
            'vyleta': vichisliniya_listov_data.vichisliniya_listov_vyleta,
            'polosa_count': vichisliniya_listov_data.vichisliniya_listov_polosa_count,
            'color': vichisliniya_listov_data.vichisliniya_listov_color,
            # Формула расчёта для отображения пользователю
            'formula': f'({circulation_int} / {vichisliniya_listov_data.vichisliniya_listov_polosa_count}) + {vichisliniya_listov_data.vichisliniya_listov_vyleta}',
        }
        
        return JsonResponse(response_data)
        
    except ValueError:
        # Ошибка преобразования тиража в число
        return JsonResponse({
            'success': False,
            'message': 'Тираж должен быть целым числом',
            'error_type': 'value_error',
        }, status=400)
        
    except Exception as e:
        # Общий обработчик исключений
        return JsonResponse({
            'success': False,
            'message': f'Ошибка при расчёте: {str(e)}',
            'error_type': 'general_error',
        }, status=500)


@require_http_methods(["GET"])
def vichisliniya_listov_get_by_proschet(request, proschet_id):
    """
    НОВОЕ ПРЕДСТАВЛЕНИЕ: Получение всех вычислений листов для просчёта.
    Используется для совместимости со старым кодом и для массовых операций.
    
    Логика работы:
    1. Получает все печатные компоненты для указанного просчёта
    2. Получает вычисления листов для каждого компонента
    3. Возвращает массив данных
    
    Аргументы:
        request: HTTP-запрос от клиента
        proschet_id: ID просчёта
        
    Возвращает:
        JsonResponse: JSON-ответ с данными для всех компонентов просчёта
    """
    try:
        # Получаем все печатные компоненты для указанного просчёта
        print_components = PrintComponent.objects.filter(proschet_id=proschet_id)
        
        # Массив для хранения данных
        all_data = []
        
        # Для каждого компонента получаем данные вычислений листов
        for component in print_components:
            try:
                # Пытаемся получить данные вычислений листов для компонента
                vichisliniya_listov_data = VichisliniyaListovModel.objects.get(
                    vichisliniya_listov_print_component=component
                )
                data = vichisliniya_listov_data.vichisliniya_listov_to_dict()
                data['has_data'] = True
            except VichisliniyaListovModel.DoesNotExist:
                # Если данных нет, создаём запись с данными по умолчанию
                data = {
                    'print_component_id': component.id,
                    'print_component_number': component.number,
                    'list_count': 0.00,
                    'vyleta': 1,
                    'polosa_count': 1,
                    'color': '4+0',
                    'color_display': '4+0 (односторонняя полноцветная)',
                    'has_data': False,
                }
            
            # Добавляем информацию о компоненте
            data['printer_name'] = component.printer.name if component.printer else 'Не указан'
            data['paper_name'] = component.paper.name if component.paper else 'Не указана'
            
            all_data.append(data)
        
        return JsonResponse({
            'success': True,
            'message': f'Найдено {len(all_data)} компонентов для просчёта {proschet_id}',
            'proschet_id': proschet_id,
            'components_count': len(all_data),
            'data': all_data,
        })
        
    except Exception as e:
        # Обработка исключений
        return JsonResponse({
            'success': False,
            'message': f'Ошибка при получении данных: {str(e)}',
            'proschet_id': proschet_id,
            'error_type': 'general_error',
        }, status=500)


@require_http_methods(["GET"])
def vichisliniya_listov_check_migrations(request):
    """
    API для проверки состояния миграций и базы данных.
    ИСПОЛЬЗУЕТСЯ ДЛЯ ОТЛАДКИ: помогает определить, есть ли проблемы с миграциями.
    
    Логика работы:
    1. Проверяет существование таблицы в базе данных
    2. Получает список применённых миграций
    3. Возвращает информацию о состоянии базы данных
    
    Аргументы:
        request: HTTP-запрос от клиента
        
    Возвращает:
        JsonResponse: JSON-ответ с информацией о состоянии миграций
    """
    try:
        # Импортируем необходимые модули
        from django.db import connection
        import subprocess
        
        # 1. Проверяем существование таблицы vichisliniya_listov_data
        # Используем SQL-запрос к системной таблице information_schema
        with connection.cursor() as cursor:
            cursor.execute("""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_name = 'vichisliniya_listov_data'
                );
            """)
            table_exists = cursor.fetchone()[0]  # Результат: True или False
        
        # 2. Получаем информацию о миграциях через команду Django
        migration_output = ""
        try:
            # Выполняем команду Django showmigrations для нашего приложения
            migration_output = subprocess.check_output(
                ['python', 'manage.py', 'showmigrations', 'vichisliniya_listov'],
                stderr=subprocess.STDOUT,
                text=True,
                cwd='.'  # Текущая директория проекта
            )
        except subprocess.CalledProcessError as e:
            # Если команда завершилась с ошибкой
            migration_output = f"Ошибка выполнения команды: {e.output}"
        except FileNotFoundError:
            # Если python или manage.py не найдены
            migration_output = "Ошибка: файл manage.py не найден"
        
        # 3. Получаем список применённых миграций из таблицы django_migrations
        applied_migrations = []
        try:
            with connection.cursor() as cursor:
                cursor.execute("""
                    SELECT name FROM django_migrations 
                    WHERE app = 'vichisliniya_listov'
                    ORDER BY applied;
                """)
                applied_migrations = [row[0] for row in cursor.fetchall()]
        except Exception as e:
            applied_migrations = [f"Ошибка при получении миграций: {str(e)}"]
        
        # Формируем ответ с информацией о состоянии
        response_data = {
            'success': True,
            'table_exists': table_exists,
            'database_name': connection.settings_dict['NAME'],
            'migration_output': migration_output,
            'applied_migrations': applied_migrations,
            'migration_hint': 'Если table_exists=false, выполните: python manage.py makemigrations vichisliniya_listov && python manage.py migrate vichisliniya_listov',
        }
        
        # Добавляем дополнительную информацию в зависимости от состояния
        if not table_exists:
            response_data['warning'] = 'Таблица vichisliniya_listov_data не существует!'
            response_data['action_required'] = 'Выполните миграции'
        
        return JsonResponse(response_data)
        
    except Exception as e:
        # Обработка ошибок при проверке миграций
        return JsonResponse({
            'success': False,
            'message': f'Ошибка при проверке миграций: {str(e)}',
            'error_type': 'migration_check_error',
        }, status=500)