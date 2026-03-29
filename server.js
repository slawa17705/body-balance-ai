const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
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

// ==================== SUPABASE КЭШ ====================

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

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

async function checkCache(req, res, next) {
    try {
        const userId = getUserId(req);
        const path = req.path;
        const cacheKey = `${userId}_${path}`;
        
        // Ищем в Supabase
        const { data, error } = await supabase
            .from('user_cache')
            .select('*')
            .eq('user_key', cacheKey)
            .single();
        
        if (data && !error) {
            const currentUserData = req.body.userData;
            const cachedUserData = data.user_data;
            
            if (JSON.stringify(currentUserData) === JSON.stringify(cachedUserData)) {
                console.log(`📦 Кэш для ${path} (из Supabase)`);
                return res.json(data[`${path.replace('/api/', '')}_response`]);
            }
        }
        
        req._cacheKey = cacheKey;
        req._userData = req.body.userData;
        
        const originalJson = res.json;
        res.json = async function(data) {
            if (data.success && data.advice) {
                const specialist = req.path.replace('/api/', '');
                const updateData = {
                    user_key: req._cacheKey,
                    user_data: req._userData,
                    [`${specialist}_response`]: data
                };
                
                await supabase
                    .from('user_cache')
                    .upsert(updateData, { onConflict: 'user_key' });
                
                data.cached = false;
            }
            return originalJson.call(this, data);
        };
        
        next();
    } catch (error) {
        console.error('Ошибка кэша:', error);
        next();
    }
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

// ==================== ФУНКЦИИ РЕКОМЕНДАЦИЙ ====================

function getTrainerAdvice(userData, bmiData) {
    const { name, age, weight, height, goal, activity, additionalInfo } = userData;
    const genderText = userData.gender === 'male' ? 'мужчина' : 'женщина';
    
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
    }
    
    if (age > 55) {
        intensity = 'низкая';
        contraindications.push('резкие движения', 'упражнения с большими весами');
        cardioType = cardioType + ', плавание';
    }
    
    let weeklyCardio = 0, weeklyStrength = 0;
    if (goal === 'похудеть') {
        weeklyCardio = 3; weeklyStrength = 2;
        cardioType = cardioType + ' + HIIT 1-2 раза в неделю';
    } else if (goal === 'набрать массу') {
        weeklyCardio = 1; weeklyStrength = 4;
        strengthApproach = '3-4 подхода по 6-10 повторений с весом 70-80% от максимума';
    } else {
        weeklyCardio = 2; weeklyStrength = 2;
    }
    
    let workoutDuration = activity === 'низкая' ? 30 : (activity === 'высокая' ? 60 : 45);
    if (activity === 'низкая') {
        weeklyCardio = Math.max(2, weeklyCardio);
        weeklyStrength = Math.max(1, weeklyStrength);
    }
    
    let specialWarning = '';
    if (additionalInfo && additionalInfo !== 'не указано') {
        specialWarning = `\n⚠️ **С УЧЁТОМ ВАШИХ ОСОБЕННОСТЕЙ:** ${additionalInfo}\n`;
        if (additionalInfo.toLowerCase().includes('колен') || additionalInfo.toLowerCase().includes('сустав')) {
            contraindications.push('приседания со штангой', 'выпады с весом', 'прыжки');
            cardioType = 'плавание, велосипед, эллипс';
        }
        if (additionalInfo.toLowerCase().includes('спин') || additionalInfo.toLowerCase().includes('позвоночник')) {
            contraindications.push('становая тяга', 'скручивания с весом');
        }
        if (additionalInfo.toLowerCase().includes('сердц') || additionalInfo.toLowerCase().includes('давление')) {
            intensity = 'низкая';
            contraindications.push('интенсивные интервалы', 'задержка дыхания');
        }
    }
    
    let advice = `
🏋️ **ПЕРСОНАЛЬНЫЕ РЕКОМЕНДАЦИИ ПО ТРЕНИРОВКАМ**

**👤 ДЛЯ ВАС:** ${name}, ${age} лет, ${genderText}, вес ${weight} кг, рост ${height} см
**🎯 ЦЕЛЬ:** ${goal === 'похудеть' ? 'снижение веса' : (goal === 'набрать массу' ? 'набор мышечной массы' : 'общее оздоровление')}
**📊 ИМТ:** ${bmiData.bmi} (${bmiData.category})
${specialWarning}

---

**🎯 ОСНОВНЫЕ РЕКОМЕНДАЦИИ:**

• **Интенсивность:** ${intensity}
• **Частота:** ${weeklyStrength + weeklyCardio} раз в неделю (${weeklyStrength} силовых, ${weeklyCardio} кардио)
• **Длительность:** ${workoutDuration} минут

---

**🏋️ СИЛОВЫЕ ТРЕНИРОВКИ (${weeklyStrength} раза в неделю):**

${strengthApproach}

**Базовые упражнения:**
• Приседания с собственным весом
• Отжимания от пола/скамьи
• Тяга верхнего блока или гантели
• Жим гантелей лёжа
• Планка 3×30-60 сек

---

**🚴 КАРДИО-НАГРУЗКИ (${weeklyCardio} раза в неделю):**

**Тип:** ${cardioType}
**Пульс:** ${Math.round(120 - age/4)}-${Math.round(160 - age/4)} уд/мин

---

**⚠️ ПРОТИВОПОКАЗАНИЯ:**
${contraindications.length > 0 ? '• Избегайте: ' + contraindications.join(', ') : '• Соблюдайте стандартную технику безопасности'}
• Обязательная разминка 10-15 минут
• При болях — прекратить занятие

⚠️ **ДИСКЛЕЙМЕР:** Рекомендации основаны на анализе методик мировых экспертов (Джо Вейдер, Майк Ментцер, Арнольд Шварценеггер, Табата Идзуми, Грег Глассман). Перед началом тренировок проконсультируйтесь с врачом.
    `;
    return advice;
}

