const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

app.get('/test', (req, res) => {
    res.json({ message: 'Сервер работает!', timestamp: new Date() });
});

app.get('/health', (req, res) => {
    res.send('OK');
});

// ==================== КЭШ ====================

const userCache = new Map();

function getUserId(req) {
    const userData = req.body.userData || {};
    const userString = JSON.stringify({
        name: userData.name,
        age: userData.age,
        weight: userData.weight,
        height: userData.height,
        goal: userData.goal,
        activity: userData.activity,
        additionalInfo: userData.additionalInfo
    });
    const hash = require('crypto').createHash('md5').update(userString).digest('hex').slice(0, 12);
    return `user_${hash}`;
}

function checkCache(req, res, next) {
    const userId = getUserId(req);
    const path = req.path;
    const cacheKey = `${userId}_${path}`;
    const cached = userCache.get(cacheKey);

    if (cached) {
        console.log(`📦 Кэш для ${path}`);
        return res.json(cached.response);
    }

    req._cacheKey = cacheKey;
    const originalJson = res.json;
    res.json = function(data) {
        if (data.success && data.advice) {
            userCache.set(req._cacheKey, { response: data, timestamp: new Date() });
            data.cached = false;
        }
        return originalJson.call(this, data);
    };
    next();
}

function calculateBMIAndObesity(weight, height) {
    if (!weight || !height) return { bmi: '0.0', category: 'Не определено', obesityDegree: 0 };
    const heightM = height / 100;
    const bmi = weight / (heightM * heightM);
    let category = '';
    let obesityDegree = 0;
    if (bmi < 18.5) { category = 'Недостаточная масса'; obesityDegree = -1; }
    else if (bmi < 25) { category = 'Нормальная масса'; obesityDegree = 0; }
    else if (bmi < 30) { category = 'Избыточная масса'; obesityDegree = 1; }
    else if (bmi < 35) { category = 'Ожирение I степени'; obesityDegree = 2; }
    else if (bmi < 40) { category = 'Ожирение II степени'; obesityDegree = 3; }
    else { category = 'Ожирение III степени'; obesityDegree = 4; }
    return { bmi: bmi.toFixed(1), category, obesityDegree };
}

// ==================== ДИНАМИЧЕСКИЙ АНАЛИЗ ДЛЯ ТРЕНЕРА ====================

