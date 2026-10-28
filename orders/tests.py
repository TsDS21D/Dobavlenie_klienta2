# orders/tests.py
"""
Тесты приложения orders.

Проверяем критичные сценарии «умного редактирования» и клонирования
изделий:
  1. api_replace_product_in_order — успешная замена (position сохраняется,
     старое изделие и просчёт помечены is_deleted, старая цена / новая
     цена возвращаются корректно).
  2. api_replace_product_in_order — откат при ошибке (если создание
     нового изделия падает, старое остаётся живым, просчёт тоже,
     нового Product не появляется).
  3. api_clone_product — клонирование в тот же заказ (оригинал не
     тронут, клон получает position = max+1, временный просчёт
     помечается is_deleted).

Используем @patch('orders.services._freeze_mass_volume'), чтобы не
зависеть от реальных формул расчёта массы/объёма. Нам в этих тестах
важен сам паттерн «создать-заменить-удалить», а не цифры.
"""

# ===== СТАНДАРТНЫЕ ИМПОРТЫ =====
import json                                              # Сериализация тела POST-запроса.
from decimal import Decimal                              # Точные десятичные числа.
from unittest.mock import patch                          # Подмена функций.

# ===== ИМПОРТЫ DJANGO =====
from django.contrib.auth import get_user_model           # Кастомный User проекта.
from django.test import TestCase                         # Базовый TestCase.

# ===== ИМПОРТЫ МОДЕЛЕЙ =====
from baza_klientov.models import Client                  # Клиент — обязательный FK у Order.
from calculator.models_list_proschet import Proschet     # Модель просчёта.
from .models import Order, Product                       # Наши модели.
from .services import create_proschet_from_product       # Для подготовки фикстуры.


# Стандартный User проекта (может быть переопределён через AUTH_USER_MODEL).
User = get_user_model()


class ReplaceProductInOrderTests(TestCase):
    """
    Тесты эндпоинта POST /orders/api/replace-product-in-order/.

    Тестируем именно view, а не сервис напрямую, потому что важна
    вся цепочка: @transaction.atomic + try/except + WebSocket-событие.
    """

    def setUp(self):
        """
        Готовим тестовые объекты:
          • пользователь (для @login_required);
          • клиент (для Order);
          • заказ + одно изделие с position=1 и ценой 1250.00.
        """
        # Пользователь — минимально достаточно.
        self.user = User.objects.create_user(
            username='test_user',
            password='test_pass_12345',
        )
        # Клиент — Order.client может быть None, но пусть будет.
        self.client_obj = Client.objects.create(name='Тест Клиент')
        # Заказ.
        self.order = Order.objects.create(client=self.client_obj)
        # Изделие-источник.
        self.old_product = Product.objects.create(
            order=self.order,
            title='Тестовое изделие',
            circulation=100,
            total_price=Decimal('1250.00'),
            position=1,
        )

    def test_replace_product_in_order_keeps_position_and_soft_deletes(self):
        """
        Успешная замена:
          • новое Product получает position = 1 (как у старого);
          • старое Product помечается is_deleted=True;
          • просчёт помечается is_deleted=True;
          • в ответе success=true и корректный price_changed.
        """
        # 1. Размораживаем изделие в просчёт — как это делает
        #    api_unfreeze_product. source_order обязателен (защита в view).
        with patch('orders.services._freeze_mass_volume'):
            proschet = create_proschet_from_product(
                self.old_product, source_order=self.order,
            )

        # 2. Логинимся.
        self.client.force_login(self.user)

        # 3. POST /orders/api/replace-product-in-order/.
        #    Патчим _freeze_mass_volume — внутри add_product_to_order она
        #    вызывается, а формулы нам здесь не важны.
        with patch('orders.services._freeze_mass_volume'):
            response = self.client.post(
                '/orders/api/replace-product-in-order/',
                data=json.dumps({
                    'proschet_id': proschet.id,
                    'old_product_id': self.old_product.id,
                }),
                content_type='application/json',
            )

        # 4. Проверяем HTTP-ответ.
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data['success'])
        self.assertIn('new_product_id', data)
        self.assertIn('price_changed', data)

        # 5. Освежаем объекты из БД.
        self.old_product.refresh_from_db()
        proschet.refresh_from_db()
        new_product = Product.objects.get(pk=data['new_product_id'])

        # 6. Проверки:
        # Старое изделие помечено удалённым.
        self.assertTrue(self.old_product.is_deleted)
        # Просчёт помечен удалённым.
        self.assertTrue(proschet.is_deleted)
        # Новое изделие — в том же заказе.
        self.assertEqual(new_product.order_id, self.order.id)
        # Новое изделие на той же позиции — это ключевое требование.
        self.assertEqual(new_product.position, 1)
        # Старое total_price — 1250; новое — 0 (нет компонентов),
        # значит price_changed=True.
        self.assertTrue(data['price_changed'])

    def test_replace_product_in_order_rolls_back_on_error(self):
        """
        Откат при ошибке:
          • если add_product_to_order падает, старое остаётся живым;
          • просчёт тоже остаётся живым;
          • нового Product нет.

        Почему это работает:
          • view обёрнут в @transaction.atomic;
          • add_product_to_order внутри себя тоже @transaction.atomic
            (вложенный savepoint);
          • мы ловим исключение и возвращаем JsonResponse(500),
            значит внешний atomic коммитит, но внутренний savepoint
            откатывает изменения add_product_to_order. До строк
            «old_product.is_deleted = True» выполнение не доходит.
        """
        # 1. Готовим просчёт.
        with patch('orders.services._freeze_mass_volume'):
            proschet = create_proschet_from_product(
                self.old_product, source_order=self.order,
            )

        # 2. Логинимся.
        self.client.force_login(self.user)

        # 3. Патчим add_product_to_order так, чтобы она бросила исключение.
        #    Патчим в orders.views — там она импортирована.
        with patch(
            'orders.views.add_product_to_order',
            side_effect=RuntimeError('boom'),
        ):
            response = self.client.post(
                '/orders/api/replace-product-in-order/',
                data=json.dumps({
                    'proschet_id': proschet.id,
                    'old_product_id': self.old_product.id,
                }),
                content_type='application/json',
            )

        # 4. Проверяем HTTP-ответ: 500 (наш except вернул 500).
        self.assertEqual(response.status_code, 500)
        data = response.json()
        self.assertFalse(data['success'])

        # 5. Освежаем.
        self.old_product.refresh_from_db()
        proschet.refresh_from_db()

        # 6. Проверки:
        # Старое изделие осталось живым.
        self.assertFalse(self.old_product.is_deleted)
        # Просчёт остался живым.
        self.assertFalse(proschet.is_deleted)
        # В заказе по-прежнему ровно одно активное изделие.
        self.assertEqual(
            Product.objects.filter(order=self.order, is_deleted=False).count(),
            1,
        )


