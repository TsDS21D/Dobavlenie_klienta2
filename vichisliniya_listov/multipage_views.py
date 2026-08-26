"""
API для многостраничных вычислений.
ИСПРАВЛЕНО (2026-04-10):
- Добавлено поле is_active (активен ли многостраничный режим) в сохранение и получение данных.
- Теперь при сохранении обновляется is_active, а при получении возвращается.
"""

import json
from decimal import Decimal
from django.shortcuts import get_object_or_404
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from django.views.decorators.csrf import csrf_exempt

from .multipage_models import VichisliniyaMultipageModel, MultipageBinding
from calculator.models_list_proschet import PrintComponent


@csrf_exempt
@require_http_methods(["POST"])
def multipage_save_data(request):
    """
    Сохраняет или обновляет многостраничные данные для печатного компонента.
    Теперь принимает и сохраняет поле is_active.
    """
    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'success': False, 'message': 'Неверный JSON'}, status=400)

    print_component_id = data.get('print_component_id')
    if not print_component_id:
        return JsonResponse({'success': False, 'message': 'Не указан ID компонента'}, status=400)

    try:
        print_component = PrintComponent.objects.get(id=print_component_id)
    except PrintComponent.DoesNotExist:
        return JsonResponse({'success': False, 'message': 'Компонент не найден'}, status=404)

    # Преобразуем binding_id из пустой строки в None
    binding_id = data.get('binding_id')
    if binding_id == '' or binding_id is None:
        binding_id = None
    else:
        try:
            binding_id = int(binding_id)
        except (ValueError, TypeError):
            binding_id = None

    # Параметры, которые обязательно должны быть в данных (с значениями по умолчанию)
    total_pages = data.get('total_pages', 4)
    copies = data.get('copies', 1)
    finished_width = data.get('finished_width', 210.0)
    finished_height = data.get('finished_height', 297.0)
    vyleta = data.get('vyleta', 1)
    color = data.get('color', '4+0')
    booklet_orientation = data.get('booklet_orientation', 'portrait')
    fit_horizontal = data.get('fit_horizontal', 0)
    fit_vertical = data.get('fit_vertical', 0)
    fit_total = data.get('fit_total', 0)
    fit_landscape_total = data.get('fit_landscape_total', 0)
    fit_portrait_total = data.get('fit_portrait_total', 0)
    fit_selected_orientation = data.get('fit_selected_orientation', 'auto')
    # НОВОЕ ПОЛЕ: активен ли многостраничный режим
    is_active = data.get('is_active', False)

    # Пытаемся получить существующий объект или создать новый
    obj, created = VichisliniyaMultipageModel.objects.get_or_create(
        print_component=print_component,
        defaults={
            'binding_id': binding_id,
            'total_pages': total_pages,
            'copies': copies,
            'finished_width': finished_width,
            'finished_height': finished_height,
            'vyleta': vyleta,
            'color': color,
            'booklet_orientation': booklet_orientation,
            'fit_horizontal': fit_horizontal,
            'fit_vertical': fit_vertical,
            'fit_total': fit_total,
            'fit_landscape_total': fit_landscape_total,
            'fit_portrait_total': fit_portrait_total,
            'fit_selected_orientation': fit_selected_orientation,
            'is_active': is_active,
        }
    )

    if not created:
        # Обновляем существующую запись
        obj.binding_id = binding_id
        obj.total_pages = total_pages
        obj.copies = copies
        obj.finished_width = finished_width
        obj.finished_height = finished_height
        obj.vyleta = vyleta
        obj.color = color
        obj.booklet_orientation = booklet_orientation
        obj.fit_horizontal = fit_horizontal
        obj.fit_vertical = fit_vertical
        obj.fit_total = fit_total
        obj.fit_landscape_total = fit_landscape_total
        obj.fit_portrait_total = fit_portrait_total
        obj.fit_selected_orientation = fit_selected_orientation
        obj.is_active = is_active

    # Сохраняем объект (внутри save() автоматически пересчитается sheet_count)
    obj.save()

    # Проверка кратности страниц (предупреждение для пользователя)
    warning = None
    if not obj.validate_pages_multiple():
        binding_name = obj.binding.name if obj.binding else 'выбранного способа'
        warning = f'Страниц ({obj.total_pages}) не кратно {obj.binding.page_multiple} для "{binding_name}".'

    return JsonResponse({
        'success': True,
        'message': 'Сохранено',
        'created': created,
        'data': obj.to_dict(),
        'warning': warning,
    })


@require_http_methods(["GET"])
def multipage_get_data(request, print_component_id):
    """
    Возвращает многостраничные данные для указанного печатного компонента.
    Если данных нет – возвращает значения по умолчанию, включая is_active: false.
    """
    try:
        obj = VichisliniyaMultipageModel.objects.get(print_component_id=print_component_id)
        return JsonResponse({'success': True, 'exists': True, **obj.to_dict()})
    except VichisliniyaMultipageModel.DoesNotExist:
        return JsonResponse({
            'success': True,
            'exists': False,
            'print_component_id': print_component_id,
            'total_pages': 4,
            'finished_width': 210.0,
            'finished_height': 297.0,
            'vyleta': 1,
            'booklet_orientation': 'portrait',
            'fit_selected_orientation': 'auto',
            'fit_horizontal': 0,
            'fit_vertical': 0,
            'fit_total': 0,
            'fit_landscape_total': 0,
            'fit_portrait_total': 0,
            'is_active': False,   # По умолчанию многостраничный режим не активен
        })


@require_http_methods(["GET"])
def multipage_get_bindings(request):
    """
    Возвращает список всех способов скрепления.
    """
    bindings = MultipageBinding.objects.all()
    return JsonResponse({
        'success': True,
        'bindings': [
            {
                'id': b.id,
                'name': b.name,
                'page_multiple': b.page_multiple,
                'paper_coefficient': float(b.paper_coefficient),
                'description': b.description,
            }
            for b in bindings
        ]
    })


@require_http_methods(["GET"])
def multipage_calculate(request, print_component_id, copies=None):
    """
    Выполняет расчёт количества листов для заданного компонента (без сохранения).
    """
    if copies is None:
        copies = request.GET.get('copies')
    try:
        copies = int(copies) if copies else None
    except ValueError:
        return JsonResponse({'success': False, 'message': 'Неверное значение copies'}, status=400)

    obj = get_object_or_404(VichisliniyaMultipageModel, print_component_id=print_component_id)
    if copies is not None:
        obj.copies = copies
    obj.calculate_sheet_count()
    return JsonResponse({
        'success': True,
        'sheet_count': float(obj.sheet_count),
        'formula': f"ceil(({obj.total_pages}/{obj.fit_total}) * {obj.copies})"
    })


@csrf_exempt
@require_http_methods(["POST"])
def multipage_delete_data(request):
    """
    Удаляет многостраничную запись для указанного компонента.
    """
    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'success': False, 'message': 'Неверный JSON'}, status=400)
    print_component_id = data.get('print_component_id')
    if not print_component_id:
        return JsonResponse({'success': False, 'message': 'Не указан ID компонента'}, status=400)
    try:
        obj = VichisliniyaMultipageModel.objects.get(print_component_id=print_component_id)
        obj.delete()
        return JsonResponse({'success': True, 'message': 'Запись удалена'})
    except VichisliniyaMultipageModel.DoesNotExist:
        return JsonResponse({'success': True, 'message': 'Запись уже отсутствует'})