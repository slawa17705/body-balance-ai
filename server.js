const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
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
// let bot;
// if (process.env.TELEGRAM_BOT_TOKEN) {
//     bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });
//     console.log('✅ Telegram бот запущен');
// } else {
//     console.log('⚠️ TELEGRAM_BOT_TOKEN не установлен, бот отключен');
// }
// Telegram бот отключен чтобы избежать конфликта 409
// Бот запускается отдельным процессом (test-bot.js)

let bot = null;
console.log('🤖 Telegram бот отключен в server.js');

// Google Sheets интеграция (используем существующий код)
const { google } = require('googleapis');

class GoogleSheetsManager {
    // ... существующий код GoogleSheetsManager ...
}

const sheetsManager = new GoogleSheetsManager();

// ====================
// API для AI интеграции
// ====================

// Получить API ключ для фронтенда
app.get('/api/get-ai-key', (req, res) => {
    // Можно отправить ключ или использовать прокси
    const useProxy = process.env.USE_AI_PROXY === 'true';

    if (useProxy) {
        res.json({
            success: true,
            useProxy: true,
            message: 'Используется серверный прокси'
        });
    } else if (process.env.OPENROUTER_API_KEY) {
        res.json({
            success: true,
            apiKey: process.env.OPENROUTER_API_KEY
        });
    } else {
        res.json({
            success: false,
            message: 'API ключ не настроен, используйте прокси'
        });
    }
});