class CloneProductTests(TestCase):
    """
    Тесты эндпоинта POST /orders/api/clone-product/.
    """

    def setUp(self):
        """Готовим: пользователь, клиент, заказ, два изделия (position 1 и 2)."""
        self.user = User.objects.create_user(
            username='test_user',
            password='test_pass_12345',
        )
        self.client_obj = Client.objects.create(name='Тест Клиент')
        self.order = Order.objects.create(client=self.client_obj)

        # Оригинал — с него будем клонировать.
        self.original = Product.objects.create(
            order=self.order,
            title='Оригинал',
            circulation=100,
            total_price=Decimal('1250.00'),
            position=1,
        )
        # Второе изделие — чтобы max(position) стал 2.
        self.second = Product.objects.create(
            order=self.order,
            title='Второе',
            circulation=50,
            total_price=Decimal('500.00'),
            position=2,
        )

    def test_clone_product_to_same_order(self):
        """
        Клонирование в тот же заказ:
          • оригинал НЕ тронут (is_deleted=False);
          • клон получает position = max+1 = 3;
          • временный просчёт помечен is_deleted=True;
          • в ответе success=true и корректные order_id / new_product_id.
        """
        # 1. Логинимся.
        self.client.force_login(self.user)

        # 2. POST /orders/api/clone-product/ без target_order_id —
        #    значит, клонируем в тот же заказ.
        #    Патчим _freeze_mass_volume — не считаем реальные формулы.
        with patch('orders.services._freeze_mass_volume'):
            response = self.client.post(
                '/orders/api/clone-product/',
                data=json.dumps({'product_id': self.original.id}),
                content_type='application/json',
            )

        # 3. Проверяем HTTP-ответ.
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data['success'])
        self.assertEqual(data['order_id'], self.order.id)

        # 4. Освежаем объекты из БД.
        self.original.refresh_from_db()
        new_product = Product.objects.get(pk=data['new_product_id'])

        # 5. Проверки:
        # Оригинал не тронут.
        self.assertFalse(self.original.is_deleted)
        # Клон — в том же заказе.
        self.assertEqual(new_product.order_id, self.order.id)
        # Клон — на позиции max(1,2) + 1 = 3 (в конец списка).
        self.assertEqual(new_product.position, 3)

        # Временный просчёт остался в БД с is_deleted=True.
        # Ищем среди тех, что были созданы с source_order=этот заказ.
        deleted_proschets = Proschet.objects.filter(
            source_order=self.order, is_deleted=True,
        )
        self.assertGreaterEqual(deleted_proschets.count(), 1)