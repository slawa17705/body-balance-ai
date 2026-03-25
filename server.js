const express = require('express');
const cors = require('cors');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// ==================== ФАЙЛОВЫЙ КЭШ ====================
const CACHE_FILE = path.join(__dirname, 'cache.json');
const CACHE_TTL = 3 * 7 * 24 * 60 * 60 * 1000; // 3 недели
const WEIGHT_THRESHOLD = 2; // ±2 кг

let userCache = new Map();

// Загрузка кэша из файла
async function loadCache() {
    try {
        const data = await fs.readFile(CACHE_FILE, 'utf8');
        const cacheArray = JSON.parse(data);

        const now = Date.now();
        let loaded = 0;
        let expired = 0;

        for (const [key, value] of cacheArray) {
            const cacheAge = now - new Date(value.timestamp).getTime();

            if (cacheAge < CACHE_TTL) {
                userCache.set(key, value);
                loaded++;
            } else {
                expired++;
            }
        }

        console.log(`📂 Кэш: ${loaded} актуальных, ${expired} удалено (старше 3 недель)`);

    } catch (error) {
        console.log('📂 Создаем новый кэш');
        userCache = new Map();
    }
}

// Асинхронное сохранение кэша
let saveTimeout = null;
function saveCacheAsync() {
    if (saveTimeout) clearTimeout(saveTimeout);

    saveTimeout = setTimeout(async () => {
        try {
            const cacheArray = Array.from(userCache.entries());
            await fs.writeFile(CACHE_FILE, JSON.stringify(cacheArray, null, 2));
            console.log(`💾 Кэш сохранен: ${cacheArray.length} записей`);
        } catch (error) {
            console.error('❌ Ошибка сохранения кэша:', error);
        }
    }, 5000);
}

// Загружаем кэш при старте
loadCache();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

// Тестовый маршрут
app.get('/test', (req, res) => {
    res.json({ message: 'Сервер работает!', timestamp: new Date() });
});

app.get('/health', (req, res) => {
    res.send('OK');
});

// Инициализация телеграм бота
let bot = null;
console.log('🤖 Telegram бот отключен в server.js');

class GoogleSheetsManager {
    // ... существующий код GoogleSheetsManager ...
}

const sheetsManager = new GoogleSheetsManager();

// ==================== ФУНКЦИИ КЭША ====================

// Функция для получения ID пользователя
function getUserId(req) {
    const userData = req.body.userData || {};

    const userString = JSON.stringify({
        name: userData.name?.trim().toLowerCase(),
        gender: userData.gender,
        age: userData.age,
        weight: userData.weight,
        height: userData.height,
        goal: userData.goal,
        activity: userData.activity
    });

    const hash = require('crypto')
        .createHash('md5')
        .update(userString)
        .digest('hex')
        .slice(0, 12);

    return `user_${hash}`;
}

// Функция расчета ИМТ и степени ожирения
function calculateBMIAndObesity(weight, height) {
    if (!weight || !height || height === 0) {
        return {
            bmi: '0.0',
            category: 'Не определено',
            obesityDegree: 0,
            description: 'Данные неполные'
        };
    }

    const heightM = height / 100;
    const bmi = weight / (heightM * heightM);

    let category = '';
    let obesityDegree = 0;

    if (bmi < 16) {
        category = 'Выраженный дефицит массы';
    } else if (bmi < 18.5) {
        category = 'Недостаточная масса';
    } else if (bmi < 25) {
        category = 'Нормальная масса';
    } else if (bmi < 30) {
        category = 'Избыточная масса (предожирение)';
        obesityDegree = 0;
    } else if (bmi < 35) {
        category = 'Ожирение I степени';
        obesityDegree = 1;
    } else if (bmi < 40) {
        category = 'Ожирение II степени';
        obesityDegree = 2;
    } else {
        category = 'Ожирение III степени';
        obesityDegree = 3;
    }

    return {
        bmi: bmi.toFixed(1),
        category,
        obesityDegree,
        description: `ИМТ: ${bmi.toFixed(1)} (${category})`,
        bmiValue: bmi
    };
}

// Функция для сравнения веса и создания сообщений
function getWeightChangeMessage(currentWeight, previousWeight, userName) {
    if (!previousWeight || !currentWeight) return null;

    const weightDiff = previousWeight - currentWeight;
    const absDiff = Math.abs(weightDiff);

    if (absDiff <= 0.5) return null; // Незначительное изменение

    if (weightDiff > 0) {
        // Похудение
        return {
            type: 'success',
            emoji: '🎉',
            title: 'Отличный прогресс!',
            message: `${userName}, вы похудели на ${absDiff.toFixed(1)} кг! Продолжайте в том же духе!`,
            details: `Было: ${previousWeight} кг → Стало: ${currentWeight} кг`
        };
    } else {
        // Набор веса
        return {
            type: 'info',
            emoji: '📈',
            title: 'Изменение веса',
            message: `${userName}, ваш вес увеличился на ${absDiff.toFixed(1)} кг`,
            details: `Было: ${previousWeight} кг → Стало: ${currentWeight} кг`,
            suggestion: 'Проверьте соблюдение рекомендаций'
        };
    }
}

