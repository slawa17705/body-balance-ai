const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

app.get('/test', (req, res) => {
    res.json({ message: 'Сервер работает!', timestamp: new Date() });
});

// ==================== YANDEXGPT ====================

const YANDEX_API_KEY = process.env.YANDEX_API_KEY;
const FOLDER_ID = 'b1gi3949lnslo8j8nfgk';

async function askYandexGPT(prompt) {
    const response = await axios.post(
        'https://llm.api.cloud.yandex.net/yandexgpt/latest/completion',
        {
            modelUri: `gpt://${FOLDER_ID}/yandexgpt/latest`,
            completionOptions: {
                stream: false,
                temperature: 0.7,
                maxTokens: 1500
            },
            messages: [{ role: 'user', text: prompt }]
        },
        {
            headers: {
                'Authorization': `Api-Key ${YANDEX_API_KEY}`,
                'Content-Type': 'application/json'
            }
        }
    );
    return response.data.result.message.text;
}

function calculateBMIAndObesity(weight, height) {
    if (!weight || !height) return { bmi: '0.0', category: 'Не определено' };
    const heightM = height / 100;
    const bmi = weight / (heightM * heightM);
    let category = '';
    if (bmi < 18.5) category = 'Недостаточная масса';
    else if (bmi < 25) category = 'Нормальная масса';
    else if (bmi < 30) category = 'Избыточная масса';
    else if (bmi < 35) category = 'Ожирение I степени';
    else if (bmi < 40) category = 'Ожирение II степени';
    else category = 'Ожирение III степени';
    return { bmi: bmi.toFixed(1), category };
}

// ==================== ЭНДПОИНТЫ ====================

app.post('/api/trainer', async (req, res) => {
    const userData = req.body.userData;
    const bmiData = calculateBMIAndObesity(userData.weight, userData.height);
    
    const prompt = `Ты профессиональный фитнес-тренер. Дай персонализированные рекомендации по тренировкам.

Данные пользователя:
- Имя: ${userData.name}
- Пол: ${userData.gender === 'male' ? 'мужчина' : 'женщина'}
- Возраст: ${userData.age} лет
- Вес: ${userData.weight} кг
- Рост: ${userData.height} см
- ИМТ: ${bmiData.bmi} (${bmiData.category})
- Активность: ${userData.activity}
- Цель: ${userData.goal}
- Ограничения: ${userData.additionalInfo || 'нет'}

Отвечай на русском, структурированно. Дай конкретные советы.`;
    
    try {
        const advice = await askYandexGPT(prompt);
        res.json({ success: true, advice, type: 'trainer', bmiData });
    } catch (error) {
        res.json({ success: false, error: error.message, type: 'trainer' });
    }
});

app.post('/api/diet', async (req, res) => {
    const userData = req.body.userData;
    const bmiData = calculateBMIAndObesity(userData.weight, userData.height);
    
    const prompt = `Ты профессиональный диетолог. Дай рекомендации по питанию.

Данные пользователя:
- Имя: ${userData.name}
- Пол: ${userData.gender === 'male' ? 'мужчина' : 'женщина'}
- Возраст: ${userData.age} лет
- Вес: ${userData.weight} кг
- Рост: ${userData.height} см
- ИМТ: ${bmiData.bmi} (${bmiData.category})
- Активность: ${userData.activity}
- Цель: ${userData.goal}
- Ограничения: ${userData.additionalInfo || 'нет'}

Учти принцип: "треть желудка — пища, треть — вода, треть — воздух". Отвечай на русском.`;
    
    try {
        const advice = await askYandexGPT(prompt);
        res.json({ success: true, advice, type: 'diet', bmiData });
    } catch (error) {
        res.json({ success: false, error: error.message, type: 'diet' });
    }
});

app.post('/api/energy', async (req, res) => {
    const userData = req.body.userData;
    const bmiData = calculateBMIAndObesity(userData.weight, userData.height);
    
    const prompt = `Ты эксперт по управлению энергией и сну. Дай рекомендации.

Данные пользователя:
- Имя: ${userData.name}
- Пол: ${userData.gender === 'male' ? 'мужчина' : 'женщина'}
- Возраст: ${userData.age} лет
- Вес: ${userData.weight} кг
- Цель: ${userData.goal}
- Ограничения: ${userData.additionalInfo || 'нет'}

Отвечай на русском: распорядок дня, техники восстановления, сон.`;
    
    try {
        const advice = await askYandexGPT(prompt);
        res.json({ success: true, advice, type: 'energy', bmiData });
    } catch (error) {
        res.json({ success: false, error: error.message, type: 'energy' });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Сервер на порту ${PORT}`);
    console.log(`🤖 AI: YandexGPT`);
});

module.exports = app;
