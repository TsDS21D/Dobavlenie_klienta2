"""
Токены для прямой загрузки файлов клиентом с сайта bukva-a.ru.

ЗАЧЕМ:
    Браузер клиента грузит макет напрямую в ИС (минуя сайт), иначе 500 МБ
    проходят дважды и упираются в лимиты хостинга. Но браузеру нельзя давать
    секретный BUKVA_SENDER_TOKEN — он для серверных вызовов.

    Поэтому сайт получает у ИС короткоживущий ПОДПИСАННЫЙ токен и отдаёт его
    браузеру. Токен разрешает только загрузку файлов и только для конкретной
    корзины; подделать его нельзя без секрета.

ФОРМАТ:
    <base64url(payload)>.<hex(hmac_sha256(secret, payload))>
    payload = {"cart_token": "a3f9…", "exp": 1763500000}

    Без точки в base64url проблем нет, разделитель однозначный.

СЕКРЕТ:
    settings.WEB_ORDER_UPLOAD_SECRET. Если не задан — используется
    BUKVA_SENDER_TOKEN (чтобы не плодить переменные, пока не понадобится
    отдельный ключ).
"""

import base64
import hashlib
import hmac
import json
import time

from django.conf import settings


def _get_secret():
    """Возвращает секрет для подписи токенов загрузки."""
    secret = getattr(settings, 'WEB_ORDER_UPLOAD_SECRET', '')
    if not secret:
        # Запасной вариант: тот же ключ, что у приёма заявок.
        secret = getattr(settings, 'BUKVA_SENDER_TOKEN', '')
    return str(secret)


def _sign(payload_b64):
    """Считает подпись для base64-строки payload."""
    secret = _get_secret()
    return hmac.new(
        secret.encode('utf-8'),
        payload_b64.encode('ascii'),
        hashlib.sha256,
    ).hexdigest()


def make_upload_token(cart_token, ttl_hours=None):
    """
    Создаёт подписанный токен загрузки для корзины.

    Аргументы:
        cart_token — идентификатор корзины, сгенерированный сайтом;
        ttl_hours  — срок жизни в часах (по умолчанию из настроек).

    Возвращает:
        (token, expires_at_unix) — строку токена и время истечения.

    Бросает ValueError, если секрет не настроен: без него токен
    нечем подписывать, и выдавать «пустой» токен нельзя.
    """
    if not _get_secret():
        raise ValueError('Не настроен WEB_ORDER_UPLOAD_SECRET (или BUKVA_SENDER_TOKEN)')

    if ttl_hours is None:
        ttl_hours = getattr(settings, 'WEB_ORDER_UPLOAD_TOKEN_TTL_HOURS', 24)

    expires_at = int(time.time()) + int(ttl_hours) * 3600

    payload = {
        'cart_token': str(cart_token)[:64],
        'exp': expires_at,
    }

    payload_b64 = base64.urlsafe_b64encode(
        json.dumps(payload, separators=(',', ':')).encode('utf-8')
    ).decode('ascii').rstrip('=')

    return f'{payload_b64}.{_sign(payload_b64)}', expires_at


def parse_upload_token(token):
    """
    Проверяет токен и возвращает payload словарём.

    Возвращает None, если токен битый, подпись не совпала или истёк срок.
    Никаких исключений: вызывающий код отвечает 400/403 по факту None.
    """
    if not token or '.' not in token:
        return None

    payload_b64, signature = token.rsplit('.', 1)

    # Сравнение подписи постоянное время — защита от timing-атак.
    expected = _sign(payload_b64)
    if not hmac.compare_digest(signature, expected):
        return None

    try:
        # Восстанавливаем паддинг, срезанный при кодировании.
        padded = payload_b64 + '=' * (-len(payload_b64) % 4)
        payload = json.loads(base64.urlsafe_b64decode(padded.encode('ascii')))
    except (ValueError, json.JSONDecodeError):
        return None

    if not isinstance(payload, dict):
        return None

    if not payload.get('cart_token'):
        return None

    if int(payload.get('exp', 0)) < int(time.time()):
        return None

    return payload

# ============================================================================
# ТОКЕНЫ НА СКАЧИВАНИЕ ФАЙЛОВ (для ЛК клиента)
# ============================================================================
# Клиент в личном кабинете на сайте скачивает макет напрямую с ИС.
# Логина в ИС у него нет, поэтому ссылка подписывается: внутри id файла
# и срок жизни. Подделать нельзя, живёт 1 час — этого хватает, чтобы
# клиент нажал «Скачать», но недостаточно для «вечной» ссылки в переписке.
# ============================================================================


def make_download_token(file_id, ttl_seconds=None):
    """
    Создаёт подписанный токен на скачивание конкретного файла.

    Аргументы:
        file_id     — id записи WebOrderItemFile;
        ttl_seconds — срок жизни (по умолчанию 1 час).

    Возвращает строку токена.
    """
    import time as _time

    if not _get_secret():
        raise ValueError('Не настроен WEB_ORDER_UPLOAD_SECRET (или BUKVA_SENDER_TOKEN)')

    if ttl_seconds is None:
        ttl_seconds = 3600

    payload = {
        'fid': int(file_id),
        'exp': int(_time.time()) + int(ttl_seconds),
    }

    payload_b64 = base64.urlsafe_b64encode(
        json.dumps(payload, separators=(',', ':')).encode('utf-8')
    ).decode('ascii').rstrip('=')

    return f'{payload_b64}.{_sign(payload_b64)}'