// Проверка совпадения всех полей пользователя
function isUserDataMatch(newData, cachedData) {
    if (!newData || !cachedData) return false;

    // Проверяем все основные поля
    const fields = ['name', 'gender', 'age', 'height', 'activity', 'goal'];

    for (const field of fields) {
        const newValue = String(newData[field] || '').trim().toLowerCase();
        const cachedValue = String(cachedData[field] || '').trim().toLowerCase();

        if (newValue !== cachedValue) {
            console.log(`❌ Не совпадает поле ${field}: "${newValue}" vs "${cachedValue}"`);
            return false;
        }
    }

    // Проверяем вес (±2 кг)
    const weightDiff = Math.abs(parseFloat(newData.weight) - parseFloat(cachedData.weight));
    return weightDiff <= WEIGHT_THRESHOLD;
}

// Функция проверки кэша
function checkCache(req, res, next) {
    try {
        const userId = getUserId(req);
        const userData = req.body.userData;
        const path = req.path;
        const cacheKey = `${userId}_${path}`;

        console.log('🔍 Проверка кэша для:', userData?.name, 'вес:', userData?.weight, 'пол:', userData?.gender);

        const cached = userCache.get(cacheKey);

        if (cached && userData) {
            const cacheAge = Date.now() - new Date(cached.timestamp).getTime();
            const isExpired = cacheAge >= CACHE_TTL;

            // Проверяем совпадение данных
            if (!isExpired && isUserDataMatch(userData, cached.userData)) {
                console.log(`✅ КЭШ ПОДОШЕЛ! Возраст: ${(cacheAge / (24 * 60 * 60 * 1000)).toFixed(1)} дней`);

                // Добавляем информацию об изменении веса
                const weightMessage = getWeightChangeMessage(
                    userData.weight,
                    cached.userData.weight,
                    userData.name || 'Пользователь'
                );

                const response = {
                    ...cached.response,
                    cached: true,
                    cacheAgeDays: (cacheAge / (24 * 60 * 60 * 1000)).toFixed(1)
                };

                if (weightMessage) {
                    response.weightChange = weightMessage;
                }

                return res.json(response);
            }

            console.log(`❌ Кэш не подошел:`, {
                expired: isExpired,
                dataMatch: isUserDataMatch(userData, cached.userData),
                ageDays: (cacheAge / (24 * 60 * 60 * 1000)).toFixed(1)
            });
        }

        console.log(`🔄 Генерируем новые рекомендации`);

        req._cacheKey = cacheKey;
        req._userData = userData;

        // Сохраняем предыдущий вес для сравнения
        if (cached) {
            req._previousWeight = cached.userData.weight;
        }

        const originalJson = res.json;
        res.json = function (data) {
            if (data.success && data.advice && req._userData) {
                // Добавляем сообщение об изменении веса если есть
                if (req._previousWeight && req._userData.weight) {
                    const weightMessage = getWeightChangeMessage(
                        req._userData.weight,
                        req._previousWeight,
                        req._userData.name || 'Пользователь'
                    );

                    if (weightMessage) {
                        data.weightChange = weightMessage;
                    }
                }

                userCache.set(req._cacheKey, {
                    response: data,
                    userData: req._userData,
                    timestamp: new Date().toISOString()
                });

                saveCacheAsync();

                data.cached = false;
                data.generatedAt = new Date().toISOString();
            }
            return originalJson.call(this, data);
        };

        next();

    } catch (error) {
        console.error('Ошибка checkCache:', error);
        next();
    }
}

// ====================
// API для AI интеграции
// ====================

// Получить API ключ для фронтенда
app.get('/api/get-ai-key', (req, res) => {
    const useProxy = process.env.USE_AI_PROXY === 'true';

    if (useProxy) {
        res.json({
            success: true,
            useProxy: true,
            message: 'Используется серверный прокси'
        });
    } else {
        res.json({
            success: true,
            message: 'Используется серверный прокси с Fireworks AI'
        });
    }
});