function getDietAdvice(userData, bmiData) {
    const { name, age, weight, height, goal, activity, additionalInfo } = userData;
    const genderText = userData.gender === 'male' ? 'мужчина' : 'женщина';
    
    const bmr = genderText === 'мужчина' 
        ? 10 * weight + 6.25 * height - 5 * age + 5
        : 10 * weight + 6.25 * height - 5 * age - 161;
    
    let activityFactor = activity === 'низкая' ? 1.2 : (activity === 'высокая' ? 1.55 : 1.375);
    let tdee = Math.round(bmr * activityFactor);
    let calorieTarget = goal === 'похудеть' ? Math.round(tdee * 0.8) : (goal === 'набрать массу' ? Math.round(tdee * 1.1) : tdee);
    
    if (bmiData.obesityDegree >= 3) calorieTarget = Math.round(calorieTarget * 0.85);
    else if (bmiData.obesityDegree === 2) calorieTarget = Math.round(calorieTarget * 0.9);
    
    const protein = Math.round(weight * (goal === 'набрать массу' ? 2 : 1.8));
    const fat = Math.round(weight * 0.9);
    const carbs = Math.round((calorieTarget - protein*4 - fat*9) / 4);
    
    let specialWarning = '';
    let restrictions = '';
    if (additionalInfo && additionalInfo !== 'не указано') {
        specialWarning = `\n⚠️ **С УЧЁТОМ ВАШИХ ОСОБЕННОСТЕЙ:** ${additionalInfo}\n`;
        if (additionalInfo.toLowerCase().includes('сахар') || additionalInfo.toLowerCase().includes('диабет')) {
            restrictions = '• Исключить быстрые углеводы (сахар, сладости, белый хлеб)\n• Контролировать гликемический индекс';
        }
        if (additionalInfo.toLowerCase().includes('давление')) {
            restrictions = '• Ограничить соль (до 3-5 г/день)\n• Исключить копчёности, консервы';
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

**ПРАВИЛО ГОЛОДА:** Ешьте только когда действительно проголодались.

---

**📊 РАСЧЁТ ПОТРЕБНОСТЕЙ:**

• **Калорийность:** ${calorieTarget} ккал
• **Белки:** ${protein} г
• **Жиры:** ${fat} г
• **Углеводы:** ${carbs} г
• **Вода:** ${Math.round(weight*30)} мл

---

**🍽️ РЕКОМЕНДУЕМЫЕ ПРОДУКТЫ:**

**Белки:** куриная грудка, рыба, творог 5%, яйца
**Углеводы:** гречка, овсянка, бурый рис
**Жиры:** оливковое масло, орехи (20 г/день)
**Овощи:** любые сезонные

---

**📋 ПРИМЕРНОЕ МЕНЮ (${calorieTarget} ккал):**

**Завтрак:** овсянка + 2 яйца (400 ккал)
**Обед:** курица 150г + гречка 100г + салат (500 ккал)
**Полдник:** творог 150г + яблоко (200 ккал)
**Ужин:** рыба 150г + тушёные овощи (400 ккал)

${restrictions ? `\n**⚠️ ОСОБЫЕ ОГРАНИЧЕНИЯ:**\n${restrictions}` : ''}

⚠️ **ДИСКЛЕЙМЕР:** Рекомендации основаны на анализе методик мировых экспертов (Лайл Макдональд, Алан Арагон, Майкл Грегер, Уолтер Уиллетт, Маргарита Королева). Перед изменением питания проконсультируйтесь с врачом.
    `;
    return advice;
}

function getEnergyAdvice(userData, bmiData) {
    const { name, age, weight, goal, additionalInfo } = userData;
    const genderText = userData.gender === 'male' ? 'мужчина' : 'женщина';
    
    let wakeTime = '7:00', sleepTime = '23:00', peakHours = '10:00-13:00';
    if (age < 30) { wakeTime = '8:30'; sleepTime = '0:30'; peakHours = '14:00-18:00'; }
    else if (age > 55) { wakeTime = '6:00'; sleepTime = '22:00'; peakHours = '8:00-11:00'; }
    
    let specialWarning = '';
    if (additionalInfo && additionalInfo !== 'не указано') {
        specialWarning = `\n⚠️ **С УЧЁТОМ ВАШИХ ОСОБЕННОСТЕЙ:** ${additionalInfo}\n`;
        if (additionalInfo.toLowerCase().includes('бессонниц')) {
            specialWarning += '• Исключить кофеин после 14:00\n• Магний перед сном (после консультации с врачом)\n';
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
• **Солнце:** +15 мин на улице
• **Пик продуктивности:** ${peakHours}
• **Обед:** 13:00-14:00
• **Прогулка:** 15:00
• **Ужин:** 18:00-19:00
• **Отход ко сну:** ${sleepTime} (без экранов за 1-2 часа)

---

**🧘 ТЕХНИКИ ВОССТАНОВЛЕНИЯ:**

1. **Дыхание (утро):** 30 вдохов + задержка 1 мин
2. **Медитация:** 10 мин
3. **Холодный душ:** 30-60 сек
4. **Прогулка:** 20-30 мин

⚠️ **ДИСКЛЕЙМЕР:** Рекомендации основаны на анализе методик мировых экспертов (Мэттью Уокер, Эндрю Хуберман, Вим Хоф, Питер Аттиа, Савелий Кашницкий). При наличии хронических заболеваний проконсультируйтесь с врачом.
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

app.post('/api/clean-cache', async (req, res) => {
    const { error } = await supabase.from('user_cache').delete().neq('user_key', '');
    if (error) {
        res.json({ success: false, error: error.message });
    } else {
        res.json({ success: true, message: 'Кэш очищен' });
    }
});

app.get('/api/cache-stats', async (req, res) => {
    const { count, error } = await supabase.from('user_cache').select('*', { count: 'exact', head: true });
    res.json({ total: count || 0 });
});

app.get('/api/test-endpoint', (req, res) => {
    res.json({ status: 'ok', message: 'Endpoint works!', timestamp: new Date() });
});

app.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на http://localhost:${PORT}`);
    console.log(`📋 Динамические рекомендации + Supabase кэш (вечный)`);
});

module.exports = app;

