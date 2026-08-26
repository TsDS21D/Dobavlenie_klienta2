"""
Файл views.py для приложения vichisliniya_listov.
ОБНОВЛЕНО:
- Добавлена поддержка многостраничного режима при получении данных:
  теперь list_count и другие параметры возвращаются из правильной модели
  (одностраничной или многостраничной) в зависимости от флага is_active.
- Функция vichisliniya_listov_save_data деактивирует многостраничный режим
  при сохранении одностраничных данных.
- Добавлены подробные комментарии к каждой строке для понимания новичками.
"""

# Импорт стандартных функций Django для работы с представлениями
from django.shortcuts import render, get_object_or_404
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from django.views.decorators.csrf import csrf_exempt
from django.db import DatabaseError, OperationalError, ProgrammingError
import json

# Импорт моделей нашего приложения
from .models import VichisliniyaListovModel
# Импорт многостраничной модели
from .multipage_models import VichisliniyaMultipageModel
# Импорт модели печатного компонента из приложения calculator
from calculator.models_list_proschet import PrintComponent


def vichisliniya_listov_view(request):
    """
    Представление для отображения HTML-шаблона секции вычислений листов.
    Просто рендерит шаблон, без дополнительной логики.
    """
    return render(request, 'vichisliniya_listov/sections/vichisliniya_listov.html')


@require_http_methods(["GET"])
def vichisliniya_listov_get_data(request, print_component_id):
    """
    API для получения данных вычислений листов по ID печатного компонента.
    Возвращает JSON с параметрами одностраничного расчёта (или многостраничного,
    если он активен). Используется фронтендом для загрузки данных в секцию.
    """
    try:
        # Получаем печатный компонент или возвращаем 404, если не найден
        print_component = get_object_or_404(PrintComponent, id=print_component_id)

        # Получаем тираж из связанного просчёта (по умолчанию 1)
        circulation = print_component.proschet.circulation if print_component.proschet else 1

        # Информация о просчёте для отображения в заголовке
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

        # Данные о печатном листе (ширина, высота, поля) из принтера и формата
        sheet_data = {
            'sheet_width': None,
            'sheet_height': None,
            'margin': None,
            'sheet_name': None,
        }
        if print_component.printer:
            printer = print_component.printer
            sheet_data['margin'] = printer.margin_mm
            if printer.sheet_format:
                sheet_data['sheet_width'] = printer.sheet_format.width_mm
                sheet_data['sheet_height'] = printer.sheet_format.height_mm
                sheet_data['sheet_name'] = printer.sheet_format.name

        # ===== ОСНОВНОЕ ИСПРАВЛЕНИЕ: определяем, активен ли многостраничный режим =====
        try:
            # Пытаемся получить запись многостраничного расчёта для этого компонента
            multipage = VichisliniyaMultipageModel.objects.get(print_component=print_component)
            # Если запись существует и флаг is_active=True, то активен многостраничный режим
            if multipage.is_active:
                # Возвращаем данные из многостраничной модели, преобразованные в формат,
                # ожидаемый одностраничным UI (для единообразия интерфейса).
                data = {
                    'success': True,
                    'message': 'Данные загружены (многостраничный режим)',
                    'print_component_id': print_component_id,
                    'print_component_number': print_component.number if print_component else None,
                    'circulation': circulation,
                    # Количество листов из многостраничной модели
                    'list_count': float(multipage.sheet_count),
                    # Зазор (вылеты) из многостраничной модели
                    'vyleta': multipage.vyleta,
                    # Количество полос (не используется, но для совместимости)
                    'polosa_count': 1,
                    # Цветность
                    'color': multipage.color,
                    'color_display': dict(VichisliniyaListovModel.VICHISLINIYA_LISTOV_COLOR_CHOICES).get(multipage.color, multipage.color),
                    # Размеры страницы (изделия)
                    'item_width': float(multipage.finished_width),
                    'item_height': float(multipage.finished_height),
                    # Параметры размещения на листе (fit_*)
                    'fit_horizontal': multipage.fit_horizontal,
                    'fit_vertical': multipage.fit_vertical,
                    'fit_total': multipage.fit_total,
                    'fit_landscape_total': multipage.fit_landscape_total,
                    'fit_portrait_total': multipage.fit_portrait_total,
                    'fit_selected_orientation': multipage.fit_selected_orientation,
                    'cuts_count': 0,  # Для многостраничного режима резы не считаем
                    'is_multipage_active': True,  # Флаг для фронтенда
                    **sheet_data,
                    **proschet_info,
                }
                return JsonResponse(data)  # Возвращаем JSON
        except VichisliniyaMultipageModel.DoesNotExist:
            # Если многостраничной записи нет – продолжаем с одностраничным режимом
            pass

        # ===== ОДНОСТРАНИЧНЫЙ РЕЖИМ =====
        try:
            # Пытаемся получить одностраничную запись для компонента
            vichisliniya_listov_data = VichisliniyaListovModel.objects.get(
                vichisliniya_listov_print_component_id=print_component_id
            )
            # Преобразуем объект в словарь с помощью метода модели
            data = vichisliniya_listov_data.vichisliniya_listov_to_dict()
            # Добавляем информацию о просчёте и листе
            data.update(proschet_info)
            data.update(sheet_data)
            data['circulation'] = circulation
            data['success'] = True
            data['message'] = 'Данные успешно загружены'
            data['is_multipage_active'] = False  # Флаг для фронтенда
        except VichisliniyaListovModel.DoesNotExist:
            # Если одностраничной записи нет, создаём словарь со значениями по умолчанию
            data = {
                'success': True,
                'message': 'Используются значения по умолчанию',
                'print_component_id': print_component_id,
                'print_component_number': print_component.number if print_component else None,
                'circulation': circulation,
                'list_count': 0.00,
                'vyleta': 1,
                'polosa_count': 1,
                'color': '4+0',
                'color_display': '4+0 (односторонняя полноцветная)',
                'is_default': True,
                'item_width': 90.0,
                'item_height': 50.0,
                'fit_horizontal': 0,
                'fit_vertical': 0,
                'fit_total': 0,
                'fit_landscape_total': 0,
                'fit_portrait_total': 0,
                'fit_selected_orientation': 'auto',
                'cuts_count': 0,
                'is_multipage_active': False,
                **sheet_data,
                **proschet_info,
            }

        return JsonResponse(data, safe=False)  # safe=False позволяет вернуть словарь, а не список

    except Exception as e:
        # Любая непредвиденная ошибка – возвращаем JSON с ошибкой и статусом 500
        return JsonResponse({
            'success': False,
            'message': f'Ошибка при загрузке данных: {str(e)}',
        }, status=500)


