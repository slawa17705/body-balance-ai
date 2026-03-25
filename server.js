const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

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

// ====================
// API для AI интеграции
// ====================

app.get('/api/get-ai-key', (req, res) => {
    res.json({
        success: true,
        message: 'Используется Fireworks AI'
    });
});

// Прокси для AI запросов
app.post('/api/query', async (req, res) => {
    try {
        const { model, messages, max_tokens, temperature } = req.body;

        const FIREWORKS_API_KEY = process.env.FIREWORKS_API_KEY;
        if (!FIREWORKS_API_KEY) {
            return res.status(500).json({
                success: false,
                error: 'API ключ Fireworks не настроен на сервере'
            });
        }

        const response = await axios.post(
            'https://api.fireworks.ai/v1/chat/completions',
            {
                model: model || 'accounts/fireworks/models/llama-v3p1-8b-instruct',
                messages,
                max_tokens: max_tokens || 1000,
                temperature: temperature || 0.7
            },
            {
                headers: {
                    'Authorization': `Bearer ${FIREWORKS_API_KEY}`,
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
            'https://api.fireworks.ai/v1/chat/completions',
            {
                model: 'accounts/fireworks/models/qwen3-8b-instruct',
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
                    'Authorization': `Bearer ${process.env.FIREWORKS_API_KEY}`,
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
            'https://api.fireworks.ai/v1/chat/completions',
            {
                model: 'accounts/fireworks/models/qwen3-8b-instruct',
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
                    'Authorization': `Bearer ${process.env.FIREWORKS_API_KEY}`,
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
            'https://api.fireworks.ai/v1/chat/completions',
            {
                model: 'accounts/fireworks/models/qwen3-8b-instruct',
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
                    'Authorization': `Bearer ${process.env.FIREWORKS_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        const content = response.data.choices[0].message.content;

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
            'https://api.fireworks.ai/v1/chat/completions',
            {
                model: 'accounts/fireworks/models/qwen3-8b-instruct',
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
                    'Authorization': `Bearer ${process.env.FIREWORKS_API_KEY}`,
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

const userCache = new Map();

// Функция для получения ID пользователя
function getUserId(req) {
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || '';
    const userData = req.body.userData || {};

    const userHash = require('crypto').createHash('md5')
        .update(JSON.stringify({
            name: userData.name,
            age: userData.age,
            weight: userData.weight,
            height: userData.height,
            goal: userData.goal,
            activity: userData.activity
        }))
        .digest('hex')
        .slice(0, 12);

    return `${ip}_${userAgent}_${userHash}`.slice(0, 150);
}

// Функция проверки кэша
function checkCache(req, res, next) {
    try {
        const userId = getUserId(req);
        const userData = req.body.userData;
        const currentWeight = userData?.weight;

        const path = req.path;
        const cacheKey = `${userId}_${path}`;

        const cached = userCache.get(cacheKey);

        if (cached && currentWeight !== undefined) {
            const now = new Date();
            const lastDate = new Date(cached.timestamp);
            const weeksPassed = (now - lastDate) / (1000 * 60 * 60 * 24 * 7);
            const weightDiff = Math.abs(currentWeight - cached.weight);

            if (weeksPassed < 3) {
                console.log(`📦 Используем кэш для ${path} (${weeksPassed.toFixed(1)} недель)`);
                return res.json({
                    ...cached.response,
                    cached: true,
                    weeksSinceCache: weeksPassed.toFixed(1)
                });
            }

            if (weightDiff < 2) {
                console.log(`📦 Используем кэш для ${path} (разница веса: ${weightDiff}кг)`);
                return res.json({
                    ...cached.response,
                    cached: true,
                    weightDifference: weightDiff
                });
            }
        }

        console.log(`🔄 Новый запрос к AI для ${path}`);

        req._cacheKey = cacheKey;
        req._userWeight = currentWeight;
        req._userData = userData;

        const originalJson = res.json;
        res.json = function (data) {
            if (data.success && data.advice && req._userWeight !== undefined) {
                userCache.set(req._cacheKey, {
                    response: data,
                    weight: req._userWeight,
                    timestamp: new Date().toISOString()
                });
                console.log(`💾 Сохранен кэш для ${path}`);

                data.cached = false;
                data.generatedAt = new Date().toISOString();
            }
            return originalJson.call(this, data);
        };

        next();

    } catch (error) {
        console.error('Ошибка в кэше:', error);
        next();
    }
}

// Статистика кэша
app.get('/api/cache-stats', (req, res) => {
    const stats = {
        totalCached: userCache.size,
        users: new Set(),
        bySpecialist: {
            trainer: 0,
            diet: 0,
            energy: 0
        }
    };

    for (const [key, value] of userCache.entries()) {
        const specialist = key.split('_').pop();
        if (stats.bySpecialist[specialist] !== undefined) {
            stats.bySpecialist[specialist]++;
        }
        stats.users.add(key.split('_')[0]);
    }

    stats.uniqueUsers = stats.users.size;

    res.json(stats);
});

// Функция расчета ИМТ
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

// Общая функция для запросов к AI
async function getAIResponse(prompt, specialist) {
    try {
        const systemPrompts = {
            trainer: `Ты - эксперт по фитнесу. Дай рекомендации по тренировкам. Отвечай на русском, структурированно.`,
            diet: `Ты - эксперт по питанию. Дай рекомендации по рациону. Отвечай на русском, структурированно.`,
            energy: `Ты - эксперт по восстановлению и энергии. Дай рекомендации. Отвечай на русском, структурированно.`
        };

        const response = await axios.post(
            'https://api.fireworks.ai/v1/chat/completions',
            {
                model: 'accounts/fireworks/models/qwen3-8b-instruct',
                messages: [
                    {
                        role: 'system',
                        content: systemPrompts[specialist] || 'Ты профессиональный эксперт. Отвечай на русском.'
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
                    'Authorization': `Bearer ${process.env.FIREWORKS_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        return response.data.choices[0].message.content;
    } catch (error) {
        console.error('AI ошибка:', error);
        return `Ошибка AI: ${error.message}`;
    }
}

// 1. Тренер
app.post('/api/trainer', checkCache, async (req, res) => {
    const userData = req.body.userData;
    const bmiData = calculateBMIAndObesity(userData.weight, userData.height);

    const genderText = userData.gender === 'male' ? 'мужчина' : 'женщина';

    const prompt = `
Создай программу тренировок для:
- Имя: ${userData.name}
- Пол: ${genderText}
- Возраст: ${userData.age} лет  
- Вес: ${userData.weight}кг, Рост: ${userData.height}см
- ИМТ: ${bmiData.bmi} (${bmiData.category})
- Активность: ${userData.activity}
- Цель: ${userData.goal}
- Опыт: ${userData.additionalInfo || 'начинающий'}

Дай рекомендации в формате:
🎯 ОСНОВНЫЕ РЕКОМЕНДАЦИИ:
🏋️ ПРОГРАММА ТРЕНИРОВОК:
⚠️ МЕРЫ ПРЕДОСТОРОЖНОСТИ:
💡 СОВЕТЫ НА ПЕРВЫЕ НЕДЕЛИ:`;

    const advice = await getAIResponse(prompt, 'trainer');
    res.json({
        success: true,
        advice: advice,
        type: 'trainer',
        bmiData: bmiData
    });
});

// 2. Диетолог
app.post('/api/diet', checkCache, async (req, res) => {
    const userData = req.body.userData;
    const bmiData = calculateBMIAndObesity(userData.weight, userData.height);

    const genderText = userData.gender === 'male' ? 'мужчина' : 'женщина';

    const prompt = `
Дай рекомендации по питанию для:
- Имя: ${userData.name}
- Пол: ${genderText}
- Возраст: ${userData.age} лет
- Вес: ${userData.weight}кг, Рост: ${userData.height}см
- ИМТ: ${bmiData.bmi} (${bmiData.category})
- Активность: ${userData.activity}
- Цель: ${userData.goal}
- Дополнительно: ${userData.additionalInfo || 'нет'}

Дай рекомендации в формате:
🍽️ СУТОЧНАЯ КАЛОРИЙНОСТЬ:
🥩 БЕЛКИ, ЖИРЫ, УГЛЕВОДЫ:
📋 ПРИМЕРНОЕ МЕНЮ НА ДЕНЬ:
💡 СОВЕТЫ ПО ПИТАНИЮ:`;

    const advice = await getAIResponse(prompt, 'diet');
    res.json({
        success: true,
        advice: advice,
        type: 'diet',
        bmiData: bmiData
    });
});

// 3. Энергия
app.post('/api/energy', checkCache, async (req, res) => {
    const userData = req.body.userData;
    const bmiData = calculateBMIAndObesity(userData.weight, userData.height);

    const genderText = userData.gender === 'male' ? 'мужчина' : 'женщина';

    const prompt = `
Дай рекомендации по управлению энергией для:
- Имя: ${userData.name}
- Пол: ${genderText}
- Возраст: ${userData.age} лет
- Вес: ${userData.weight}кг, Рост: ${userData.height}см
- ИМТ: ${bmiData.bmi} (${bmiData.category})
- Активность: ${userData.activity}
- Цель: ${userData.goal}
- Дополнительно: ${userData.additionalInfo || 'нет'}

Дай рекомендации в формате:
⏰ ОПТИМАЛЬНЫЙ РАСПОРЯДОК ДНЯ:
🧘 ТЕХНИКИ ВОССТАНОВЛЕНИЯ:
⚡ УПРАВЛЕНИЕ ЭНЕРГИЕЙ:
💡 ПРАКТИЧЕСКИЕ РИТУАЛЫ:`;

    const advice = await getAIResponse(prompt, 'energy');
    res.json({
        success: true,
        advice: advice,
        type: 'energy',
        bmiData: bmiData
    });
});

// Запуск сервера
app.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на http://localhost:${PORT}`);
    console.log(`🤖 AI интеграция: Fireworks активна`);
});

app.get('/api/test-endpoint', (req, res) => {
    res.json({ 
        status: 'ok', 
        message: 'Endpoint works!',
        timestamp: new Date().toISOString()
    });
});

module.exports = app;
