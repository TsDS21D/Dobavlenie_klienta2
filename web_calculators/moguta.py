# web_calculators/moguta.py
"""
Клиент Moguta API (bukva-a.ru).

Реализует подпись и отправку запросов к Moguta API по протоколу,
описанному в библиотеке mogutaapi.php:

    sign = md5(token + method + htmlspecialchars(json_encode(param)) + secret)

где htmlspecialchars — PHP-функция (экранирует &, <, >, "),
а из результата дополнительно удаляется подстрока "amp;".

Класс НЕ зависит от Django — принимает все параметры в конструктор.
Фабрика get_client() создаёт клиент из настроек Django.
"""

import hashlib
import time
import json
import logging
import threading
from typing import Any, Optional
from urllib.parse import urlencode

import requests

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Переиспользование соединения (keep-alive) и пауза между запросами
# ---------------------------------------------------------------------------
# Хостинг сайта ограничивает частоту новых TLS-рукопожатий с одного IP:
# при серии запросов подряд он на время перестаёт отвечать на HTTPS.
# Держим по одному соединению на поток и не отправляем запросы чаще,
# чем раз в MIN_REQUEST_INTERVAL секунд.
_local = threading.local()
_pace_lock = threading.Lock()
_last_request_at = 0.0
MIN_REQUEST_INTERVAL = 0.5


def _get_session() -> requests.Session:
    """Возвращает переиспользуемое HTTP-соединение для текущего потока."""
    session = getattr(_local, 'session', None)

    if session is None:
        session = requests.Session()
        session.headers.update({'X-Requested-With': 'XMLHttpRequest'})
        _local.session = session

    return session


def _pace_request() -> None:
    """Выдерживает паузу между запросами к Moguta API."""
    global _last_request_at

    with _pace_lock:
        now = time.time()
        delta = now - _last_request_at

        if delta < MIN_REQUEST_INTERVAL:
            time.sleep(MIN_REQUEST_INTERVAL - delta)

        _last_request_at = time.time()


# ============================================================================
# ИСКЛЮЧЕНИЕ
# ============================================================================

class MogutaError(Exception):
    """Ошибка при работе с Moguta API."""
    def __init__(self, message: str, error_code: Any = None, response: Any = None):
        super().__init__(message)
        self.message = message
        self.error_code = error_code
        self.response = response

    def __str__(self):
        if self.error_code is not None:
            return f"{self.message} (error={self.error_code})"
        return self.message


# ============================================================================
# ХЕЛПЕРЫ (совместимость с PHP)
# ============================================================================

def _php_htmlspecialchars(s: str) -> str:
    """
    Копия поведения PHP-функции htmlspecialchars()
    с флагами по умолчанию (ENT_COMPAT | ENT_HTML401):
      & → &amp;
      < → &lt;
      > → &gt;
      " → &quot;
      ' — НЕ экранируется.
    """
    return (
        s.replace('&', '&amp;')
         .replace('<', '&lt;')
         .replace('>', '&gt;')
         .replace('"', '&quot;')
    )


def _php_json_encode(param: Any) -> str:
    """
    Копия поведения PHP json_encode() с параметрами по умолчанию:
      - без пробелов между элементами,
      - не-ASCII символы экранируются в \\uXXXX,
      - порядок ключей сохраняется (как в исходном dict).
    """
    return json.dumps(param, ensure_ascii=True, separators=(',', ':'))


# ============================================================================
# КЛИЕНТ
# ============================================================================

