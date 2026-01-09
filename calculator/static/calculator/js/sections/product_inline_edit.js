// calculator/static/calculator/js/sections/product_inline_edit.js
// Простая прокси-функция для обновления секции "Изделие"
console.log('✅ product_inline_edit.js загружен - прокси-функции для секции "Изделие"');

/**
 * Функция для обновления секции "Изделие" данными просчёта
 * Эта функция вызывается из list_proschet.js
 * @param {Object} proschetData - Данные просчёта
 * @returns {Promise} - Промис, который разрешается после обновления
 */
function updateProductSectionFromProschet(proschetData) {
    console.log('📥 Вызов updateProductSectionFromProschet:', proschetData);
    
    return new Promise((resolve, reject) => {
        // Используем основную функцию из productSection
        if (window.productSection && window.productSection.updateFromProschet) {
            window.productSection.updateFromProschet(proschetData, (success) => {
                if (success) {
                    resolve(proschetData);
                } else {
                    reject(new Error('Не удалось обновить секцию "Изделие"'));
                }
            });
        } else {
            console.error('❌ Функция обновления секции "Изделие" не найдена');
            reject(new Error('Функция обновления секции "Изделие" не найдена'));
        }
    });
}

// Экспортируем функцию для использования в других файлах
window.productInlineEdit = {
    updateFromProschet: updateProductSectionFromProschet
};

console.log('✅ Прокси-функции для секции "Изделие" готовы');