function getTrainerAdvice(userData, bmiData) {
    const { name, age, weight, height, goal, activity, additionalInfo } = userData;
    const genderText = userData.gender === 'male' ? 'мужчина' : 'женщина';
    const additionalText = additionalInfo || 'не указано';
    
    // 1. Анализ ИМТ
    let intensity = 'средняя';
    let cardioType = 'ходьба, велосипед';
    let strengthApproach = '3 подхода по 10-12 повторений';
    let contraindications = [];
    
    if (bmiData.obesityDegree >= 3) {
        intensity = 'низкая';
        cardioType = 'плавание, ходьба, эллиптический тренажёр';
        strengthApproach = '2 подхода по 12-15 повторений, лёгкие веса';
        contraindications.push('прыжки', 'бег', 'упражнения с осевой нагрузкой');
    } else if (bmiData.obesityDegree === 2) {
        intensity = 'низкая-средняя';
        cardioType = 'ходьба в горку, велосипед, эллипс';
        strengthApproach = '2-3 подхода по 10-12 повторений';
        contraindications.push('прыжки', 'бег по твёрдому покрытию');
    } else if (bmiData.obesityDegree === 1) {
        intensity = 'средняя';
        cardioType = 'интервальная ходьба, велосипед, лёгкий бег';
        strengthApproach = '3 подхода по 10-12 повторений';
    } else {
        intensity = 'средняя-высокая';
        cardioType = 'бег, велосипед, скакалка';
        strengthApproach = '3-4 подхода по 8-12 повторений';
    }
    
    // 2. Анализ возраста
    if (age > 55) {
        intensity = 'низкая';
        strengthApproach = strengthApproach.replace('подхода', 'подхода с акцентом на технику');
        contraindications.push('резкие движения', 'упражнения с большими весами');
        cardioType = cardioType + ', плавание';
    } else if (age > 40 && age <= 55) {
        intensity = intensity === 'низкая' ? 'низкая' : 'средняя';
        contraindications.push('рывковые движения');
    }
    
    // 3. Анализ цели
    let focus = '';
    let weeklyCardio = 0;
    let weeklyStrength = 0;
    
    if (goal === 'похудеть') {
        focus = 'жиросжигание';
        weeklyCardio = 3;
        weeklyStrength = 2;
        cardioType = cardioType + ' + HIIT 1-2 раза в неделю';
    } else if (goal === 'набрать массу') {
        focus = 'набор мышечной массы';
        weeklyCardio = 1;
        weeklyStrength = 4;
        strengthApproach = '3-4 подхода по 6-10 повторений с весом 70-80% от максимума';
    } else {
        focus = 'общее оздоровление';
        weeklyCardio = 2;
        weeklyStrength = 2;
    }
    
    // 4. Анализ активности
    let workoutDuration = 45;
    if (activity === 'низкая') {
        workoutDuration = 30;
        weeklyCardio = Math.max(2, weeklyCardio);
        weeklyStrength = Math.max(1, weeklyStrength);
    } else if (activity === 'высокая') {
        workoutDuration = 60;
    }
    
    // 5. Учёт дополнительной информации (болячки)
    let specialWarning = '';
    if (additionalInfo && additionalInfo !== 'не указано') {
        specialWarning = `\n⚠️ **С УЧЁТОМ ВАШИХ ОСОБЕННОСТЕЙ:** ${additionalInfo}\n`;
        if (additionalInfo.toLowerCase().includes('колен') || additionalInfo.toLowerCase().includes('сустав')) {
            contraindications.push('приседания со штангой', 'выпады с весом', 'прыжки');
            cardioType = 'плавание, велосипед, эллипс';
        }
        if (additionalInfo.toLowerCase().includes('спин') || additionalInfo.toLowerCase().includes('позвоночник')) {
            contraindications.push('становая тяга', 'скручивания с весом');
            cardioType = cardioType + ' (исключить бег по твёрдому)';
        }
        if (additionalInfo.toLowerCase().includes('сердц') || additionalInfo.toLowerCase().includes('давление')) {
            intensity = 'низкая';
            contraindications.push('интенсивные интервалы', 'задержка дыхания');
        }
    }
    
    // Формирование итогового текста
    let advice = `
🏋️ **ПЕРСОНАЛЬНЫЕ РЕКОМЕНДАЦИИ ПО ТРЕНИРОВКАМ**

**👤 ДЛЯ ВАС:** ${name}, ${age} лет, ${genderText}, вес ${weight} кг, рост ${height} см
**🎯 ЦЕЛЬ:** ${goal === 'похудеть' ? 'снижение веса' : (goal === 'набрать массу' ? 'набор мышечной массы' : 'общее оздоровление')}
**📊 ИМТ:** ${bmiData.bmi} (${bmiData.category})
${specialWarning}

---

**🎯 ОСНОВНЫЕ РЕКОМЕНДАЦИИ:**

• **Интенсивность:** ${intensity}
• **Фокус:** ${focus}
• **Частота:** ${weeklyStrength + weeklyCardio} раз в неделю (${weeklyStrength} силовых, ${weeklyCardio} кардио)
• **Длительность:** ${workoutDuration} минут

---

**🏋️ СИЛОВЫЕ ТРЕНИРОВКИ (${weeklyStrength} раза в неделю):**

${strengthApproach}

**Базовые упражнения:**
• Приседания с собственным весом (или с лёгкими гантелями)
• Отжимания от пола/скамьи
• Тяга верхнего блока или гантели к поясу
• Жим гантелей лёжа
• Планка 3×30-60 сек

**Важно:** Техника важнее веса. При любых болевых ощущениях — прекратить.

---

**🚴 КАРДИО-НАГРУЗКИ (${weeklyCardio} раза в неделю):**

**Рекомендуемый тип:** ${cardioType}

**Пример программы:**
• Разминка 5-10 мин
• Основная часть 20-30 мин (пульс ${Math.round(120 - age/4)}-${Math.round(160 - age/4)} уд/мин)
• Заминка и растяжка 5-10 мин

---

**⚠️ ПРОТИВОПОКАЗАНИЯ И МЕРЫ ПРЕДОСТОРОЖНОСТИ:**

${contraindications.length > 0 ? '• Избегайте: ' + contraindications.join(', ') : '• Соблюдайте стандартную технику безопасности'}
• Обязательная разминка 10-15 минут
• Питьевой режим: 150-200 мл воды каждые 15-20 мин тренировки
• При ухудшении самочувствия — прекратить занятие

---

⚠️ **ДИСКЛЕЙМЕР:** Рекомендации основаны на анализе методик мировых экспертов (Джо Вейдер, Майк Ментцер, Арнольд Шварценеггер, Табата Идзуми, Грег Глассман). Для персонализированной программы обратитесь к сертифицированному специалисту. Перед началом тренировок проконсультируйтесь с врачом.
    `;
    
    return advice;
}

