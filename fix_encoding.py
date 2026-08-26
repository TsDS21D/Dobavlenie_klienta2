# fix_encoding.py
import subprocess
import sys

def create_requirements():
    """Создает requirements.txt с правильной кодировкой"""
    
    print("📝 Создаем requirements.txt с правильной кодировкой...")
    
    try:
        # Получаем список пакетов
        result = subprocess.run(
            [sys.executable, "-m", "pip", "freeze"],
            capture_output=True,
            text=True,
            encoding='utf-8',
            errors='ignore'
        )
        
        if result.returncode != 0:
            print(f"❌ Ошибка выполнения pip freeze: {result.stderr}")
            return False
        
        # Фильтруем пакеты
        packages = []
        for line in result.stdout.split('\n'):
            line = line.strip()
            if line and 'pkg-resources' not in line:
                packages.append(line)
        
        # Сортируем
        packages.sort(key=lambda x: x.lower())
        
        # Структурируем вывод
        content = """# requirements.txt
# Проект: Система управления заказами типографии
# Автоматически сгенерировано

"""
        
        # Добавляем пакеты
        content += '\n'.join(packages)
        
        # Записываем файл
        with open('requirements.txt', 'w', encoding='utf-8', newline='\n') as f:
            f.write(content)
        
        print(f"✅ requirements.txt создан успешно!")
        print(f"📦 Всего пакетов: {len(packages)}")
        
        # Покажем первые 10
        print("\nПервые 10 пакетов:")
        for pkg in packages[:10]:
            print(f"  {pkg}")
        
        return True
        
    except Exception as e:
        print(f"❌ Ошибка: {e}")
        return False

if __name__ == "__main__":
    create_requirements()