class MogutaClient:
    """Клиент для работы с Moguta API."""

    def __init__(self, base_url: str, token: str, secret: str, timeout: int = 30):
        """
        :param base_url: базовый URL магазина, например 'https://bukva-a.ru'
                         (без /api — эндпоинт добавляется автоматически).
        :param token:    токен приложения из настроек Moguta.
        :param secret:   секретный ключ приложения.
        :param timeout:  таймаут HTTP-запроса в секундах.
        """
        self.base_url = base_url.rstrip('/')
        self.token = token
        self.secret = secret
        self.timeout = timeout
        self.api_url = f"{self.base_url}/api"

    # ------------------------------------------------------------------
    # Внутреннее: подпись и отправка
    # ------------------------------------------------------------------

    def _sign(self, method: str, param_json: str) -> str:
        """
        Считает подпись запроса так же, как mogutaapi.php:
            md5(token + method + str_replace('amp;','', htmlspecialchars(param_json)) + secret)
        """
        escaped = _php_htmlspecialchars(param_json).replace('amp;', '')
        raw = f"{self.token}{method}{escaped}{self.secret}"
        return hashlib.md5(raw.encode('utf-8')).hexdigest()

    def _request(self, method: str, param: Any = None) -> dict:
        """
        Отправляет POST-запрос к Moguta API.
        Возвращает декодированный JSON-ответ (dict).
        При ошибке сети/парсинга/статуса — бросает MogutaError.
        """
        if param is None:
            param = {}

        param_json = _php_json_encode(param)
        sign = self._sign(method, param_json)

        post_data = {
            'token': self.token,
            'method': method,
            'param': param_json,
        }

        logger.debug("Moguta API → method=%s param=%s", method, param_json)

        # Соединение с сайтом иногда «зависает» на TLS — похоже, хостинг
        # ограничивает частоту новых TLS-рукопожатий с одного IP. Поэтому:
        #   1) переиспользуем соединение (keep-alive) вместо нового на каждый
        #      запрос — это резко сокращает число рукопожатий;
        #   2) выдерживаем паузу между запросами, чтобы не бить очередью;
        #   3) делаем не больше двух попыток.
        response = None
        last_exc = None

        for attempt in range(1, 3):
            try:
                _pace_request()
                response = _get_session().post(
                    self.api_url,
                    data=post_data,
                    timeout=(5, self.timeout),
                )
                break
            except requests.RequestException as exc:
                last_exc = exc

                if attempt < 2:
                    logger.warning(
                        "Moguta API: попытка %s из 2 не удалась (%s), повторяем через 2 с",
                        attempt, exc,
                    )
                    time.sleep(2)
                    continue

        if response is None:
            raise MogutaError(
                f"Сетевая ошибка при обращении к Moguta API: {last_exc}"
            ) from last_exc

        try:
            data = response.json()
        except ValueError as exc:
            raise MogutaError(
                f"Ответ Moguta API не является JSON: {response.text[:200]}"
            ) from exc

        logger.debug("Moguta API ← %s", data)

        if data.get('status') != 'OK':
            raise MogutaError(
                "Moguta API вернул ошибку",
                error_code=data.get('error'),
                response=data,
            )

        return data

    # ------------------------------------------------------------------
    # Публичные методы
    # ------------------------------------------------------------------

    def test(self) -> dict:
        """Проверка подключения. Возвращает response (эхо переданного param)."""
        data = self._request('test', {'ping': 'ok'})
        return data.get('response', {})

    def get_product_by_code(self, code: str) -> Optional[dict]:
        """
        Ищет товар по артикулу (code).
        Возвращает dict с данными товара или None, если не найден.
        """
        data = self._request('getProduct', {
            'code': [code],
            'property': True,
            'variants': True,
        })
        response = data.get('response') or {}

        if isinstance(response, str):
            # Пример: 'Товары не найдены'
            return None

        products = response.get('products') or []
        if not products:
            return None

        return products[0]

    def import_product(self, product: dict) -> bool:
        """
        Создаёт или обновляет товар.
        product — dict с полями: title, code, price, count, cat_id, description и т.п.
        """
        data = self._request('importProduct', {'products': [product]})
        logger.info("Moguta importProduct OK: code=%s", product.get('code'))
        return True

    def delete_product(self, product_id: int) -> bool:
        """Удаляет товар по id."""
        self._request('deleteProduct', {'products': [int(product_id)]})
        logger.info("Moguta deleteProduct OK: id=%s", product_id)
        return True


# ============================================================================
# ФАБРИКА (получает настройки из Django)
# ============================================================================

def get_client() -> MogutaClient:
    """Возвращает MogutaClient с настройками из django.conf.settings."""
    from django.conf import settings

    base_url = getattr(settings, 'MOGUTA_URL', '')
    token = getattr(settings, 'MOGUTA_TOKEN', '')
    secret = getattr(settings, 'MOGUTA_SECRET', '')

    if not base_url or not token or not secret:
        raise MogutaError(
            "Настройки MOGUTA_URL / MOGUTA_TOKEN / MOGUTA_SECRET не заданы"
        )

    return MogutaClient(base_url=base_url, token=token, secret=secret)