// Прокси для AI запросов
app.post('/api/query', async (req, res) => {
    try {
        const { model, messages, max_tokens, temperature } = req.body;

        if (!process.env.OPENROUTER_API_KEY) {
            return res.status(500).json({
                success: false,
                error: 'API ключ не настроен на сервере'
            });
        }

        const response = await axios.post(
            'https://openrouter.ai/api/v1/chat/completions',
            {
                model: model || 'deepseek/deepseek-chat-v3-0324',
                messages,
                max_tokens: max_tokens || 1000,
                temperature: temperature || 0.7
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

// Анализ тренировки
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
                model: 'deepseek/deepseek-chat-v3-0324',
                messages: [
                    {
                        role: 'system',
                        content: 'Ты профессиональный фитнес-тренер с медицинским образованием.'
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
                model: 'deepseek/deepseek-chat-v3-0324',
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
                model: 'deepseek/deepseek-chat-v3-0324',
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
                // Если не нашли JSON, возвращаем как текст
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
                model: 'deepseek/deepseek-chat-v3-0324',
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

    // Здесь можно добавить логику проверки из базы данных
    // Пока возвращаем демо-статус

    res.json({
        success: true,
        userId: userId,
        status: 'active', // или 'pending', 'inactive'
        currentStep: 3, // последний завершенный шаг
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

    // Добавляем ВСЕ данные пользователя в ключ кэша
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

        // Получаем путь (/api/trainer, /api/diet, /api/energy)
        const path = req.path; // например: "/api/trainer"
        const cacheKey = `${userId}_${path}`;

        const cached = userCache.get(cacheKey);

        // Если есть кэш и есть текущий вес
        if (cached && currentWeight !== undefined) {
            const now = new Date();
            const lastDate = new Date(cached.timestamp);
            const weeksPassed = (now - lastDate) / (1000 * 60 * 60 * 24 * 7);
            const weightDiff = Math.abs(currentWeight - cached.weight);

            // Проверяем условия
            if (weeksPassed < 3) {
                // Меньше 3 недель - кэш
                console.log(`📦 Используем кэш для ${path} (${weeksPassed.toFixed(1)} недель)`);
                return res.json({
                    ...cached.response,
                    cached: true,
                    weeksSinceCache: weeksPassed.toFixed(1)
                });
            }

            if (weightDiff < 2) {
                // Вес изменился меньше чем на 2 кг - кэш
                console.log(`📦 Используем кэш для ${path} (разница веса: ${weightDiff}кг)`);
                return res.json({
                    ...cached.response,
                    cached: true,
                    weightDifference: weightDiff
                });
            }
        }

        // Нужен новый запрос
        console.log(`🔄 Новый запрос к AI для ${path}`);

        // Сохраняем данные для сохранения в кэш
        req._cacheKey = cacheKey;
        req._userWeight = currentWeight;
        req._userData = userData;

        // Перехватываем ответ
        const originalJson = res.json;
        res.json = function (data) {
            // Сохраняем в кэш, если успешный ответ
            if (data.success && data.advice && req._userWeight !== undefined) {
                userCache.set(req._cacheKey, {
                    response: data,
                    weight: req._userWeight,
                    timestamp: new Date().toISOString()
                });
                console.log(`💾 Сохранен кэш для ${path}`);

                // Добавляем флаг, что это новый ответ
                data.cached = false;
                data.generatedAt = new Date().toISOString();
            }
            return originalJson.call(this, data);
        };

        next();

    } catch (error) {
        console.error('Ошибка в кэше:', error);
        next(); // В случае ошибки просто пропускаем кэширование
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

// Общая функция для запросов к AI
async function getAIResponse(prompt, specialist) {
    try {
        const systemPrompts = {
            trainer: 'Ты профессиональный фитнес-тренер элитного уровня. Отвечай конкретно: упражнения, подходы, повторения, прогрессия нагрузок. Будь мотивирующим и строгим. Сбалансированно используй системы Джо Вейдера и прифессиональных тренеров',
            diet: 'Ты главный лучший диетолог президентского санатория, профессор нутрициологии, Опирайся на введенные данные и правильно составь рацион, подбери  систему без вреда для здоровья . Отвечай научно: расчет БЖУ, калорий, расписание приемов пищи, конкретные продукты.',
            energy: 'Ты профессор спортивной медицины, признанный мировым сообществом, специалист по циркадным ритмам. Отвечай как ученый: техники восстановления, распорядок дня, дыхательные практики, оптимизация сна. Товя поддержка основанна на главной цели - максимальная помощь'
        };

        const response = await axios.post(
            'https://openrouter.ai/api/v1/chat/completions',
            {
                model: 'deepseek/deepseek-chat-v3-0324',
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
                max_tokens: 2000
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
        return `Рекомендации от ${specialist} временно недоступны. Обратитесь позже.`;
    }
}



// Запуск сервера
app.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на http://localhost:${PORT}`);
    console.log(`🤖 AI интеграция: ${process.env.OPENROUTER_API_KEY ? 'активна' : 'требуется API ключ'}`);
});

// ==================== СПЕЦИАЛИСТЫ ====================



// 1. Тренер AI
app.post('/api/trainer', checkCache, async (req, res) => {
    const userData = req.body.userData;

    const prompt = `Дай рекомендации для:
    Имя: ${userData.name}
    Возраст: ${userData.age} лет
    Вес: ${userData.weight}кг
    Рост: ${userData.height}см
    Активность: ${userData.activity}
    Цель: ${userData.goal}
    Дополнительно: ${userData.additionalInfo || 'нет'}`;

    // Используйте ваш существующий код для запроса к OpenRouter
    const advice = await getAIResponse(prompt, 'trainer');

    res.json({
        success: true,
        advice: advice,
        type: 'trainer'
    });
});

// 2. Диетолог AI
app.post('/api/diet', checkCache, async (req, res) => {
    const userData = req.body.userData;

    const prompt = `Дай рекомендации для:
    Имя: ${userData.name}
    Возраст: ${userData.age} лет
    Вес: ${userData.weight}кг
    Рост: ${userData.height}см
    Активность: ${userData.activity}
    Цель: ${userData.goal}
    Дополнительно: ${userData.additionalInfo || 'нет'}`;

    const advice = await getAIResponse(prompt, 'diet');

    res.json({
        success: true,
        advice: advice,
        type: 'diet'
    });
});

// 3. Эксперт по энергии
app.post('/api/energy', checkCache, async (req, res) => {
    const userData = req.body.userData;

    const prompt = `Дай рекомендации для:
    Имя: ${userData.name}
    Возраст: ${userData.age} лет
    Вес: ${userData.weight}кг
    Рост: ${userData.height}см
    Активность: ${userData.activity}
    Цель: ${userData.goal}
    Дополнительно: ${userData.additionalInfo || 'нет'}`;

    const advice = await getAIResponse(prompt, 'energy');

    res.json({
        success: true,
        advice: advice,
        type: 'energy'
    });
});

// Общая функция для запросов к AI - ИСПРАВЛЕННАЯ!
async function getAIResponse(prompt, specialist) {
    try {
        // РАЗНЫЕ SYSTEM PROMPT ДЛЯ КАЖДОГО СПЕЦИАЛИСТА
        const systemPrompts = {
            trainer: 'Ты профессиональный фитнес-тренер элитного уровня. Отвечай конкретно: упражнения, подходы, повторения, прогрессия нагрузок. Будь мотивирующим и строгим.',
            diet: 'Ты главный диетолог президентского санатория, профессор нутрициологии. Отвечай научно: расчет БЖУ, калорий, расписание приемов пищи, конкретные продукты.',
            energy: 'Ты профессор спортивной медицины, специалист по циркадным ритмам. Отвечай как ученый: техники восстановления, распорядок дня, дыхательные практики, оптимизация сна.'
        };

        const response = await axios.post(
            'https://openrouter.ai/api/v1/chat/completions',
            {
                model: 'deepseek/deepseek-chat-v3-0324',
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
                max_tokens: 2000
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
        return `Рекомендации от ${specialist} временно недоступны. Обратитесь позже.`;
    }
}