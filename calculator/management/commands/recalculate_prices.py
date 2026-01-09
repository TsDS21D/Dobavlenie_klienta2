# calculator/management/commands/recalculate_prices.py
"""
Команда для массового пересчета цен печати на основе справочника цен.
"""

from django.core.management.base import BaseCommand
from calculator.models_list_proschet import PrintComponent
from print_price.utils import calculate_price_for_printer_and_copies


class Command(BaseCommand):
    help = 'Пересчитывает цены печати для всех компонентов на основе справочника цен'
    
    def add_arguments(self, parser):
        parser.add_argument(
            '--proschet',
            type=str,
            help='Номер просчёта для пересчета (например, PR-1)'
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Показать изменения без сохранения'
        )
    
    def handle(self, *args, **options):
        proschet_filter = options.get('proschet')
        dry_run = options.get('dry_run')
        
        # Формируем queryset
        queryset = PrintComponent.objects.filter(
            printer__isnull=False,
            proschet__circulation__isnull=False,
            is_deleted=False
        )
        
        if proschet_filter:
            queryset = queryset.filter(proschet__number=proschet_filter)
        
        total_count = queryset.count()
        updated_count = 0
        skipped_count = 0
        error_count = 0
        
        self.stdout.write(f"Найдено {total_count} компонентов для пересчета...")
        
        for component in queryset:
            try:
                # Рассчитываем цену
                calculated_price = calculate_price_for_printer_and_copies(
                    component.printer,
                    component.proschet.circulation
                )
                
                # Проверяем, изменилась ли цена
                if component.price_per_sheet != calculated_price:
                    if not dry_run:
                        component.price_per_sheet = calculated_price
                        component.is_price_calculated = True
                        component.save(update_fields=['price_per_sheet', 'is_price_calculated'])
                    
                    self.stdout.write(
                        self.style.SUCCESS(
                            f"{component.number}: {component.price_per_sheet} → {calculated_price} руб./лист "
                            f"(принтер: {component.printer.name}, тираж: {component.proschet.circulation})"
                        )
                    )
                    updated_count += 1
                else:
                    skipped_count += 1
                    
            except Exception as e:
                self.stdout.write(
                    self.style.ERROR(f"Ошибка при пересчете {component.number}: {str(e)}")
                )
                error_count += 1
        
        # Выводим итоги
        self.stdout.write("\n" + "="*50)
        self.stdout.write("ИТОГИ ПЕРЕСЧЕТА:")
        self.stdout.write(f"Всего компонентов: {total_count}")
        self.stdout.write(f"Обновлено: {updated_count}")
        self.stdout.write(f"Пропущено (без изменений): {skipped_count}")
        self.stdout.write(f"Ошибок: {error_count}")
        
        if dry_run:
            self.stdout.write(self.style.WARNING("РЕЖИМ ПРОСМОТРА: изменения не сохранены"))