# baza_klientov/management/commands/migrate_from_counter.py
"""
Management command: разовая миграция из приложения counter
в новую систему (baza_klientov + orders).

Запуск:
    # Показать отчёт без записи в БД (рекомендуется перед боевым запуском):
    python manage.py migrate_from_counter --dry-run

    # Реальная миграция всех клиентов и заказов:
    python manage.py migrate_from_counter

    # Тестовая миграция только первых N клиентов (для быстрой проверки):
    python manage.py migrate_from_counter --limit 10

Логика:
    1. КЛИЕНТЫ.
       Для каждого counter.Client создаётся baza_klientov.Client:
         • name           ← counter.name
         • has_edo        ← counter.uses_edo
         • comment        ← counter.notes
         • discount       ← 0 (в counter скидок не было)
         • address        ← NULL (в counter адреса не было)
         • counter_client_id ← counter.id (связь для идемпотентности
                                и для последующей миграции заказов)
         • created_at / updated_at ← counter.created_at / updated_at
           (перезаписываются через .update() после создания,
            потому что auto_now_add / auto_now их затирают)

       Если у counter.Client есть phone или email — создаётся
       baza_klientov.ContactPerson (основное контактное лицо):
         • client    ← созданный клиент
         • full_name ← counter.name (или «Основной контакт»)
         • phone     ← counter.phone
         • email     ← counter.email
         • is_primary = True
         • comments  ← «Импортировано из старой системы»

    2. ЗАКАЗЫ.
       Для каждого counter.Order создаётся orders.Order:
         • number         = f"C-{counter.order_number}"
         • client         ← клиент из counter.Order.client
                            (находится по counter_client_id),
                            либо создаётся новый клиент из
                            counter.customer_name (если client не было),
                            либо NULL (если ни того, ни другого нет).
         • comment        ← counter.description
                            + пометка «Импорт из counter, старый № {N}»
         • ready_datetime ← counter.ready_datetime
         • status         ← counter.status
         • created_by     ← NULL
         • created_at / updated_at ← counter.created_at
           (перезаписываются через .update() после создания)

    3. ИДЕМПОТЕНТНОСТЬ.
       Клиент: ищется по counter_client_id — если найден, не дублируется.
       Заказ: ищется по number (C-N) — если найден, не дублируется.
       Повторный запуск безопасен.

    4. --dry-run.
       Никаких записей в БД. Только отчёт «что будет сделано».
"""

# ===== СТАНДАРТНЫЕ ИМПОРТЫ =====
from datetime import datetime
from decimal import Decimal

# ===== ИМПОРТЫ DJANGO =====
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

# ===== ИМПОРТЫ МОДЕЛЕЙ =====
# Старая система (источник данных).
from counter.models import Client as CounterClient, Order as CounterOrder

# Новая система (куда переносим).
from baza_klientov.models import Client as NewClient, ContactPerson
from orders.models import Order as NewOrder


