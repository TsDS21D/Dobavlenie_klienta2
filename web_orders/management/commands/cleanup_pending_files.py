"""
Очистка промежуточных файлов клиентов.

ЗАЧЕМ:
    Клиент может приложить макет на сайте и не оформить заказ: передумал,
    закрыл браузер, ушёл. Файл остаётся в media/web_orders/pending/
    и в таблице WebOrderPendingFile. Без уборки такие записи копятся
    и занимают диск (макеты бывают по сотни мегабайт).

ЧТО ДЕЛАЕМ:
    Удаляем записи старше N дней вместе с физическими файлами.
    Файлы, которые уже прикрепились к заявке, живут в другой таблице
    (WebOrderItemFile) — их эта команда не трогает.

ЗАПУСК:
    python manage.py cleanup_pending_files             # по умолчанию 3 дня
    python manage.py cleanup_pending_files --days 7    # другой срок
    python manage.py cleanup_pending_files --dry-run   # только показать

CRON (пример — каждый день в 4 утра):
    0 4 * * * cd /var/www/www-root/data/www/beauty-print.ru && ./venv/bin/python manage.py cleanup_pending_files >> /var/www/www-root/data/www/beauty-print.ru/logs/cleanup_pending.log 2>&1
"""

from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from web_orders.models import WebOrderPendingFile


class Command(BaseCommand):
    help = 'Удаляет промежуточные файлы клиентов, не привязанные к заявкам'

    def add_arguments(self, parser):
        parser.add_argument(
            '--days',
            type=int,
            default=3,
            help='Удалять записи старше N дней (по умолчанию 3)',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Только показать, что будет удалено, без удаления',
        )

    def handle(self, *args, **options):
        days = options['days']
        dry_run = options['dry_run']

        cutoff = timezone.now() - timedelta(days=days)

        # Сначала считаем объём: полезно видеть, сколько освободим.
        stale = WebOrderPendingFile.objects.filter(created_at__lt=cutoff)
        total = stale.count()
        total_bytes = sum(p.size or 0 for p in stale)

        if total == 0:
            self.stdout.write(
                f'Промежуточных файлов старше {days} дн. нет — убирать нечего'
            )
            return

        if dry_run:
            self.stdout.write(
                f'[dry-run] Будет удалено записей: {total}, '
                f'объём: {total_bytes / (1024 * 1024):.1f} МБ'
            )
            return

        removed = 0
        for pending in stale:
            # Файл удаляем до записи: если он уже пропал с диска,
            # запись всё равно должна исчезнуть.
            if pending.file:
                try:
                    pending.file.delete(save=False)
                except (OSError, ValueError):
                    pass

            pending.delete()
            removed += 1

        self.stdout.write(
            self.style.SUCCESS(
                f'Удалено записей: {removed}, '
                f'освобождено: {total_bytes / (1024 * 1024):.1f} МБ'
            )
        )