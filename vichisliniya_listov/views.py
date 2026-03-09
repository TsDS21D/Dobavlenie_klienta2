"""
Файл views.py для приложения vichisliniya_listov.
ОБНОВЛЕНО:
- Добавлена передача данных о печатном листе (ширина, высота, поля).
- Добавлена поддержка новых полей: item_width, item_height, fit_*.
- Исправлен расчёт количества листов в методе модели (не в этом файле).
- Добавлено поле cuts_count при загрузке и сохранении данных.
"""

from django.shortcuts import render, get_object_or_404
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from django.views.decorators.csrf import csrf_exempt
from django.db import DatabaseError, OperationalError, ProgrammingError
import json

from .models import VichisliniyaListovModel
from calculator.models_list_proschet import PrintComponent


def vichisliniya_listov_view(request):
    return render(request, 'vichisliniya_listov/sections/vichisliniya_listov.html')


@require_http_methods(["GET"])
def vichisliniya_listov_get_data(request, print_component_id):
    """
    API для получения данных вычислений листов по ID печатного компонента.
    ТЕПЕРЬ ВОЗВРАЩАЕТ ТАКЖЕ ДАННЫЕ О ПЕЧАТНОМ ЛИСТЕ (из принтера и формата).
    ДОБАВЛЕНО ПОЛЕ cuts_count.
    """
    try:
        print_component = get_object_or_404(PrintComponent, id=print_component_id)

        circulation = print_component.proschet.circulation if print_component.proschet else 1

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

        # ===== НОВОЕ: получаем данные о принтере и формате листа =====
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

        try:
            vichisliniya_listov_data = VichisliniyaListovModel.objects.get(
                vichisliniya_listov_print_component_id=print_component_id
            )
            data = vichisliniya_listov_data.vichisliniya_listov_to_dict()
            data.update(proschet_info)
            data.update(sheet_data)
            data['circulation'] = circulation
            data['success'] = True
            data['message'] = 'Данные успешно загружены'

        except VichisliniyaListovModel.DoesNotExist:
            # Данных нет – возвращаем значения по умолчанию
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
                # Новые поля по умолчанию
                'item_width': 90.0,
                'item_height': 50.0,
                'fit_horizontal': 0,
                'fit_vertical': 0,
                'fit_total': 0,
                'fit_landscape_total': 0,
                'fit_portrait_total': 0,
                'fit_selected_orientation': 'auto',
                'cuts_count': 0,  # НОВОЕ поле
                **sheet_data,
                **proschet_info,
            }

        return JsonResponse(data, safe=False)

    except Exception as e:
        return JsonResponse({
            'success': False,
            'message': f'Ошибка при загрузке данных: {str(e)}',
        }, status=500)


@csrf_exempt
@require_http_methods(["POST"])
def vichisliniya_listov_save_data(request):
    """
    API для сохранения данных вычислений листов.
    ТЕПЕРЬ ПРИНИМАЕТ НОВЫЕ ПОЛЯ, ВКЛЮЧАЯ cuts_count.
    ПЕРЕД СОХРАНЕНИЕМ ПЕРЕСЧИТЫВАЕТ КОЛИЧЕСТВО РЕЗОВ ДЛЯ ГАРАНТИИ СОГЛАСОВАННОСТИ.
    """
    try:
        request_data = json.loads(request.body)
        print_component_id = request_data.get('print_component_id')

        if not print_component_id:
            return JsonResponse({
                'success': False,
                'message': 'Не указан ID печатного компонента',
            }, status=400)

        try:
            print_component = PrintComponent.objects.get(id=print_component_id)
        except PrintComponent.DoesNotExist:
            return JsonResponse({
                'success': False,
                'message': f'Печатный компонент с ID {print_component_id} не найден',
            }, status=404)

        # Извлекаем старые данные
        list_count = request_data.get('list_count', 0.00)
        vyleta = request_data.get('vyleta', 1)
        polosa_count = request_data.get('polosa_count', 1)
        color = request_data.get('color', '4+0')

        # Извлекаем новые данные
        item_width = request_data.get('item_width', 90.0)
        item_height = request_data.get('item_height', 50.0)
        fit_horizontal = request_data.get('fit_horizontal', 0)
        fit_vertical = request_data.get('fit_vertical', 0)
        fit_total = request_data.get('fit_total', 0)
        fit_landscape_total = request_data.get('fit_landscape_total', 0)
        fit_portrait_total = request_data.get('fit_portrait_total', 0)
        fit_selected_orientation = request_data.get('fit_selected_orientation', 'auto')
        # НОВОЕ: извлекаем количество резов (если не пришло, вычислим позже)
        cuts_count = request_data.get('cuts_count', 0)

        # Валидация цветности
        valid_colors = ['1+0', '1+1', '4+0', '4+4']
        if color not in valid_colors:
            color = '4+0'

        # Сохраняем или создаём запись
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
                'vichisliniya_listov_cuts_count': cuts_count,  # сохраняем присланное значение
            }
        )

        if not created:
            # Обновляем существующую запись
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

        # === ГАРАНТИЯ СОГЛАСОВАННОСТИ: пересчитываем резы по текущим fit_horizontal и fit_vertical ===
        vichisliniya_listov_data.update_cuts_count()
        # Сохраняем объект (после пересчёта резов)
        vichisliniya_listov_data.save()

        circulation = print_component.proschet.circulation if print_component.proschet else 1

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
            # Новые поля
            'item_width': float(vichisliniya_listov_data.vichisliniya_listov_item_width),
            'item_height': float(vichisliniya_listov_data.vichisliniya_listov_item_height),
            'fit_horizontal': vichisliniya_listov_data.vichisliniya_listov_fit_horizontal,
            'fit_vertical': vichisliniya_listov_data.vichisliniya_listov_fit_vertical,
            'fit_total': vichisliniya_listov_data.vichisliniya_listov_fit_total,
            'fit_landscape_total': vichisliniya_listov_data.vichisliniya_listov_fit_landscape_total,
            'fit_portrait_total': vichisliniya_listov_data.vichisliniya_listov_fit_portrait_total,
            'fit_selected_orientation': vichisliniya_listov_data.vichisliniya_listov_fit_selected_orientation,
            'cuts_count': vichisliniya_listov_data.vichisliniya_listov_cuts_count,  # НОВОЕ
            'created': created,
            'created_at': vichisliniya_listov_data.vichisliniya_listov_created_at.isoformat(),
            'updated_at': vichisliniya_listov_data.vichisliniya_listov_updated_at.isoformat(),
        }

        return JsonResponse(response_data, status=201 if created else 200)

    except json.JSONDecodeError:
        return JsonResponse({
            'success': False,
            'message': 'Неверный формат JSON',
        }, status=400)
    except Exception as e:
        return JsonResponse({
            'success': False,
            'message': f'Ошибка при сохранении: {str(e)}',
        }, status=500)