// ==================== ДИНАМИЧЕСКИЙ АНАЛИЗ ДЛЯ ДИЕТОЛОГА ====================

function getDietAdvice(userData, bmiData) {
    const { name, age, weight, height, goal, activity, additionalInfo } = userData;
    const genderText = userData.gender === 'male' ? 'мужчина' : 'женщина';
    const additionalText = additionalInfo || 'не указано';
    
    // Базовые расчёты
    const bmr = genderText === 'мужчина' 
        ? 10 * weight + 6.25 * height - 5 * age + 5
        : 10 * weight + 6.25 * height - 5 * age - 161;
    
    let activityFactor = 1.2;
    if (activity === 'низкая') activityFactor = 1.2;
    else if (activity === 'средняя') activityFactor = 1.375;
    else activityFactor = 1.55;
    
    let tdee = Math.round(bmr * activityFactor);
    let calorieTarget = tdee;
    
    if (goal === 'похудеть') calorieTarget = Math.round(tdee * 0.8);
    else if (goal === 'набрать массу') calorieTarget = Math.round(tdee * 1.1);
    
    // Корректировка по ИМТ
    if (bmiData.obesityDegree >= 3) calorieTarget = Math.round(calorieTarget * 0.85);
    else if (bmiData.obesityDegree === 2) calorieTarget = Math.round(calorieTarget * 0.9);
    
    const protein = Math.round(weight * (goal === 'набрать массу' ? 2 : 1.8));
    const fat = Math.round(weight * 0.9);
    const carbs = Math.round((calorieTarget - protein*4 - fat*9) / 4);
    
    // Учёт дополнительной информации
    let specialWarning = '';
    let restrictions = '';
    if (additionalInfo && additionalInfo !== 'не указано') {
        specialWarning = `\n⚠️ **С УЧЁТОМ ВАШИХ ОСОБЕННОСТЕЙ:** ${additionalInfo}\n`;
        if (additionalInfo.toLowerCase().includes('сахар') || additionalInfo.toLowerCase().includes('диабет')) {
            restrictions = '• Исключить быстрые углеводы (сахар, сладости, белый хлеб)\n• Контролировать гликемический индекс продуктов';
        }
        if (additionalInfo.toLowerCase().includes('давление')) {
            restrictions = '• Ограничить соль (до 3-5 г/день)\n• Исключить копчёности, консервы, соленья';
        }
        if (additionalInfo.toLowerCase().includes('желуд') || additionalInfo.toLowerCase().includes('гастрит')) {
            restrictions = '• Исключить острое, жареное, кислое\n• Предпочтение варёной, тушёной, запечённой пище';
        }
    }
    
    let advice = `
🍽️ **ПЕРСОНАЛЬНЫЕ РЕКОМЕНДАЦИИ ПО ПИТАНИЮ**

**👤 ДЛЯ ВАС:** ${name}, ${age} лет, ${genderText}, вес ${weight} кг, рост ${height} см
**🎯 ЦЕЛЬ:** ${goal === 'похудеть' ? 'снижение веса' : (goal === 'набрать массу' ? 'набор мышечной массы' : 'общее оздоровление')}
**📊 ИМТ:** ${bmiData.bmi} (${bmiData.category})
${specialWarning}

---

**🍽️ ГЛАВНЫЙ ПРИНЦИП ПИТАНИЯ**

*«Треть желудка — пища, треть — вода, треть — воздух»*

**ПРАВИЛО ГОЛОДА:** Ешьте только когда действительно проголодались. Настоящий голод — пустота в желудке, лёгкое сосание под ложечкой.

**ПРАВИЛО НАПОЛНЕНИЯ:**
• 1/3 твёрдой пищей (овощи, крупы, белок)
• 1/3 жидкостью (вода, бульон, чай)
• 1/3 оставляйте для воздуха

---

**📊 РАСЧЁТ ПОТРЕБНОСТЕЙ:**

• **Суточная калорийность:** ${calorieTarget} ккал
• **Белки:** ${protein} г (${protein*4} ккал)
• **Жиры:** ${fat} г (${fat*9} ккал)
• **Углеводы:** ${carbs} г (${carbs*4} ккал)
• **Вода:** ${Math.round(weight*30)} мл

---

**🍽️ РЕКОМЕНДУЕМЫЕ ПРОДУКТЫ:**

**Белки:** куриная грудка, индейка, рыба, творог 5%, яйца, бобовые
**Углеводы:** гречка, овсянка, бурый рис, цельнозерновой хлеб
**Жиры:** оливковое масло, авокадо, орехи (20-30 г/день), рыбий жир
**Овощи:** любые сезонные (огурцы, помидоры, капуста, кабачки, зелень)

---

**📋 ПРИМЕРНОЕ МЕНЮ НА ДЕНЬ (${calorieTarget} ккал):**

**Завтрак (8:00):** овсянка на воде с ягодами + 2 яйца варёных (400-450 ккал)

**Обед (13:00):** куриная грудка 150г + гречка 100г + салат из овощей (500-550 ккал)

**Полдник (16:30):** творог 5% 150г + яблоко (200 ккал)

**Ужин (19:00):** рыба 150г + тушёные овощи (400-450 ккал)

${restrictions ? `\n**⚠️ ОСОБЫЕ ОГРАНИЧЕНИЯ:**\n${restrictions}` : ''}

---

⚠️ **ДИСКЛЕЙМЕР:** Рекомендации основаны на анализе методик мировых экспертов (Лайл Макдональд, Алан Арагон, Майкл Грегер, Уолтер Уиллетт, Маргарита Королева). Для персонализированной диеты обратитесь к диетологу. Перед изменением питания проконсультируйтесь с врачом.
    `;
    
    return advice;
}