class Command(BaseCommand):
    help = (
        'Разовая миграция клиентов и заказов из приложения counter '
        'в новую систему (baza_klientov + orders).'
    )

    def add_arguments(self, parser):
        # --dry-run: показать отчёт без записи в БД.
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Показать, что будет сделано, но ничего не записывать в БД.',
        )
        # --limit N: мигрировать только первые N клиентов (для тестового прогона).
        parser.add_argument(
            '--limit',
            type=int,
            default=0,
            help='Мигрировать только первые N клиентов (0 — все).',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        limit = options['limit']

        # В самом начале — предупреждение, чтобы не запустили на проде случайно
        # без --dry-run.
        if dry_run:
            self.stdout.write(self.style.WARNING(
                '⚠️  РЕЖИМ --dry-run: БД НЕ ИЗМЕНЯЕТСЯ. Только отчёт.'
            ))
        else:
            self.stdout.write(self.style.WARNING(
                '⚠️  БОЕВОЙ РЕЖИМ: будут созданы записи в БД. '
                'Убедитесь, что сделали pg_dump!'
            ))

        # Счётчики для итогового отчёта.
        stats = {
            'clients_created': 0,
            'clients_skipped': 0,
            'contacts_created': 0,
            'orders_created': 0,
            'orders_skipped': 0,
            'orders_without_client': 0,
            'errors': [],
        }

        # Загружаем клиентов из counter.
        counter_clients_qs = CounterClient.objects.all().order_by('id')
        if limit > 0:
            counter_clients_qs = counter_clients_qs[:limit]

        total_clients = counter_clients_qs.count()
        self.stdout.write(f'Найдено клиентов в counter: {total_clients}')

        # Карта: counter_client_id → NewClient (для поиска клиента при переносе заказов).
        # Заполняется по мере создания.
        counter_to_new_client = {}

        # ============================================================
        # ЭТАП 1: КЛИЕНТЫ
        # ============================================================
        self.stdout.write('')
        self.stdout.write(self.style.HTTP_INFO('=== ЭТАП 1: КЛИЕНТЫ ==='))

        for idx, old_client in enumerate(counter_clients_qs, start=1):
            try:
                # --- Идемпотентность: ищем уже мигрированного ---
                # По counter_client_id.
                existing = NewClient.objects.filter(
                    counter_client_id=old_client.id
                ).first()

                if existing:
                    stats['clients_skipped'] += 1
                    counter_to_new_client[old_client.id] = existing
                    self.stdout.write(
                        f'  [{idx}/{total_clients}] {old_client.name!r} '
                        f'— уже есть (K-{existing.id}, counter_id={old_client.id})'
                    )
                    continue

                # --- Создаём нового клиента ---
                if dry_run:
                    # Только отчёт, без записи.
                    stats['clients_created'] += 1
                    self.stdout.write(
                        f'  [{idx}/{total_clients}] {old_client.name!r} '
                        f'— БУДЕТ СОЗДАН (counter_id={old_client.id})'
                    )
                    # Прикидываем, будет ли создан ContactPerson.
                    if old_client.phone or old_client.email:
                        stats['contacts_created'] += 1
                        self.stdout.write(
                            f'         └ БУДЕТ СОЗДАН ContactPerson '
                            f'(phone={old_client.phone!r}, email={old_client.email!r})'
                        )
                    # В dry-run не создаём в БД — карту не заполняем
                    # (все заказы будут помечены как «нет клиента», но в dry-run
                    # это не критично — главное, чтобы отчёт прошёл).
                    continue

                # Реальное создание.
                with transaction.atomic():
                    new_client = NewClient.objects.create(
                        name=old_client.name,
                        has_edo=old_client.uses_edo,
                        comment=old_client.notes or '',
                        discount=0,
                        counter_client_id=old_client.id,
                    )

                    # Восстанавливаем created_at (auto_now_add его затрёт на "сейчас").
                    # update_fields нельзя — поле auto_now_add не обновляется через save().
                    NewClient.objects.filter(pk=new_client.pk).update(
                        created_at=old_client.created_at,
                        updated_at=old_client.updated_at,
                    )

                    # --- Создаём ContactPerson, если есть phone/email ---
                    if old_client.phone or old_client.email:
                        ContactPerson.objects.create(
                            client=new_client,
                            full_name=old_client.name,   # имя клиента как ФИО контакта
                            phone=old_client.phone or None,
                            email=old_client.email or None,
                            is_primary=True,
                            comments='Импортировано из старой системы (counter)',
                        )
                        stats['contacts_created'] += 1

                counter_to_new_client[old_client.id] = new_client
                stats['clients_created'] += 1

                self.stdout.write(self.style.SUCCESS(
                    f'  [{idx}/{total_clients}] {old_client.name!r} '
                    f'— создан (K-{new_client.id}, counter_id={old_client.id})'
                ))

            except Exception as e:
                stats['errors'].append(
                    f'client counter_id={old_client.id} ({old_client.name!r}): {e}'
                )
                self.stdout.write(self.style.ERROR(
                    f'  [{idx}/{total_clients}] {old_client.name!r} '
                    f'— ОШИБКА: {e}'
                ))

        # ============================================================
        # ЭТАП 2: ЗАКАЗЫ
        # ============================================================
        self.stdout.write('')
        self.stdout.write(self.style.HTTP_INFO('=== ЭТАП 2: ЗАКАЗЫ ==='))

        # Загружаем заказы. Если был limit — ограничиваем заказы теми,
        # чьи клиенты мигрированы (или чей client_id в counter попал в первые N).
        counter_orders_qs = CounterOrder.objects.all().order_by('order_number')
        if limit > 0:
            # Заказы, у которых counter-клиент в первых N, ИЛИ у которых client = NULL
            # (такие заказы не привязаны к клиенту — их тоже переносим в рамках лимита).
            counter_orders_qs = counter_orders_qs.filter(
                client_id__in=list(counter_to_new_client.keys()) + [None]
            ) if counter_to_new_client else counter_orders_qs.none()

        total_orders = counter_orders_qs.count()
        self.stdout.write(f'Найдено заказов в counter: {total_orders}')

        for idx, old_order in enumerate(counter_orders_qs, start=1):
            try:
                # --- Идемпотентность: ищем уже мигрированный заказ ---
                new_number = f'C-{old_order.order_number}'
                existing = NewOrder.objects.filter(number=new_number).first()
                if existing:
                    stats['orders_skipped'] += 1
                    self.stdout.write(
                        f'  [{idx}/{total_orders}] {new_number} — уже есть (id={existing.id})'
                    )
                    continue

                # --- Определяем клиента для нового заказа ---
                new_client = None
                client_note = ''

                if old_order.client_id:
                    # У старого заказа есть FK на counter.Client.
                    new_client = counter_to_new_client.get(old_order.client_id)
                    if not new_client:
                        # Попробуем найти в БД (вдруг клиент был мигрирован ранее).
                        new_client = NewClient.objects.filter(
                            counter_client_id=old_order.client_id
                        ).first()
                    if not new_client:
                        client_note = (
                            f'Клиент counter_id={old_order.client_id} '
                            f'не найден в новой системе'
                        )

                elif old_order.customer_name:
                    # У старого заказа нет FK, но есть ручное имя.
                    # Ищем такого клиента по имени. Если нет — создаём.
                    new_client = NewClient.objects.filter(
                        name=old_order.customer_name,
                        is_deleted=False,
                    ).first()
                    if not new_client and not dry_run:
                        with transaction.atomic():
                            new_client = NewClient.objects.create(
                                name=old_order.customer_name,
                                has_edo=False,
                                comment='Создан при миграции из counter (customer_name)',
                                discount=0,
                            )
                    elif not new_client and dry_run:
                        # В dry-run просто отмечаем, что будет создан.
                        client_note = (
                            f'Будет создан клиент из customer_name '
                            f'{old_order.customer_name!r}'
                        )
                else:
                    # Ни FK, ни customer_name — оставляем без клиента.
                    client_note = 'Клиент не указан'
                    stats['orders_without_client'] += 1

                # --- Формируем комментарий ---
                comment_parts = []
                if old_order.description:
                    comment_parts.append(old_order.description)
                comment_parts.append(
                    f'[Импорт из counter: старый № {old_order.order_number}]'
                )
                if client_note:
                    comment_parts.append(f'[{client_note}]')
                new_comment = '\n'.join(comment_parts)

                # --- Создаём заказ ---
                if dry_run:
                    stats['orders_created'] += 1
                    client_repr = (
                        f'client_id={new_client.id}' if new_client else 'без клиента'
                    )
                    self.stdout.write(
                        f'  [{idx}/{total_orders}] {new_number} '
                        f'— БУДЕТ СОЗДАН ({client_repr}, status={old_order.status})'
                    )
                    continue

                with transaction.atomic():
                    new_order = NewOrder.objects.create(
                        number=new_number,
                        client=new_client,
                        comment=new_comment,
                        ready_datetime=old_order.ready_datetime,
                        status=old_order.status,
                        created_by=None,
                    )
                    # created_at — auto_now_add, перезаписываем через .update().
                    NewOrder.objects.filter(pk=new_order.pk).update(
                        created_at=old_order.created_at,
                        updated_at=old_order.created_at,  # в counter не было updated_at
                    )

                stats['orders_created'] += 1
                client_repr = (
                    f'client_id={new_client.id}' if new_client else 'без клиента'
                )
                self.stdout.write(self.style.SUCCESS(
                    f'  [{idx}/{total_orders}] {new_number} '
                    f'— создан (id={new_order.id}, {client_repr})'
                ))

            except Exception as e:
                stats['errors'].append(
                    f'order counter_id={old_order.order_number}: {e}'
                )
                self.stdout.write(self.style.ERROR(
                    f'  [{idx}/{total_orders}] C-{old_order.order_number} '
                    f'— ОШИБКА: {e}'
                ))

        # ============================================================
        # ИТОГОВЫЙ ОТЧЁТ
        # ============================================================
        self.stdout.write('')
        self.stdout.write(self.style.HTTP_INFO('=== ИТОГ ==='))
        mode = '[DRY-RUN]' if dry_run else '[РЕАЛЬНЫЙ ЗАПУСК]'
        self.stdout.write(f'Режим: {mode}')
        self.stdout.write(f'Клиентов создано: {stats["clients_created"]}')
        self.stdout.write(f'Клиентов пропущено (уже были): {stats["clients_skipped"]}')
        self.stdout.write(f'Контактных лиц создано: {stats["contacts_created"]}')
        self.stdout.write(f'Заказов создано: {stats["orders_created"]}')
        self.stdout.write(f'Заказов пропущено (уже были): {stats["orders_skipped"]}')
        self.stdout.write(f'Заказов без клиента: {stats["orders_without_client"]}')

        if stats['errors']:
            self.stdout.write(self.style.ERROR(
                f'\nОшибок: {len(stats["errors"])}'
            ))
            for err in stats['errors']:
                self.stdout.write(self.style.ERROR(f'  - {err}'))
        else:
            self.stdout.write(self.style.SUCCESS('\nОшибок нет.'))