@require_http_methods(["GET"])
def vichisliniya_listov_calculate(request, print_component_id, circulation):
    """
    API-представление для расчёта количества листов на основе тиража.
    ВАЖНОЕ ИЗМЕНЕНИЕ: Теперь функция работает с ID печатного компонента.
    Расчёт выполняется методом модели vichisliniya_listov_calculate_list_count,
    который использует новую формулу (ceil(тираж / fit_total)).
    """
    try:
        circulation_int = int(circulation)

        try:
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
                # Добавим значения по умолчанию для новых полей, чтобы fit_total был определён
                vichisliniya_listov_item_width=90.0,
                vichisliniya_listov_item_height=50.0,
                vichisliniya_listov_fit_total=0,  # по умолчанию 0, расчёт вернёт 0
            )
        except (DatabaseError, OperationalError, ProgrammingError) as db_error:
            return JsonResponse({
                'success': False,
                'message': f'Ошибка базы данных: {str(db_error)}',
                'print_component_id': print_component_id,
                'circulation': circulation_int,
                'error_type': 'database_error',
            }, status=500)

        # Выполняем расчёт количества листов с помощью метода модели
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
            # Формула расчёта для отображения пользователю (новая)
            'formula': f'{circulation_int} / {vichisliniya_listov_data.vichisliniya_listov_fit_total} (окр. вверх)',
            # НОВОЕ: можно вернуть и количество резов, если нужно
            'cuts_count': vichisliniya_listov_data.vichisliniya_listov_cuts_count,
        }

        return JsonResponse(response_data)

    except ValueError:
        return JsonResponse({
            'success': False,
            'message': 'Тираж должен быть целым числом',
            'error_type': 'value_error',
        }, status=400)

    except Exception as e:
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
    """
    try:
        print_components = PrintComponent.objects.filter(proschet_id=proschet_id)

        all_data = []

        for component in print_components:
            try:
                vichisliniya_listov_data = VichisliniyaListovModel.objects.get(
                    vichisliniya_listov_print_component=component
                )
                data = vichisliniya_listov_data.vichisliniya_listov_to_dict()
                data['has_data'] = True
            except VichisliniyaListovModel.DoesNotExist:
                data = {
                    'print_component_id': component.id,
                    'print_component_number': component.number,
                    'list_count': 0.00,
                    'vyleta': 1,
                    'polosa_count': 1,
                    'color': '4+0',
                    'color_display': '4+0 (односторонняя полноцветная)',
                    'has_data': False,
                    # Новые поля по умолчанию
                    'item_width': 90.0,
                    'item_height': 50.0,
                    'fit_horizontal': 0,
                    'fit_vertical': 0,
                    'fit_total': 0,
                    'fit_landscape_total': 0,
                    'fit_portrait_total': 0,
                    'fit_selected_orientation': 'auto',
                    'cuts_count': 0,  # НОВОЕ
                }

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
    """
    try:
        from django.db import connection
        import subprocess

        with connection.cursor() as cursor:
            cursor.execute("""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_name = 'vichisliniya_listov_data'
                );
            """)
            table_exists = cursor.fetchone()[0]

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