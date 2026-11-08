# shablony_proschetov/utils.py
"""
Утилиты приложения "Справочник шаблонов просчётов".

Сейчас здесь одна функция — send_template_event(). Она отправляет
событие в WS-группу 'shablony', которую слушает consumer /ws/shablony/.

Формат payload (его получает клиент):
{
    "type":             "template_event",
    "event":            "created" | "updated" | "deleted",
    "template_id":      int,
    "template_name":    str,
    "category_id":      int | None,
    "changed_field":    "name" | "comment" | "circulation" | "category" | "created" | "deleted" | "",
    "actor_username":   str,
    "actor_session_key": str
}

Все поля — плоские, чтобы JS мог сравнивать actor_session_key со своим
(см. #shablony-toasts[data-session-key] в index.html) и игнорировать
собственные события.
"""

# Стандартные импорты
import json                                    # не нужен в этой функции, но оставим на будущее
from asgiref.sync import async_to_sync         # sync -> async мост для group_send
from channels.layers import get_channel_layer  # доступ к channel layer из settings.CHANNEL_LAYERS


# Имя WS-группы, в которую подписан consumer /ws/shablony/.
# Соответствует consumers.ShablonyConsumer.group_name.
GROUP_NAME = 'shablony'


def send_template_event(
    request,
    *,
    event,
    template_id,
    template_name='',
    category_id=None,
    changed_field='',
):
    """
    Отправляет событие о шаблоне в WS-группу 'shablony'.

    Аргументы (все, кроме request, — keyword-only):
        request         — текущий HttpRequest (нужен для user и session).
        event           — 'created' | 'updated' | 'deleted'.
        template_id     — id шаблона (int).
        template_name   — название шаблона (str, необязательно).
        category_id     — id категории (int | None).
        changed_field   — какое поле изменилось (для 'updated').

    Ничего не возвращает. Если channel layer не настроен — молча выходит.
    """
    channel_layer = get_channel_layer()
    if channel_layer is None:
        return

    # Уникальный ключ сессии автора — чтобы клиент мог отфильтровать
    # собственные события (тот же приём, что в /ws/proschety/).
    actor_session_key = request.session.session_key or ''
    actor_username = request.user.username if request.user.is_authenticated else ''

    # payload — то, что реально уйдёт в JSON клиенту.
    # Поле "type" внутри payload — метка для фронтенда (как в /ws/proschety/),
    # оно НЕ конфликтует с системным "type" ниже: тот лежит на уровне
    # сообщения канала и служит только для выбора метода consumer'а.
    payload = {
        'type': 'template_event',
        'event': event,
        'template_id': template_id,
        'template_name': template_name or '',
        'category_id': category_id,
        'changed_field': changed_field,
        'actor_username': actor_username,
        'actor_session_key': actor_session_key,
    }

    async_to_sync(channel_layer.group_send)(
        GROUP_NAME,
        {
            # Обработчик consumer'а называется template_message(event).
            # Channels сам преобразует "template_message" -> метод
            # template_message(self, event) у ShablonyConsumer.
            'type': 'template_message',
            # Полезная нагрузка для клиента.
            'payload': payload,
        },
    )