// ==================== ДИНАМИЧЕСКИЙ АНАЛИЗ ДЛЯ ЭНЕРГИИ ====================

function getEnergyAdvice(userData, bmiData) {
    const { name, age, weight, goal, activity, additionalInfo } = userData;
    const genderText = userData.gender === 'male' ? 'мужчина' : 'женщина';
    
    // Определение хронотипа (упрощённый анализ)
    let chronotype = 'голубь';
    let wakeTime = '7:00';
    let sleepTime = '23:00';
    let peakHours = '10:00-13:00';
    
    if (age < 30) {
        chronotype = 'сова';
        wakeTime = '8:30';
        sleepTime = '0:30';
        peakHours = '14:00-18:00';
    } else if (age > 55) {
        chronotype = 'жаворонок';
        wakeTime = '6:00';
        sleepTime = '22:00';
        peakHours = '8:00-11:00';
    }
    
    // Корректировка по цели
    let stressLevel = 'средний';
    let recoveryFocus = 'сбалансированное восстановление';
    if (goal === 'похудеть') {
        stressLevel = 'повышенный (дефицит калорий)';
        recoveryFocus = 'особое внимание сну и гидратации';
    } else if (goal === 'набрать массу') {
        recoveryFocus = 'увеличение времени сна, питание до и после тренировок';
    }
    
    // Учёт ИМТ
    let sleepQualityWarning = '';
    if (bmiData.obesityDegree >= 2) {
        sleepQualityWarning = '\n• При избыточном весе возможно апноэ — обратите внимание на качество сна';
    }
    
    // Учёт дополнительной информации
    let specialWarning = '';
    if (additionalInfo && additionalInfo !== 'не указано') {
        specialWarning = `\n⚠️ **С УЧЁТОМ ВАШИХ ОСОБЕННОСТЕЙ:** ${additionalInfo}\n`;
        if (additionalInfo.toLowerCase().includes('бессонниц') || additionalInfo.toLowerCase().includes('сон')) {
            specialWarning += '• Рекомендуется исключить кофеин после 14:00\n• Магний и мелатонин — после консультации с врачом\n';
        }
        if (additionalInfo.toLowerCase().includes('стресс') || additionalInfo.toLowerCase().includes('тревог')) {
            specialWarning += '• Ежедневная медитация 10-15 мин\n• Дыхательные практики перед сном\n';
        }
    }
    
    let advice = `
⚡ **ПЕРСОНАЛЬНЫЕ РЕКОМЕНДАЦИИ ПО ЭНЕРГИИ И ВОССТАНОВЛЕНИЮ**

**👤 ДЛЯ ВАС:** ${name}, ${age} лет, ${genderText}, вес ${weight} кг
**🎯 ЦЕЛЬ:** ${goal === 'похудеть' ? 'снижение веса' : (goal === 'набрать массу' ? 'набор мышечной массы' : 'общее оздоровление')}
**📊 ИМТ:** ${bmiData.bmi} (${bmiData.category})
${specialWarning}

---

**⏰ ОПТИМАЛЬНЫЙ РАСПОРЯДОК ДНЯ:**

• **Подъём:** ${wakeTime}
• **Солнечный свет:** +15 мин на улице или у окна
• **Пик продуктивности:** ${peakHours}
• **Обед:** 13:00-14:00
• **Прогулка:** 15:00-15:30
• **Ужин:** 18:00-19:00
• **Затихание:** 22:00 (без экранов)
• **Отход ко сну:** ${sleepTime}

---

**🧘 ТЕХНИКИ ВОССТАНОВЛЕНИЯ:**

**1. Дыхание (утро):** 30 глубоких вдохов + задержка 1 мин (по Виму Хофу)

**2. Медитация (утро или перед сном):** 10 мин, приложения: Calm, Headspace

**3. Холодный душ:** 30-60 сек для подъёма дофамина

**4. Прогулка:** 20-30 мин в обед

**5. Сон:** 7-9 часов${sleepQualityWarning}

---

**⚡ УПРАВЛЕНИЕ ЭНЕРГИЕЙ:**

• **Уровень стресса:** ${stressLevel}
• **Фокус восстановления:** ${recoveryFocus}
• **Пульс в покое:** целевой 60-80 уд/мин

**Запрещено перед сном (за 2 часа):**
• Кофеин, алкоголь, тяжёлая пища
• Яркий свет, экраны

---

⚠️ **ДИСКЛЕЙМЕР:** Рекомендации основаны на анализе методик мировых экспертов (Мэттью Уокер, Эндрю Хуберман, Вим Хоф, Питер Аттиа, Савелий Кашницкий). Для персонализированной программы обратитесь к специалисту. При наличии хронических заболеваний проконсультируйтесь с врачом.
    `;
    
    return advice;
}

