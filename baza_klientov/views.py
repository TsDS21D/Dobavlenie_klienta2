"""
views.py для приложения baza_klientov
Представления для работы с базой клиентов
ИЗМЕНЕНИЕ: Добавлены API для редактирования контактных лиц и изменена валидация формы
"""

from django.shortcuts import render, get_object_or_404, redirect
from django.http import JsonResponse
from django.contrib import messages
from django.views.decorators.http import require_POST, require_GET
from django.views.decorators.csrf import csrf_exempt
from django.db.models import Q
from django.contrib.auth.decorators import login_required
from django.views.decorators.cache import never_cache
import json
from .models import Client, ContactPerson
from .forms import ClientForm, ContactPersonForm, ClientInlineUpdateForm, ContactPersonInlineUpdateForm

@login_required(login_url='/login/')
def get_clients_api(request):
    """API endpoint для получения списка клиентов"""
    try:
        clients = Client.objects.all().order_by('client_number')
        clients_data = [client.to_dict() for client in clients]
        
        return JsonResponse({
            'success': True,
            'clients': clients_data,
            'count': len(clients_data)
        })
    except Exception as e:
        return JsonResponse({
            'success': False,
            'message': f'Ошибка при получении клиентов: {str(e)}'
        }, status=500)



@login_required(login_url='/login/')
@never_cache
def index(request):
    """
    Главная страница базы клиентов
    
    Отображает список клиентов с возможностью поиска и фильтрации
    """
    
    # Поиск по клиентам (если есть параметр search)
    search_query = request.GET.get('search', '').strip()
    
    # Получаем всех клиентов
    clients = Client.objects.all().order_by('-created_at')
    
    # Применяем поиск, если есть запрос
    if search_query:
        clients = clients.filter(
            Q(client_number__icontains=search_query) |
            Q(name__icontains=search_query) |
            Q(address__icontains=search_query) |
            Q(contact_persons__full_name__icontains=search_query)
        ).distinct()  # Убираем дубликаты при поиске по связанным полям
    
    # Форма для добавления нового клиента
    client_form = ClientForm()
    
    # Форма для добавления контактного лица (сначала пустая)
    contact_form = ContactPersonForm()
    
    # Получаем ID выбранного клиента для отображения контактов
    selected_client_id = request.GET.get('client_id')
    selected_client = None
    contact_persons = []
    
    if selected_client_id:
        try:
            selected_client = Client.objects.get(id=selected_client_id)
            # Получаем все контактные лица для этого клиента
            contact_persons = ContactPerson.objects.filter(client=selected_client).order_by('-is_primary', 'full_name')
        except Client.DoesNotExist:
            messages.error(request, "Выбранный клиент не найден")
    
    # Если пришел POST-запрос на добавление клиента
    if request.method == 'POST' and 'add_client' in request.POST:
        client_form = ClientForm(request.POST)
        if client_form.is_valid():
            client = client_form.save()
            messages.success(request, f"Клиент {client.client_number} успешно добавлен")
            return redirect(f"/baza_klientov/?client_id={client.id}")
    
    # Если пришел POST-запрос на добавление контактного лица
    if request.method == 'POST' and 'add_contact' in request.POST:
        contact_form = ContactPersonForm(request.POST)
        if contact_form.is_valid() and selected_client:
            contact = contact_form.save(commit=False)
            contact.client = selected_client
            contact.save()
            
            # Если отмечаем как основное, снимаем отметку с других
            if contact.is_primary:
                ContactPerson.objects.filter(client=selected_client, is_primary=True).exclude(id=contact.id).update(is_primary=False)
            
            messages.success(request, f"Контактное лицо {contact.full_name} добавлено")
            return redirect(f"/baza_klientov/?client_id={selected_client.id}")
    
    # Подготавливаем контекст для шаблона
    context = {
        'clients': clients,
        'selected_client': selected_client,
        'contact_persons': contact_persons,
        'client_form': client_form,
        'contact_form': contact_form,
        'search_query': search_query,
    }
    
    # Отображаем шаблон
    return render(request, 'baza_klientov/index.html', context)


