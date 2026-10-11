# proschety/signals.py
#
# Сигналы приложения proschety.
# Слушаем post_save на модели Proschet. Когда создаётся новый просчёт —
# отправляем событие в WebSocket-группу proschety_list.
# Мягкое удаление отправляем вручную из view delete_proschet
# (is_deleted=True не поймать через created-логику post_save).

from django.db.models.signals import post_save
from django.dispatch import receiver
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync

from calculator.models_list_proschet import Proschet
from .middleware import get_current_user, get_current_session_key


@receiver(post_save, sender=Proschet)
def proschet_created_signal(sender, instance, created, **kwargs):
    """
    Срабатывает при каждом save(). Нас интересует только создание
    нового просчёта (created=True). Остальные save() — игнорируем.
    """
    if not created:
        return

    # Кто выполнил действие — из thread-local (заполнено middleware).
    user = get_current_user()
    session_key = get_current_session_key() or ''

    actor_username = ''
    if user and getattr(user, 'is_authenticated', False):
        actor_username = user.get_full_name() or user.username

    # Отправляем в WebSocket-группу.
    channel_layer = get_channel_layer()
    if channel_layer is None:
        return

    async_to_sync(channel_layer.group_send)(
        'proschety_list',
        {
            'type': 'proschet_event',
            'event': 'created',
            'proschet_id': instance.id,
            'proschet_number': instance.number,
            'proschet_title': instance.title,
            'actor_username': actor_username,
            'actor_session_key': session_key,
        }
    )