def parse_download_token(token):
    """
    Проверяет токен скачивания.

    Возвращает payload словарём либо None, если токен битый,
    подпись не совпала или истёк срок.
    """
    if not token or '.' not in token:
        return None

    payload_b64, signature = token.rsplit('.', 1)

    if not hmac.compare_digest(signature, _sign(payload_b64)):
        return None

    try:
        padded = payload_b64 + '=' * (-len(payload_b64) % 4)
        payload = json.loads(base64.urlsafe_b64decode(padded.encode('ascii')))
    except (ValueError, json.JSONDecodeError):
        return None

    if not isinstance(payload, dict) or not payload.get('fid'):
        return None

    if int(payload.get('exp', 0)) < int(time.time()):
        return None

    return payload

# ============================================================================
# ТОКЕНЫ НА ЗАГРУЗКУ ПРАВКИ К ЗАКАЗУ (из личного кабинета)
# ============================================================================
# Клиент в ЛК прикладывает новый макет к уже существующему заказу.
# Токен привязан к конкретному заказу и конкретной позиции: получив его,
# нельзя загрузить файл в чужой заказ или в другую позицию.
# ============================================================================


def make_order_upload_token(order_number, item_id, ttl_hours=None):
    """
    Создаёт подписанный токен на загрузку файла к позиции заказа.

    Аргументы:
        order_number — номер заказа сайта (например, 'M-01074');
        item_id      — id позиции заявки в ИС (WebOrderItem.id);
        ttl_hours    — срок жизни в часах (по умолчанию 1).

    Возвращает (token, expires_at).
    """
    import time as _time

    if not _get_secret():
        raise ValueError('Не настроен WEB_ORDER_UPLOAD_SECRET (или BUKVA_SENDER_TOKEN)')

    if ttl_hours is None:
        ttl_hours = 1

    expires_at = int(_time.time()) + int(ttl_hours) * 3600

    payload = {
        'on': str(order_number)[:50],
        'iid': int(item_id),
        'exp': expires_at,
    }

    payload_b64 = base64.urlsafe_b64encode(
        json.dumps(payload, separators=(',', ':')).encode('utf-8')
    ).decode('ascii').rstrip('=')

    return f'{payload_b64}.{_sign(payload_b64)}', expires_at


def parse_order_upload_token(token):
    """
    Проверяет токен загрузки к заказу.

    Возвращает payload словарём либо None.
    """
    if not token or '.' not in token:
        return None

    payload_b64, signature = token.rsplit('.', 1)

    if not hmac.compare_digest(signature, _sign(payload_b64)):
        return None

    try:
        padded = payload_b64 + '=' * (-len(payload_b64) % 4)
        payload = json.loads(base64.urlsafe_b64decode(padded.encode('ascii')))
    except (ValueError, json.JSONDecodeError):
        return None

    if not isinstance(payload, dict):
        return None

    if not payload.get('on') or not payload.get('iid'):
        return None

    if int(payload.get('exp', 0)) < int(time.time()):
        return None

    return payload

# ============================================================================
# ТОКЕНЫ НА СКАЧИВАНИЕ СЧЁТА
# ============================================================================
# Счёт — это PDF с реквизитами клиента. Лежит в media/web_orders/invoices/
# и не должен быть доступен по прямой ссылке. Клиент получает его в ЛК
# по подписанной ссылке, как и макеты.
# ============================================================================


def make_invoice_token(site_status_id, ttl_seconds=None):
    """
    Создаёт подписанный токен на скачивание счёта.

    Аргументы:
        site_status_id — id записи SiteOrderStatus (в ней лежит файл счёта);
        ttl_seconds    — срок жизни (по умолчанию 1 час).
    """
    import time as _time

    if not _get_secret():
        raise ValueError('Не настроен WEB_ORDER_UPLOAD_SECRET (или BUKVA_SENDER_TOKEN)')

    if ttl_seconds is None:
        ttl_seconds = 3600

    payload = {
        'inv': int(site_status_id),
        'exp': int(_time.time()) + int(ttl_seconds),
    }

    payload_b64 = base64.urlsafe_b64encode(
        json.dumps(payload, separators=(',', ':')).encode('utf-8')
    ).decode('ascii').rstrip('=')

    return f'{payload_b64}.{_sign(payload_b64)}'


def parse_invoice_token(token):
    """Проверяет токен счёта. Возвращает payload или None."""
    if not token or '.' not in token:
        return None

    payload_b64, signature = token.rsplit('.', 1)

    if not hmac.compare_digest(signature, _sign(payload_b64)):
        return None

    try:
        padded = payload_b64 + '=' * (-len(payload_b64) % 4)
        payload = json.loads(base64.urlsafe_b64decode(padded.encode('ascii')))
    except (ValueError, json.JSONDecodeError):
        return None

    if not isinstance(payload, dict) or not payload.get('inv'):
        return None

    if int(payload.get('exp', 0)) < int(time.time()):
        return None

    return payload