@require_POST
def create_client(request):
    """
    Создание нового клиента через AJAX
    
    Args:
        request: POST-запрос с данными клиента
    
    Returns:
        JsonResponse: Результат операции
    """
    form = ClientForm(request.POST)
    
    if form.is_valid():
        client = form.save()
        
        return JsonResponse({
            'success': True,
            'message': 'Клиент успешно добавлен',
            'client': client.to_dict(),
        })
    else:
        return JsonResponse({
            'success': False,
            'errors': form.errors,
        }, status=400)


@require_POST
def create_contact_person(request):
    """
    Создание нового контактного лица через AJAX
    
    Args:
        request: POST-запрос с данными контакта
    
    Returns:
        JsonResponse: Результат операции
    """
    form = ContactPersonForm(request.POST)
    
    if form.is_valid():
        client_id = request.POST.get('client_id')
        
        if not client_id:
            return JsonResponse({
                'success': False,
                'error': 'Не указан клиент',
            }, status=400)
        
        try:
            client = Client.objects.get(id=client_id)
        except Client.DoesNotExist:
            return JsonResponse({
                'success': False,
                'error': 'Клиент не найден',
            }, status=404)
        
        contact = form.save(commit=False)
        contact.client = client
        contact.save()
        
        # Если отмечаем как основное, снимаем отметку с других
        if contact.is_primary:
            ContactPerson.objects.filter(client=client, is_primary=True).exclude(id=contact.id).update(is_primary=False)
        
        return JsonResponse({
            'success': True,
            'message': 'Контактное лицо добавлено',
            'contact': contact.to_dict(),
        })
    else:
        return JsonResponse({
            'success': False,
            'errors': form.errors,
        }, status=400)


@require_POST
def delete_client(request, client_id):
    """
    Удаление клиента
    
    Args:
        request: POST-запрос
        client_id: ID клиента для удаления
    
    Returns:
        JsonResponse или redirect
    """
    client = get_object_or_404(Client, id=client_id)
    
    # Сохраняем номер для сообщения
    client_number = client.client_number
    
    # Удаляем клиента (контактные лица удалятся автоматически из-за CASCADE)
    client.delete()
    
    if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
        return JsonResponse({
            'success': True,
            'message': f'Клиент {client_number} удален',
        })
    
    messages.success(request, f"Клиент {client_number} удален")
    return redirect('/baza_klientov/')


@require_POST
def delete_contact_person(request, contact_id):
    """
    Удаление контактного лица
    
    Args:
        request: POST-запрос
        contact_id: ID контактного лица для удаления
    
    Returns:
        JsonResponse
    """
    contact = get_object_or_404(ContactPerson, id=contact_id)
    client_id = contact.client.id
    
    contact.delete()
    
    return JsonResponse({
        'success': True,
        'message': 'Контактное лицо удалено',
        'client_id': client_id,
    })


