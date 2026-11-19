"""
Проверка и выравнивание последовательностей Postgres (sequence) после
восстановления базы.

ЗАЧЕМ:
    В Postgres счётчик первичного ключа — отдельный объект, он не
    выводится из данных. Если дамп содержит только данные
    (pg_dump --data-only, выгрузка в CSV, manage.py loaddata),
    строки вставляются с явными id, а счётчик остаётся на старом
    значении. Следующая вставка получает уже занятый id и падает с
        duplicate key value violates unique constraint "..._pkey"

    Классический пример из практики: «duplicate key
    calculator_laminate_pkey (id)=(175)» при включении ламинации.

ЧТО ДЕЛАЕТ:
    Сравнивает last_value каждой последовательности <таблица>_id_seq
    с MAX(id) в соответствующей таблице и показывает расхождения.
    С флагом --fix выравнивает счётчики по MAX(id).

    ДАННЫЕ НЕ МЕНЯЮТСЯ — правится только состояние последовательностей.

ИСПОЛЬЗОВАНИЕ:
    python manage.py check_sequences          # только показать
    python manage.py check_sequences --fix    # показать и выровнять
"""

from django.core.management.base import BaseCommand
from django.db import connection

# Служебные схемы, которые не трогаем: там нет наших таблиц.
SKIP_SCHEMAS = ('pg_catalog', 'information_schema')


class Command(BaseCommand):
    help = 'Проверяет и при необходимости выравнивает последовательности Postgres'

    def add_arguments(self, parser):
        parser.add_argument(
            '--fix',
            action='store_true',
            help='Выровнять счётчики по MAX(id). Данные не меняются.',
        )

    def handle(self, *args, **options):
        if connection.vendor != 'postgresql':
            self.stdout.write(self.style.WARNING(
                'Команда рассчитана на PostgreSQL. Текущая СУБД: %s' % connection.vendor
            ))
            return

        fix = options['fix']

        broken = self._collect()

        if not broken:
            self.stdout.write(self.style.SUCCESS(
                'Расхождений нет: все последовательности впереди MAX(id)'
            ))
            return

        self.stdout.write(self.style.WARNING(
            'Найдено расхождений: %d' % len(broken)
        ))

        for schema, sequence, last_value, max_id in broken:
            self.stdout.write(
                '  %-55s last_value=%-8s max(id)=%s'
                % (sequence, last_value if last_value is not None else '—', max_id)
            )

        if not fix:
            self.stdout.write('')
            self.stdout.write(
                'Запустите с флагом --fix, чтобы выровнять счётчики.'
            )
            return

        self.stdout.write('')
        self.stdout.write('Выравниваю...')

        with connection.cursor() as cursor:
            for schema, sequence, last_value, max_id in broken:
                cursor.execute(
                    'SELECT setval(%s::regclass, %s, true)',
                    ['%s.%s' % (schema, sequence), max_id],
                )

        self.stdout.write(self.style.SUCCESS(
            'Выровнено последовательностей: %d' % len(broken)
        ))

        # Контрольная проверка: после setval расхождений быть не должно.
        left = self._collect()

        if left:
            self.stdout.write(self.style.ERROR(
                'Остались расхождения: %d — проверьте вручную' % len(left)
            ))
        else:
            self.stdout.write(self.style.SUCCESS('Повторная проверка: расхождений нет'))

    def _collect(self):
        """
        Возвращает список (schema, sequence, last_value, max_id) для всех
        последовательностей, которые отстают от данных.
        """
        broken = []

        with connection.cursor() as cursor:
            cursor.execute("""
                SELECT schemaname, sequencename, last_value
                FROM pg_sequences
                WHERE sequencename LIKE %s
                ORDER BY sequencename
            """, ['%_id_seq'])

            sequences = cursor.fetchall()

        for schema, sequence, last_value in sequences:
            if schema in SKIP_SCHEMAS:
                continue

            table = sequence[:-len('_id_seq')]

            # Не у каждой последовательности таблица называется так же —
            # если таблицы нет, просто пропускаем.
            try:
                with connection.cursor() as cursor:
                    cursor.execute(
                        'SELECT COALESCE(MAX(id), 0) FROM "%s"."%s"' % (schema, table)
                    )
                    max_id = cursor.fetchone()[0]
            except Exception:
                connection.rollback()
                continue

            if max_id > (last_value or 0):
                broken.append((schema, sequence, last_value, max_id))

        return broken