@csrf_exempt
@require_http_methods(["POST"])
def vichisliniya_listov_save_data(request):
    """
    API для сохранения данных вычислений листов (одностраничный режим).
    При сохранении одностраничных данных деактивирует многостраничный режим
    для этого компонента (если он был активен).
    """
    try:
        # Парсим JSON из тела запроса
        request_data = json.loads(request.body)
        print_component_id = request_data.get('print_component_id')

        if not print_component_id:
            return JsonResponse({
                'success': False,
                'message': 'Не указан ID печатного компонента',
            }, status=400)

        # Получаем печатный компонент
        try:
            print_component = PrintComponent.objects.get(id=print_component_id)
        except PrintComponent.DoesNotExist:
            return JsonResponse({
                'success': False,
                'message': f'Печатный компонент с ID {print_component_id} не найден',
            }, status=404)

        # Извлекаем параметры одностраничного расчёта из запроса
        list_count = request_data.get('list_count', 0.00)
        vyleta = request_data.get('vyleta', 1)
        polosa_count = request_data.get('polosa_count', 1)
        color = request_data.get('color', '4+0')
        item_width = request_data.get('item_width', 90.0)
        item_height = request_data.get('item_height', 50.0)
        fit_horizontal = request_data.get('fit_horizontal', 0)
        fit_vertical = request_data.get('fit_vertical', 0)
        fit_total = request_data.get('fit_total', 0)
        fit_landscape_total = request_data.get('fit_landscape_total', 0)
        fit_portrait_total = request_data.get('fit_portrait_total', 0)
        fit_selected_orientation = request_data.get('fit_selected_orientation', 'auto')
        cuts_count = request_data.get('cuts_count', 0)

        # Валидация цветности (допустимые значения)
        valid_colors = ['1+0', '1+1', '4+0', '4+4']
        if color not in valid_colors:
            color = '4+0'

        # Сохраняем или создаём одностраничную запись
        vichisliniya_listov_data, created = VichisliniyaListovModel.objects.get_or_create(
            vichisliniya_listov_print_component_id=print_component_id,
            defaults={
                'vichisliniya_listov_list_count': list_count,
                'vichisliniya_listov_vyleta': vyleta,
                'vichisliniya_listov_polosa_count': polosa_count,
                'vichisliniya_listov_color': color,
                'vichisliniya_listov_item_width': item_width,
                'vichisliniya_listov_item_height': item_height,
                'vichisliniya_listov_fit_horizontal': fit_horizontal,
                'vichisliniya_listov_fit_vertical': fit_vertical,
                'vichisliniya_listov_fit_total': fit_total,
                'vichisliniya_listov_fit_landscape_total': fit_landscape_total,
                'vichisliniya_listov_fit_portrait_total': fit_portrait_total,
                'vichisliniya_listov_fit_selected_orientation': fit_selected_orientation,
                'vichisliniya_listov_cuts_count': cuts_count,
            }
        )

        if not created:
            # Если запись уже существовала, обновляем её поля
            vichisliniya_listov_data.vichisliniya_listov_list_count = list_count
            vichisliniya_listov_data.vichisliniya_listov_vyleta = vyleta
            vichisliniya_listov_data.vichisliniya_listov_polosa_count = polosa_count
            vichisliniya_listov_data.vichisliniya_listov_color = color
            vichisliniya_listov_data.vichisliniya_listov_item_width = item_width
            vichisliniya_listov_data.vichisliniya_listov_item_height = item_height
            vichisliniya_listov_data.vichisliniya_listov_fit_horizontal = fit_horizontal
            vichisliniya_listov_data.vichisliniya_listov_fit_vertical = fit_vertical
            vichisliniya_listov_data.vichisliniya_listov_fit_total = fit_total
            vichisliniya_listov_data.vichisliniya_listov_fit_landscape_total = fit_landscape_total
            vichisliniya_listov_data.vichisliniya_listov_fit_portrait_total = fit_portrait_total
            vichisliniya_listov_data.vichisliniya_listov_fit_selected_orientation = fit_selected_orientation
            vichisliniya_listov_data.vichisliniya_listov_cuts_count = cuts_count

        # Пересчитываем количество резов на основе текущих fit_horizontal и fit_vertical
        vichisliniya_listov_data.update_cuts_count()
        # Сохраняем изменения в базе данных
        vichisliniya_listov_data.save()

        # ===== ВАЖНО: при сохранении одностраничных данных деактивируем многостраничный режим =====
        try:
            multipage = VichisliniyaMultipageModel.objects.get(print_component=print_component)
            if multipage.is_active:
                multipage.is_active = False
                multipage.save()
                print(f"✅ Многостраничный режим деактивирован для компонента {print_component_id}")
        except VichisliniyaMultipageModel.DoesNotExist:
            # Если многостраничной записи нет – ничего не делаем
            pass

        # Получаем тираж просчёта для ответа
        circulation = print_component.proschet.circulation if print_component.proschet else 1

        # Формируем ответ с сохранёнными данными
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
            'item_width': float(vichisliniya_listov_data.vichisliniya_listov_item_width),
            'item_height': float(vichisliniya_listov_data.vichisliniya_listov_item_height),
            'fit_horizontal': vichisliniya_listov_data.vichisliniya_listov_fit_horizontal,
            'fit_vertical': vichisliniya_listov_data.vichisliniya_listov_fit_vertical,
            'fit_total': vichisliniya_listov_data.vichisliniya_listov_fit_total,
            'fit_landscape_total': vichisliniya_listov_data.vichisliniya_listov_fit_landscape_total,
            'fit_portrait_total': vichisliniya_listov_data.vichisliniya_listov_fit_portrait_total,
            'fit_selected_orientation': vichisliniya_listov_data.vichisliniya_listov_fit_selected_orientation,
            'cuts_count': vichisliniya_listov_data.vichisliniya_listov_cuts_count,
            'created': created,
            'created_at': vichisliniya_listov_data.vichisliniya_listov_created_at.isoformat(),
            'updated_at': vichisliniya_listov_data.vichisliniya_listov_updated_at.isoformat(),
        }

        # Возвращаем успешный ответ (201 если создано, 200 если обновлено)
        return JsonResponse(response_data, status=201 if created else 200)

    except json.JSONDecodeError:
        # Ошибка разбора JSON
        return JsonResponse({
            'success': False,
            'message': 'Неверный формат JSON',
        }, status=400)
    except Exception as e:
        # Общая ошибка
        return JsonResponse({
            'success': False,
            'message': f'Ошибка при сохранении: {str(e)}',
        }, status=500)