// ==================== ЭНДПОИНТЫ ====================

app.post('/api/trainer', checkCache, async (req, res) => {
    const userData = req.body.userData;
    const bmiData = calculateBMIAndObesity(userData.weight, userData.height);
    const advice = getTrainerAdvice(userData, bmiData);
    res.json({ success: true, advice, type: 'trainer', bmiData });
});

app.post('/api/diet', checkCache, async (req, res) => {
    const userData = req.body.userData;
    const bmiData = calculateBMIAndObesity(userData.weight, userData.height);
    const advice = getDietAdvice(userData, bmiData);
    res.json({ success: true, advice, type: 'diet', bmiData });
});

app.post('/api/energy', checkCache, async (req, res) => {
    const userData = req.body.userData;
    const bmiData = calculateBMIAndObesity(userData.weight, userData.height);
    const advice = getEnergyAdvice(userData, bmiData);
    res.json({ success: true, advice, type: 'energy', bmiData });
});

app.post('/api/clean-cache', (req, res) => {
    const size = userCache.size;
    userCache.clear();
    res.json({ success: true, message: `Очищено ${size} записей кэша` });
});

app.get('/api/cache-stats', (req, res) => {
    res.json({ total: userCache.size });
});

app.get('/api/test-endpoint', (req, res) => {
    res.json({ status: 'ok', message: 'Endpoint works!', timestamp: new Date() });
});

app.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на http://localhost:${PORT}`);
    console.log(`📋 Динамические рекомендации на основе анализа данных (без AI)`);
});

module.exports = app;