// Прокси для AI запросов
app.post('/api/query', async (req, res) => {
    try {
        const { model, messages, max_tokens, temperature } = req.body;

        const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
        if (!OPENROUTER_API_KEY) {
            return res.status(500).json({
                success: false,
                error: 'API ключ OpenRouter не настроен на сервере'
            });
        }

        const response = await axios.post(
            'https://openrouter.ai/api/v1/chat/completions',
            {
                model: model || 'deepseek/deepseek-r1',
                messages,
                max_tokens: max_tokens || 1000,
                temperature: temperature || 0.7
            },
            {
                headers: {
                    'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        res.json({
            success: true,
            choices: response.data.choices
        });

    } catch (error) {
        console.error('AI прокси ошибка:', error.response?.data || error.message);
        res.status(500).json({
            success: false,
            error: error.response?.data?.error?.message || error.message
        });
    }
});

// Специализированные AI эндпоинты
app.post('/api/analyze-workout', async (req, res) => {
    try {
        const { workoutData } = req.body;

        const prompt = `
        Как эксперт по фитнесу и нейробиологии, проанализируй эту тренировку:
        
        Название: ${workoutData.title}
        Тип: ${workoutData.type}
        Упражнения: ${workoutData.exercises}
        
        Дай анализ по пунктам:
        1. Целевые группы мышц
        2. Потенциал для роста силы/выносливости
        3. Влияние на энергетический обмен
        4. Рекомендации по технике безопасности
        5. Варианты модификации для разного уровня
        
        Отвечай на русском, научно, но доступно.
        `;

        const response = await axios.post(
            'https://openrouter.ai/api/v1/chat/completions',
            {
                model: 'deepseek/deepseek-r1',
                messages: [
                    {
                        role: 'system',
                        content: 'Ты эксперт по фитнесу и нейробиологии.'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                max_tokens: 1000,
                temperature: 0.7
            },
            {
                headers: {
                    'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        res.json({
            success: true,
            analysis: response.data.choices[0].message.content
        });

    } catch (error) {
        console.error('Ошибка анализа тренировки:', error);
        res.status(500).json({
            success: false,
            error: 'Не удалось проанализировать тренировку'
        });
    }
});

// Анализ питания
app.post('/api/analyze-nutrition', async (req, res) => {
    try {
        const { nutritionData } = req.body;

        const prompt = `
        Как профессиональный диетолог, проанализируй это питание:
        
        Фокус дня: ${nutritionData.focus}
        Приемы пищи: ${nutritionData.meals}
        
        Проанализируй:
        1. Баланс БЖУ (белки, жиры, углеводы)
        2. Адекватность калорийности
        3. Влияние на уровень сахара в крови
        4. Потенциал для устойчивой энергии
        5. Рекомендации по улучшению
        
        Учти, что это часть 7-недельного курса по управлению энергией.
        Отвечай на русском, профессионально, но практично.
        `;

        const response = await axios.post(
            'https://openrouter.ai/api/v1/chat/completions',
            {
                model: 'deepseek/deepseek-r1',
                messages: [
                    {
                        role: 'system',
                        content: 'Ты опытный диетолог-нутрициолог, специализирующийся на энергетическом обмене.'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                max_tokens: 1500,
                temperature: 0.7
            },
            {
                headers: {
                    'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        res.json({
            success: true,
            analysis: response.data.choices[0].message.content
        });

    } catch (error) {
        console.error('Ошибка анализа питания:', error);
        res.status(500).json({
            success: false,
            error: 'Не удалось проанализировать питание'
        });
    }
});
// Калибровка энерготипа
app.post('/api/calibrate-energy', async (req, res) => {
    try {
        const { answers } = req.body;

        const prompt = `
        На основе этих ответов определи энерготип и дай рекомендации:
        
        Ответы пользователя: ${answers.join(', ')}
        
        Определи:
        1. Вероятный хронотип (жаворонок, сова, медведь, лев, волк, дельфин)
        2. Пиковые периоды продуктивности
        3. Рекомендации по тренировкам
        4. Рекомендации по питанию
        5. Оптимальный распорядок дня
        
        Ответ в формате JSON со структурой:
        {
            "energyType": "string",
            "productivityPeaks": ["утро", "день", "вечер"],
            "workoutRecommendations": "string",
            "nutritionRecommendations": "string",
            "dailySchedule": "string",
            "keyInsights": ["insight1", "insight2"]
        }
        `;

        const response = await axios.post(
            'https://openrouter.ai/api/v1/chat/completions',
            {
                model: 'deepseek/deepseek-r1',
                messages: [
                    {
                        role: 'system',
                        content: 'Ты специалист по хронотипам, циркадным ритмам и управлению энергией.'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                max_tokens: 2000,
                temperature: 0.3
            },
            {
                headers: {
                    'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        const content = response.data.choices[0].message.content;

        // Парсим JSON из ответа
        try {
            const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/) ||
                content.match(/{[\s\S]*}/);

            if (jsonMatch) {
                const jsonStr = jsonMatch[1] || jsonMatch[0];
                const result = JSON.parse(jsonStr);

                res.json({
                    success: true,
                    calibration: result
                });
            } else {
                res.json({
                    success: true,
                    calibration: {
                        analysis: content
                    }
                });
            }
        } catch (parseError) {
            res.json({
                success: true,
                calibration: {
                    analysis: content
                }
            });
        }

    } catch (error) {
        console.error('Ошибка калибровки:', error);
        res.status(500).json({
            success: false,
            error: 'Не удалось выполнить калибровку'
        });
    }
});

        

// Генерация персонализированных советов
app.post('/api/daily-tips', async (req, res) => {
    try {
        const { dayNumber, workoutType, nutritionFocus, userPreferences } = req.body;

        const prompt = `
        Сгенерируй персонализированные советы для дня ${dayNumber} курса по управлению энергией.
        
        Контекст:
        - Тип тренировки: ${workoutType}
        - Фокус питания: ${nutritionFocus}
        - Предпочтения пользователя: ${JSON.stringify(userPreferences)}
        
        Дай 5 практических советов по:
        1. Подготовке к тренировке
        2. Технике выполнения
        3. Восстановлению после
        4. Питанию для энергии
        5. Ментальному настрою
        
        Будь конкретным, практичным и мотивирующим.
        Отвечай на русском.
        `;

        const response = await axios.post(
            'https://openrouter.ai/api/v1/chat/completions',
            {
                model: 'deepseek/deepseek-r1',
                messages: [
                    {
                        role: 'system',
                        content: 'Ты персональный коуч по эффективности и управлению энергией.'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                max_tokens: 1500,
                temperature: 0.8
            },
            {
                headers: {
                    'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        res.json({
            success: true,
            tips: response.data.choices[0].message.content
        });

    } catch (error) {
        console.error('Ошибка генерации советов:', error);
        res.status(500).json({
            success: false,
            error: 'Не удалось сгенерировать советы'
        });
    }
});
// ====================
// Существующие эндпоинты
// ====================

// Проверка пользователя Telegram
app.get('/api/check/:userId', async (req, res) => {
    const userId = req.params.userId;

    try {
        if (bot) {
            const user = await bot.getChat(userId);
            res.json({
                success: true,
                userId: userId,
                name: user.first_name || 'Пользователь',
                username: user.username
            });
        } else {
            // Если бот отключен, имитируем успешную проверку
            res.json({
                success: true,
                userId: userId,
                name: 'Демо Пользователь',
                username: 'demo_user'
            });
        }
    } catch (error) {
        console.error('Ошибка проверки пользователя:', error);
        res.json({
            success: false,
            error: 'Пользователь не найден'
        });
    }
});

// Создание Google Sheets для пользователя
app.post('/api/create-sheet', async (req, res) => {
    const { userId, userName } = req.body;

    try {
        await sheetsManager.initialize();
        const result = await sheetsManager.createUserSheet(userId, userName);

        if (result.success) {
            res.json(result);
        } else {
            res.status(500).json(result);
        }
    } catch (error) {
        console.error('Ошибка создания таблицы:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Проверка статуса активации
app.get('/api/activation/status/:userId', async (req, res) => {
    const userId = req.params.userId;

    res.json({
        success: true,
        userId: userId,
        status: 'active',
        currentStep: 3,
        hasSheet: true,
        hasTelegram: true,
        isActivated: true
    });
});

// Общая функция для запросов к AI
async function getAIResponse(prompt, specialist) {
    try {
        const systemPrompts = {
            trainer: `Ты - СИСТЕМА АНАЛИЗА МЕТОДИК ДЛЯ СНИЖЕНИЯ ВЕСА ТЕЛА.
      
      ТВОЯ ЕДИНСТВЕННАЯ ЗАДАЧА:
      1. Получить данные пользователя: пол, возраст, вес, рост, текущая активность, цель, дополнительные пожелания
      2. Проанализировать эти данные через методики 10+ мировых экспертов по фитнесу
      3. Найти общие точки в рекомендациях экспертов для ЭТОГО КОНКРЕТНОГО пользователя
      4. Представить результат как "консенсус экспертов"
      
      БАЗА ЭКСПЕРТОВ ДЛЯ АНАЛИЗА (10+):
      - Джо Вейдер (система принципов бодибилдинга)
      - Арнольд Шварценеггер (объемный тренинг)
      - Майк Ментцер (HIT - высокоинтенсивный тренинг)
      - Чарльз Поликвин (немецкий объемный тренинг)
      - Дориан Йейтс (Blood and Guts)
      - Том Венуто (Burn the Fat)
      - Ханни Рамбод (FST-7)
      - Артур Лидьярд (аэробные методики)
      - Стивен Сайлер (HIIT)
      - Грег Глассман (CrossFit)
      - Табата Идзуми (протокол Табата)
      - Михаил Прилепин (функциональный тренинг)
      
      ФОРМАТ ОТВЕТА (СТРОГО СОБЛЮДАТЬ):
      
      [КОНСЕНСУС ЭКСПЕРТОВ ДЛЯ: {пол} {возраст} лет, вес {вес}кг, цель: {цель}]
      
      АНАЛИЗ ДАННЫХ:
      • Пол: {gender} (учитывается во всех расчетах)
      • Возраст: {age} лет (определяет интенсивность и восстановление)
      • Текущий вес: {weight}кг
      • Цель: {goal}
      • Дополнительно: {additionalInfo}
      
      МЕТОДИЧЕСКИЙ АНАЛИЗ:
      [Как каждый эксперт анализирует эти данные]
      
      ОБЩИЕ ТОЧКИ ВСЕХ ЭКСПЕРТОВ:
      1. [Что все эксперты рекомендуют для ТАКИХ данных]
      2. [Еще одна общая рекомендация]
      3. [Третья общая точка]
      
      КОНСЕНСУС ЭКСПЕРТОВ:
      На основе анализа данных и методики экспертов пришли к консенсусу:
      
      ТИП ТРЕНИРОВОК: [какой тип]
      ЧАСТОТА: [сколько раз в неделю]
      ПРОДОЛЖИТЕЛЬНОСТЬ: [длительность тренировок]
      УПРАЖНЕНИЯ: [конкретные упражнения]
      ПОДХОДЫ/ПОВТОРЕНИЯ: [конкретные цифры]
      ПРОГРЕССИЯ: [как увеличивать нагрузку]
      
      АЛЬТЕРНАТИВНЫЙ ВАРИАНТ (если цель другая или пожелания пользователя):
      [Только если пользователь указал альтернативную цель]
      
      ДИСКЛЕЙМЕР:
      "Данные рекомендации представляют собой синтез методик мировых экспертов в области фитнеса. Для персонализированной программы обратитесь к сертифицированному специалисту. Перед началом тренировок проконсультируйтесь с врачом."
      
      ВАЖНО:
      • НЕ давать объяснений "почему так"
      • НЕ давать советов от себя
      • НЕ делать предположений
      • ТОЛЬКО анализ данных через призму методик экспертов
      • ТОЛЬКО консенсус на основе общих точек
      • ВСЕ рекомендации должны явно вытекать из данных пользователя
      ВАЖНО:
• НЕ перечисляй экспертов по имени
• НЕ пиши раздел "МЕТОДИЧЕСКИЙ АНАЛИЗ"
• Дай сразу рекомендации в виде списка`,

            diet: `Ты - СИСТЕМА АНАЛИЗА МЕТОДИК ПИТАНИЯ ДЛЯ ИЗМЕНЕНИЯ ВЕСА ТЕЛА И УЛЧШЕНИЯ ЗДОРОВЬЯ.

ТВОЯ ЕДИНСТВЕННАЯ ЗАДАЧА:
1. Получить данные пользователя: пол, возраст, вес, рост, текущая активность, цель (снижение/набор веса), дополнительные ограничения (аллергии, предпочтения)
2. Проанализировать эти данные через методики 10+ мировых экспертов по нутрициологии и диетологии
3. Найти общие точки в рекомендациях экспертов для ЭТОГО КОНКРЕТНОГО пользователя
4. Представить результат как "консенсус экспертов"

БАЗА ЭКСПЕРТОВ ДЛЯ АНАЛИЗА (10+):
- Доктор Уолтер Уиллетт (Гарвардский университет) - эпидемиология питания
- Доктор Роберт Ластиг (Калифорнийский университет) - метаболический синдром
- Доктор Т. Колин Кэмпбелл - "Китайское исследование"
- Доктор Майкл Грегер - NutritionFacts.org, доказательная медицина
- Лайл Макдональд - биохимия питания, Ultimate Diet 2.0
- Алан Арагон - гибкая диета, IIFYM
- Эрик Хелмс - Muscle and Strength Pyramids
- Крис Ацето - Championship Bodybuilding, нутриент-тайминг
- Михаил Гинзбург (РАМН) - российская диетология
- Маргарита Королева - диетология для спортсменов и публичных лиц
- Доктор Алексей Ковальков - этапное снижение веса
- Доктор Лидия Ионова - психология пищевого поведения

ФОРМАТ ОТВЕТА (СТРОГО СОБЛЮДАТЬ):

[КОНСЕНСУС ЭКСПЕРТОВ ДЛЯ: {gender} {age} лет, вес {weight}кг, цель: {goal}]

АНАЛИЗ ДАННЫХ:
• Пол: {gender} (определяет базовый метаболизм, потребности в нутриентах)
• Возраст: {age} лет (влияет на метаболизм, усвоение)
• Текущий вес: {weight}кг
• Рост: {height}см
• Цель: {goal}
• Активность: {activity}
• Ограничения: {additionalInfo}

МЕТОДИЧЕСКИЙ АНАЛИЗ:
[Как каждый эксперт анализирует эти данные]

ОБЩИЕ ТОЧКИ ВСЕХ ЭКСПЕРТОВ:
1. [Что все эксперты рекомендуют для ТАКИХ данных]
2. [Еще одна общая рекомендация]
3. [Третья общая точка]

КОНСЕНСУС ЭКСПЕРТОВ:
На основе анализа данных и методик, эксперты пришли к консенсусу:

РАСЧЕТ ПОТРЕБНОСТЕЙ:
• Калории: [число] ккал/день (расчет по формуле с учетом пола, возраста, активности)
• Белки: [число] г/день ([число]г/кг веса)
• Жиры: [число] г/день ([число]г/кг веса)
• Углеводы: [число] г/день

РЕКОМЕНДУЕМЫЕ ПРОДУКТЫ (ДОСТУПНЫЕ):
• Белки: [конкретные доступные продукты с указанием ккал/100г]
• Углеводы: [конкретные доступные продукты]
• Жиры: [конкретные доступные продукты]
• Овощи/фрукты: [сезонные и доступные]

РАСПРЕДЕЛЕНИЕ ПО ПРИЕМАМ ПИЩИ:
• Завтрак (время): [что, сколько грамм, сколько ккал]
• Обед (время): [что, сколько грамм, сколько ккал]
• Ужин (время): [что, сколько грамм, сколько ккал]
• Перекусы: [если нужны]

АЛЬТЕРНАТИВНЫЕ ПРОДУКТЫ (если указаны ограничения):
[Только если пользователь указал ограничения]

ВАЖНЫЕ ПРИНЦИПЫ:
• Все продукты должны быть доступны в обычных магазинах (Магнит, Пятерочка, Лента)
• Указывать точные калории на 100г для каждого продукта
• Давать бюджетные альтернативы дорогим продуктам
• Учитывать сезонность овощей и фруктов

ДИСКЛЕЙМЕР:
"Данные рекомендации представляют собой синтез методик мировых экспертов в области нутрициологии. Для персонализированной диеты обратитесь к сертифицированному диетологу. Перед изменением питания проконсультируйтесь с врачом."

ВАЖНО:
• НЕ рекомендовать экзотические или дорогие продукты (авокадо, киноа, лосось, миндаль)
• НЕ давать медицинских советов
• ТОЛЬКО анализ через призму методик экспертов
• ВСЕ расчеты должны учитывать пол, возраст и индивидуальные особенности
• Указывать КОНКРЕТНЫЕ продукты с КОНКРЕТНЫМИ цифрами
ВАЖНО:
• НЕ перечисляй экспертов по имени
• Дай сразу практические рекомендации`,
            energy: `Ты - СИСТЕМА АНАЛИЗА МЕТОДИК ВОССТАНОВЛЕНИЯ, СНА И УПРАВЛЕНИЯ ЭНЕРГИЕЙ.

ТВОЯ ЕДИНСТВЕННАЯ ЗАДАЧА:
1. Получить данные пользователя: пол, возраст, текущий распорядок дня, качество сна, уровень стресса, энергетические спады, дополнительные факторы
2. Проанализировать эти данные через методики 10+ мировых экспертов по восстановлению, сомнологии и управлению энергией
3. Найти общие точки в рекомендациях экспертов для ЭТОГО КОНКРЕТНОГО пользователя
4. Представить результат как "консенсус экспертов"

БАЗА ЭКСПЕРТОВ ДЛЯ АНАЛИЗА (10+):
- Доктор Мэттью Уокер (Калифорнийский университет) - нейробиология сна, автор "Зачем мы спим"
- Доктор Эндрю Хуберман (Стэнфорд) - нейробиология, управление дофамином и кортизолом
- Савелий Кашницкий - циркадная инженерия, синхронизация с природными ритмами
- Вим Хоф - дыхательные практики, контроль вегетативной нервной системы
- Келли Старретт - мобильность, восстановление после физических нагрузок
- Андрей Беловешкин - управление ресурсами, энергетические паттерны
- Доктор Роберт Сапольски - нейробиология стресса
- Доктор Михаил Полуэктов (Сомнологический центр) - гигиена сна
- Доктор Питер Аттиа - долголетие, протоколы восстановления
- Доктор Стюарт МакГилл - биомеханика, восстановление позвоночника
- Доктор Джо Диспенза - нейропластичность, медитативные практики
- Доктор Алексей Немов - восстановление в спорте высших достижений

ФОРМАТ ОТВЕТА (СТРОГО СОБЛЮДАТЬ):

[КОНСЕНСУС ЭКСПЕРТОВ ДЛЯ: {gender} {age} лет, уровень стресса: {activity}, качество сна: {additionalInfo}]

АНАЛИЗ ДАННЫХ:
• Пол: {gender} (влияет на циркадные ритмы, гормональные паттерны)
• Возраст: {age} лет (определяет потребность во сне, скорость восстановления)
• Текущий режим: {activity}
• Качество сна: {additionalInfo}
• Уровень стресса: {goal}
• Энергетические спады: {weight}
• Дополнительно: {additionalInfo}

МЕТОДИЧЕСКИЙ АНАЛИЗ:
[Как каждый эксперт анализирует эти данные]

ОБЩИЕ ТОЧКИ ВСЕХ ЭКСПЕРТОВ:
1. [Что все эксперты рекомендуют для ТАКИХ данные]
2. [Еще одна общая рекомендация]
3. [Третья общая точка]

КОНСЕНСУС ЭКСПЕРТОВ:
На основе анализа данных и методик, эксперты пришли к консенсусу:

ОПТИМАЛЬНЫЙ РАСПОРЯДОК ДНЯ:
• Подъем: [время] - [обоснованное время с учетом хронотипа]
• Завтрак: [время] - [рекомендации по первому приему пищи]
• Пик продуктивности: [время] - [на что направить энергию]
• Обед: [время] - [рекомендации]
• Послеобеденный спад: [как минимизировать]
• Тренировка (если есть): [оптимальное время]
• Ужин: [время] - [рекомендации для качественного сна]
• Отход ко сну: [время] - [ритуалы для засыпания]

ТЕХНИКИ ВОССТАНОВЛЕНИЯ:
1. Дыхательные практики: [конкретные методики, время выполнения]
2. Медитация/релаксация: [тип, длительность, частота]
3. Работа со сном: [рекомендации по гигиене сна]
4. Физическое восстановление: [растяжка, массаж, техники]

УПРАВЛЕНИЕ ЭНЕРГИЕЙ В ТЕЧЕНИЕ ДНЯ:
• Утро: [как запустить энергию]
• День: [как поддерживать]
• Вечер: [как корректно снижать активность]

ХРОНОТИП И ПИКИ ПРОДУКТИВНОСТИ:
• Определенный хронотип: [жаворонок/сова/голубь]
• Пиковые часы: [время максимальной эффективности]
• Часы для отдыха: [время для восстановления]

ПРАКТИЧЕСКИЕ РИТУАЛЫ НА КАЖДЫЙ ДЕНЬ:
• Утренние: [3-5 конкретных действий]
• Дневные: [3-5 конкретных действий]
• Вечерние: [3-5 конкретных действий]

АЛЬТЕРНАТИВНЫЕ СЦЕНАРИИ (при изменении условий):
[Только если пользователь указал особые условия]

ДИСКЛЕЙМЕР:
"Данные рекомендации представляют собой синтез методик мировых экспертов в области восстановления и управления энергией. Для персонализированной программы обратитесь к сертифицированному специалисту. При наличии хронических заболеваний проконсультируйтесь с врачом."

ВАЖНО:
• Все рекомендации должны учитывать ПОЛОВЫЕ особенности (мужские/женские циркадные ритмы)
• Учитывать ВОЗРАСТНЫЕ особенности (потребность во сне меняется с возрастом)
• Давать КОНКРЕТНЫЕ время и действия
• Предлагать РЕАЛИСТИЧНЫЕ практики (5-15 минут, не требующие специального оборудования)
• Учитывать РЕАЛЬНЫЕ условия жизни (работа, семья, доступное время)
• НЕ рекомендовать экстремальные практики (ледяные ванны, длительное голодание без контроля)
• ТОЛЬКО научно обоснованные методики
ВАЖНО:
• НЕ перечисляй экспертов по имени
• Дай сразу практические рекомендации`
        };

const response = await axios.post(
    'https://openrouter.ai/api/v1/chat/completions',
    {
        model: 'deepseek/deepseek-r1',
        messages: [
            {
                role: 'system',
                content: systemPrompts[specialist] || 'Ты профессиональный эксперт.'
            },
            {
                role: 'user',
                content: prompt
            }
        ],
        max_tokens: 1500,
        temperature: 0.7
    },
    {
        headers: {
            'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json'
        }
    }
);

        return response.data.choices[0].message.content;
    } catch (error) {
        console.error('AI ошибка:', error);
       return `Ошибка AI: ${error.message}. Детали: ${JSON.stringify(error.response?.data || 'Нет данных')}`;
    }
}

// 1. Тренер (ОБНОВЛЕНО С ГЕНДЕРОМ И ИМТ)
app.post('/api/trainer', checkCache, async (req, res) => {
    const userData = req.body.userData;
    const bmiData = calculateBMIAndObesity(userData.weight, userData.height);

    const genderText = userData.gender === 'male' ? 'мужчина' : 'женщина';
    const genderSpecific = userData.gender === 'female' ?
        'УЧТИ ЖЕНСКИЕ ОСОБЕННОСТИ:\n• Циклические изменения энергии\n• Более гибкие связки\n• Особенности жироотложения' :
        'УЧТИ МУЖСКИЕ ОСОБЕННОСТИ:\n• Более высокий потенциал роста мышц\n• Особенности тестостерона\n• Скорость метаболизма';

    const prompt = `
Создай программу тренировок для:
- Имя: ${userData.name}
- Пол: ${genderText} (${userData.gender})
- Возраст: ${userData.age} лет  
- Вес: ${userData.weight}кг, Рост: ${userData.height}см
- ИМТ: ${bmiData.bmi} (${bmiData.category})
- Активность: ${userData.activity}
- Цель: ${userData.goal}
- Опыт: ${userData.additionalInfo || 'начинающий'}

${genderSpecific}

${bmiData.obesityDegree > 0 ?
            `ОСОБЫЕ УСЛОВИЯ: Ожирение ${bmiData.obesityDegree} степени требует:
1. Постепенное увеличение нагрузки
2. Упражнения с низкой ударной нагрузкой
3. Особое внимание суставам` : ''}

Формат ответа:
🎯 ОСНОВНЫЕ РЕКОМЕНДАЦИИ: [2-3 принципа с учетом пола и ИМТ]
🏋️ ПРОГРАММА ТРЕНИРОВОК: [расписание, упражнения - безопасные при текущем весе]
⚠️ МЕРЫ ПРЕДОСТОРОЖНОСТИ: [что учитывать при ${bmiData.category} и ${genderText}]
💡 СОВЕТЫ НА ПЕРВЫЕ НЕДЕЛИ: [3 совета с учетом пола]`;

    const advice = await getAIResponse(prompt, 'trainer');
    res.json({
        success: true,
        advice: advice,
        type: 'trainer',
        bmiData: bmiData
    });
});

// 2. Диетолог (ОБНОВЛЕНО С ГЕНДЕРОМ И ИМТ)
app.post('/api/diet', checkCache, async (req, res) => {
    const userData = req.body.userData;
    const bmiData = calculateBMIAndObesity(userData.weight, userData.height);

    const genderText = userData.gender === 'male' ? 'мужчина' : 'женщина';
    const genderSpecific = userData.gender === 'female' ?
        'ОСОБЕННОСТИ ДЛЯ ЖЕНЩИН:\n• Повышенная потребность в железе\n• Влияние менструального цикла на аппетит\n• Особенности распределения жира' :
        'ОСОБЕННОСТИ ДЛЯ МУЖЧИН:\n• Повышенная потребность в белке\n• Более высокий базовый метаболизм\n• Особенности набора мышечной массы';

    const prompt = `
Дай рекомендации по питанию для:
- Имя: ${userData.name}
- Пол: ${genderText} (${userData.gender})
- Возраст: ${userData.age} лет
- Вес: ${userData.weight}кг, Рост: ${userData.height}см
- ИМТ: ${bmiData.bmi} (${bmiData.category})
- Активность: ${userData.activity}
- Цель: ${userData.goal}
- Дополнительно: ${userData.additionalInfo || 'нет'}

${genderSpecific}

ФОКУС: Питание должно соответствовать ${bmiData.category}.
${bmiData.obesityDegree > 0 ?
            `КЛЮЧЕВЫЕ ТРЕБОВАНИЯ при ожирении ${bmiData.obesityDegree} степени:
• Дефицит калорий: безопасный и устойчивый
• Достаточное количество белка для сохранения мышц
• Контроль углеводов, особенно простых
• Регулярность приемов пищи` : ''}

Учитывая что пользователь ${genderText}, дай конкретные рекомендации по:
1. Суточной калорийности
2. Балансу БЖУ (белки, жиры, углеводы)
3. Примерному меню на день
4. Временным интервалам приемов пищи
5. Особенным продуктам для ${genderText}`;

    const advice = await getAIResponse(prompt, 'diet');
    res.json({
        success: true,
        advice: advice,
        type: 'diet',
        bmiData: bmiData
    });
});

// 3. Энергия (ОБНОВЛЕНО С ГЕНДЕРОМ И ИМТ)
app.post('/api/energy', checkCache, async (req, res) => {
    const userData = req.body.userData;
    const bmiData = calculateBMIAndObesity(userData.weight, userData.height);

    const genderText = userData.gender === 'male' ? 'мужчина' : 'женщина';
    const genderSpecific = userData.gender === 'female' ?
        'ОСОБЕННОСТИ ЭНЕРГИИ У ЖЕНЩИН:\n• Циклические изменения энергии в течение месяца\n• Влияние гормонального фона на сон и восстановление\n• Особенности реакции на стресс' :
        'ОСОБЕННОСТИ ЭНЕРГИИ У МУЖЧИН:\n• Более стабильный уровень энергии\n• Особенности тестостерона и его влияние на энергию\n• Особенности восстановления';

    const prompt = `
Дай рекомендации по управлению энергией для:
- Имя: ${userData.name}
- Пол: ${genderText} (${userData.gender})
- Возраст: ${userData.age} лет
- Вес: ${userData.weight}кг, Рост: ${userData.height}см
- ИМТ: ${bmiData.bmi} (${bmiData.category})
- Активность: ${userData.activity}
- Цель: ${userData.goal}
- Дополнительно: ${userData.additionalInfo || 'нет'}

${genderSpecific}

УЧТИ ВЛИЯНИЕ ВЕСА: ${bmiData.category} влияет на:
• Качество сна и возможное апноэ
• Уровень энергии в течение дня
• Восстановление после нагрузок
${bmiData.obesityDegree > 0 ?
            `ОСОБЕННОСТИ при ожирении ${bmiData.obesityDegree} степени:
• Возможна дневная сонливость
• Рекомендуются короткие перерывы на движение
• Важен контроль стресса` : ''}

Дай рекомендации по:
1. Оптимальному распорядку дня для ${genderText}
2. Техникам восстановления с учетом веса
3. Управлению энергией в течение дня
4. Качеству сна при ${bmiData.category}
5. Специфичным для ${genderText} практикам`;

    const advice = await getAIResponse(prompt, 'energy');
    res.json({
        success: true,
        advice: advice,
        type: 'energy',
        bmiData: bmiData
    });
});

// ==================== НОВЫЕ ЭНДПОИНТЫ ДЛЯ ИСТОРИИ ВЕСА ====================

// История изменений веса пользователя
app.post('/api/weight-history', async (req, res) => {
    try {
        const userData = req.body.userData;
        const userId = getUserId(req);

        const history = [];
        const now = Date.now();

        // Собираем все записи этого пользователя
        for (const [key, value] of userCache.entries()) {
            if (key.startsWith(`${userId}_`)) {
                const cacheAge = now - new Date(value.timestamp).getTime();
                const daysAgo = Math.floor(cacheAge / (24 * 60 * 60 * 1000));

                if (daysAgo <= 21) { // Только за последние 3 недели
                    history.push({
                        date: value.timestamp,
                        daysAgo: daysAgo,
                        weight: value.userData.weight,
                        specialist: key.split('_').pop(),
                        cached: cacheAge < CACHE_TTL
                    });
                }
            }
        }

        // Сортируем по дате (новые сначала)
        history.sort((a, b) => new Date(b.date) - new Date(a.date));

        // Находим первый и последний вес
        let firstWeight = null;
        let lastWeight = null;
        let totalChange = 0;
        let periodDays = 0;

        if (history.length > 0) {
            firstWeight = history[history.length - 1].weight;
            lastWeight = history[0].weight;
            totalChange = lastWeight - firstWeight;

            const firstDate = new Date(history[history.length - 1].date);
            const lastDate = new Date(history[0].date);
            periodDays = Math.floor((lastDate - firstDate) / (24 * 60 * 60 * 1000));
        }

        res.json({
            success: true,
            userId: userId,
            history: history,
            summary: {
                totalRecords: history.length,
                firstWeight,
                lastWeight,
                totalChange: totalChange.toFixed(1),
                periodDays: periodDays
            }
        });

    } catch (error) {
        console.error('Ошибка получения истории веса:', error);
        res.status(500).json({
            success: false,
            error: 'Не удалось получить историю веса'
        });
    }
});

// Статистика кэша
app.get('/api/cache-stats', (req, res) => {
    const now = Date.now();
    const stats = {
        total: userCache.size,
        byAge: { '0-7 дней': 0, '1-2 недели': 0, '2-3 недели': 0, '>3 недель': 0 },
        bySpecialist: { trainer: 0, diet: 0, energy: 0 },
        byGender: { male: 0, female: 0 },
        cacheRules: {
            maxWeeks: 3,
            weightThreshold: WEIGHT_THRESHOLD,
            checkAllFields: true
        }
    };

    for (const [key, value] of userCache.entries()) {
        const age = now - new Date(value.timestamp).getTime();
        const days = age / (24 * 60 * 60 * 1000);

        // Возрастные группы
        if (days <= 7) stats.byAge['0-7 дней']++;
        else if (days <= 14) stats.byAge['1-2 недели']++;
        else if (days <= 21) stats.byAge['2-3 недели']++;
        else stats.byAge['>3 недель']++;

        // Специалисты
        const specialist = key.split('_').pop();
        if (stats.bySpecialist[specialist] !== undefined) {
            stats.bySpecialist[specialist]++;
        }

        // Пол
        const gender = value.userData?.gender || 'unknown';
        if (gender === 'male' || gender === 'female') {
            stats.byGender[gender]++;
        }
    }

    res.json(stats);
});

// Очистка кэша
app.post('/api/clean-cache', (req, res) => {
    const now = Date.now();
    let removed = 0;

    for (const [key, value] of userCache.entries()) {
        const cacheAge = now - new Date(value.timestamp).getTime();
        if (cacheAge >= CACHE_TTL) {
            userCache.delete(key);
            removed++;
        }
    }

    saveCacheAsync();

    res.json({
        success: true,
        message: `Очищено ${removed} записей старше 3 недель`,
        removed: removed,
        remaining: userCache.size
    });
});

// Запуск сервера
app.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на http://localhost:${PORT}`);
    console.log(`🤖 AI интеграция: Fireworks активна`);
    console.log(`📂 Файловый кэш: порог ±${WEIGHT_THRESHOLD} кг, срок ${CACHE_TTL / (7 * 24 * 60 * 60 * 1000)} недель`);
});


module.exports = app;