@require_http_methods(["GET"])
def vichisliniya_listov_calculate(request, print_component_id, circulation):
    """
    API для расчёта количества листов на основе тиража.
    Учитывает активный многостраничный режим (если есть).
    """
    try:
        # Преобразуем тираж в целое число
        circulation_int = int(circulation)

        # Проверяем, активен ли многостраничный режим для этого компонента
        try:
            multipage = VichisliniyaMultipageModel.objects.get(print_component_id=print_component_id)
            if multipage.is_active:
                # Если многостраничный режим активен, возвращаем sheet_count из многостраничной модели
                calculated_list_count = float(multipage.sheet_count)
                return JsonResponse({
                    'success': True,
                    'message': 'Расчёт выполнен (многостраничный режим)',
                    'print_component_id': print_component_id,
                    'circulation': circulation_int,
                    'calculated_list_count': calculated_list_count,
                    'vyleta': multipage.vyleta,
                    'polosa_count': 1,
                    'color': multipage.color,
                    'formula': f'Используется количество листов из многостраничного расчёта: {calculated_list_count}',
                    'cuts_count': 0,
                })
        except VichisliniyaMultipageModel.DoesNotExist:
            # Если многостраничной записи нет – продолжаем с одностраничным расчётом
            pass

        # ===== ОДНОСТРАНИЧНЫЙ РАСЧЁТ =====
        try:
            # Пытаемся получить одностраничную запись
            vichisliniya_listov_data = VichisliniyaListovModel.objects.get(
                vichisliniya_listov_print_component_id=print_component_id
            )
        except VichisliniyaListovModel.DoesNotExist:
            # Если записи нет, создаём временный объект с параметрами по умолчанию
            vichisliniya_listov_data = VichisliniyaListovModel(
                vichisliniya_listov_print_component_id=print_component_id,
                vichisliniya_listov_vyleta=1,
                vichisliniya_listov_polosa_count=1,
                vichisliniya_listov_color='4+0',
                vichisliniya_listov_item_width=90.0,
                vichisliniya_listov_item_height=50.0,
                vichisliniya_listov_fit_total=0,
            )
        except (DatabaseError, OperationalError, ProgrammingError) as db_error:
            # Ошибки базы данных
            return JsonResponse({
                'success': False,
                'message': f'Ошибка базы данных: {str(db_error)}',
                'error_type': 'database_error',
            }, status=500)

        # Выполняем расчёт количества листов с помощью метода модели
        calculated_list_count = vichisliniya_listov_data.vichisliniya_listov_calculate_list_count(
            circulation_int
        )

        # Формируем успешный ответ
        return JsonResponse({
            'success': True,
            'message': 'Расчёт выполнен (одностраничный режим)',
            'print_component_id': print_component_id,
            'circulation': circulation_int,
            'calculated_list_count': float(calculated_list_count),
            'vyleta': vichisliniya_listov_data.vichisliniya_listov_vyleta,
            'polosa_count': vichisliniya_listov_data.vichisliniya_listov_polosa_count,
            'color': vichisliniya_listov_data.vichisliniya_listov_color,
            'formula': f'{circulation_int} / {vichisliniya_listov_data.vichisliniya_listov_fit_total} (окр. вверх)',
            'cuts_count': vichisliniya_listov_data.vichisliniya_listov_cuts_count,
        })

    except ValueError:
        # Ошибка: тираж не является целым числом
        return JsonResponse({
            'success': False,
            'message': 'Тираж должен быть целым числом',
            'error_type': 'value_error',
        }, status=400)
    except Exception as e:
        # Общая ошибка
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
    Теперь возвращает данные с учётом активного многостраничного режима.
    """
    try:
        # Получаем все печатные компоненты, принадлежащие просчёту
        print_components = PrintComponent.objects.filter(proschet_id=proschet_id, is_deleted=False)

        all_data = []

        for component in print_components:
            # Пытаемся получить данные из многостраничной модели (если активна)
            try:
                multipage = VichisliniyaMultipageModel.objects.get(print_component=component)
                if multipage.is_active:
                    # Используем многостраничные данные
                    data = {
                        'print_component_id': component.id,
                        'print_component_number': component.number,
                        'list_count': float(multipage.sheet_count),
                        'vyleta': multipage.vyleta,
                        'polosa_count': 1,
                        'color': multipage.color,
                        'color_display': dict(VichisliniyaListovModel.VICHISLINIYA_LISTOV_COLOR_CHOICES).get(multipage.color, multipage.color),
                        'item_width': float(multipage.finished_width),
                        'item_height': float(multipage.finished_height),
                        'fit_horizontal': multipage.fit_horizontal,
                        'fit_vertical': multipage.fit_vertical,
                        'fit_total': multipage.fit_total,
                        'fit_landscape_total': multipage.fit_landscape_total,
                        'fit_portrait_total': multipage.fit_portrait_total,
                        'fit_selected_orientation': multipage.fit_selected_orientation,
                        'cuts_count': 0,
                        'has_data': True,
                        'is_multipage': True,
                    }
                else:
                    raise VichisliniyaMultipageModel.DoesNotExist  # Переключаемся на одностраничную
            except VichisliniyaMultipageModel.DoesNotExist:
                # Многостраничная запись отсутствует или не активна – используем одностраничную
                try:
                    vich_data = VichisliniyaListovModel.objects.get(
                        vichisliniya_listov_print_component=component
                    )
                    data = vich_data.vichisliniya_listov_to_dict()
                    data['has_data'] = True
                    data['is_multipage'] = False
                except VichisliniyaListovModel.DoesNotExist:
                    # Если и одностраничной записи нет – значения по умолчанию
                    data = {
                        'print_component_id': component.id,
                        'print_component_number': component.number,
                        'list_count': 0.00,
                        'vyleta': 1,
                        'polosa_count': 1,
                        'color': '4+0',
                        'color_display': '4+0 (односторонняя полноцветная)',
                        'has_data': False,
                        'is_multipage': False,
                        'item_width': 90.0,
                        'item_height': 50.0,
                        'fit_horizontal': 0,
                        'fit_vertical': 0,
                        'fit_total': 0,
                        'fit_landscape_total': 0,
                        'fit_portrait_total': 0,
                        'fit_selected_orientation': 'auto',
                        'cuts_count': 0,
                    }

            # Добавляем информацию о принтере и бумаге
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
    Полезно для отладки и диагностики проблем.
    """
    try:
        from django.db import connection
        import subprocess

        # Проверяем, существует ли таблица одностраничной модели
        with connection.cursor() as cursor:
            cursor.execute("""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_name = 'vichisliniya_listov_data'
                );
            """)
            table_exists = cursor.fetchone()[0]

        # Пытаемся выполнить команду showmigrations для нашего приложения
        migration_output = ""
        try:
            migration_output = subprocess.check_output(
                ['python', 'manage.py', 'showmigrations', 'vichisliniya_listov'],
                stderr=subprocess.STDOUT,
                text=True,
                cwd='.'
            )
        except subprocess.CalledProcessError as e:
            migration_output = f"Ошибка выполнения команды: {e.output}"
        except FileNotFoundError:
            migration_output = "Ошибка: файл manage.py не найден"

        # Получаем список применённых миграций из таблицы django_migrations
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

        response_data = {
            'success': True,
            'table_exists': table_exists,
            'database_name': connection.settings_dict['NAME'],
            'migration_output': migration_output,
            'applied_migrations': applied_migrations,
            'migration_hint': 'Если table_exists=false, выполните: python manage.py makemigrations vichisliniya_listov && python manage.py migrate vichisliniya_listov',
        }

        if not table_exists:
            response_data['warning'] = 'Таблица vichisliniya_listov_data не существует!'
            response_data['action_required'] = 'Выполните миграции'

        return JsonResponse(response_data)

    except Exception as e:
        return JsonResponse({
            'success': False,
            'message': f'Ошибка при проверке миграций: {str(e)}',
            'error_type': 'migration_check_error',
        }, status=500)