@require_POST
@csrf_exempt
def update_client(request, client_id):
    """
    Обновление данных клиента через AJAX (in-line редактирование)
    
    Args:
        request: POST-запрос с данными для обновления
        client_id: ID клиента для обновления
    
    Returns:
        JsonResponse: Результат операции
    """
    client = get_object_or_404(Client, id=client_id)
    
    # Определяем, какое поле обновляется
    field_name = request.POST.get('field_name')
    new_value = request.POST.get('new_value')
    
    if not field_name or new_value is None:
        return JsonResponse({
            'success': False,
            'error': 'Не указано поле для обновления или новое значение'
        }, status=400)
    
    # Проверяем, что поле можно обновлять
    allowed_fields = ['name', 'discount', 'has_edo', 'address', 'bank_details']
    if field_name not in allowed_fields:
        return JsonResponse({
            'success': False,
            'error': f'Поле "{field_name}" нельзя обновлять таким способом'
        }, status=400)
    
    try:
        # Преобразуем значение в правильный тип данных
        if field_name == 'discount':
            new_value = int(float(new_value))
            if new_value < 0 or new_value > 100:
                raise ValueError("Скидка должна быть в диапазоне 0-100%")
        
        elif field_name == 'has_edo':
            # Преобразуем строку в булево значение
            new_value = new_value.lower() in ['true', '1', 'yes', 'да', 'on']
        
        elif field_name in ['address', 'bank_details']:
            # Для текстовых полей просто оставляем строку
            pass
        
        else:
            # Для поля name просто оставляем строку
            pass
        
        # Обновляем поле
        setattr(client, field_name, new_value)
        client.save()
        
        return JsonResponse({
            'success': True,
            'message': 'Данные клиента обновлены',
            'client': client.to_dict(),
            'field_name': field_name,
            'new_value': str(new_value),
        })
    
    except ValueError as e:
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=400)
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': f'Произошла ошибка при обновлении: {str(e)}'
        }, status=500)


@require_POST
@csrf_exempt
def update_contact_person(request, contact_id):
    """
    Обновление данных контактного лица через AJAX (in-line редактирование)
    
    ИСПРАВЛЕНИЕ: Добавлен новый API для обновления контактных лиц
    
    Args:
        request: POST-запрос с данными для обновления
        contact_id: ID контактного лица для обновления
    
    Returns:
        JsonResponse: Результат операции
    """
    contact = get_object_or_404(ContactPerson, id=contact_id)
    
    # Определяем, какое поле обновляется
    field_name = request.POST.get('field_name')
    new_value = request.POST.get('new_value')
    
    if not field_name or new_value is None:
        return JsonResponse({
            'success': False,
            'error': 'Не указано поле для обновления или новое значение'
        }, status=400)
    
    # Проверяем, что поле можно обновлять
    allowed_fields = ['full_name', 'position', 'phone', 'mobile', 'email', 'comments', 'is_primary']
    if field_name not in allowed_fields:
        return JsonResponse({
            'success': False,
            'error': f'Поле "{field_name}" нельзя обновлять таким способом'
        }, status=400)
    
    try:
        # Преобразуем значение в правильный тип данных
        if field_name == 'is_primary':
            # Преобразуем строку в булево значение
            new_value = new_value.lower() in ['true', '1', 'yes', 'да', 'on']
            
            # Если устанавливаем как основное, снимаем отметку с других контактов этого клиента
            if new_value:
                ContactPerson.objects.filter(client=contact.client, is_primary=True).exclude(id=contact.id).update(is_primary=False)
        
        # Обновляем поле
        setattr(contact, field_name, new_value)
        contact.save()
        
        return JsonResponse({
            'success': True,
            'message': 'Данные контактного лица обновлены',
            'contact': contact.to_dict(),
            'field_name': field_name,
            'new_value': str(new_value),
        })
    
    except ValueError as e:
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=400)
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': f'Произошла ошибка при обновлении: {str(e)}'
        }, status=500)


@require_POST
def toggle_primary_contact(request, contact_id):
    """
    Установка/снятие отметки "Основное контактное лицо"
    
    Args:
        request: POST-запрос
        contact_id: ID контактного лица
    
    Returns:
        JsonResponse
    """
    contact = get_object_or_404(ContactPerson, id=contact_id)
    
    # Если пытаемся установить как основное
    if not contact.is_primary:
        # Снимаем отметку с других контактов этого клиента
        ContactPerson.objects.filter(client=contact.client, is_primary=True).update(is_primary=False)
        contact.is_primary = True
        contact.save()
        message = f'{contact.full_name} теперь основное контактное лицо'
    else:
        # Если снимаем отметку
        contact.is_primary = False
        contact.save()
        message = f'Снята отметка "Основное" с {contact.full_name}'
    
    return JsonResponse({
        'success': True,
        'message': message,
        'contact': contact.to_dict(),
    })