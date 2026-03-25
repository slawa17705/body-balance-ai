const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

app.post('/api/trainer', async (req, res) => {
    try {
        const { userData } = req.body;
        
        console.log('🔑 Ключ:', process.env.FIREWORKS_API_KEY ? 'Есть' : 'Нет');
        
        const response = await axios.post(
            'https://api.fireworks.ai/inference/v1/chat/completions',
            {
                model: 'accounts/fireworks/models/mixtral-8x7b-instruct',
                messages: [
                    {
                        role: 'user',
                        content: `Ты фитнес-тренер. Дай 3 совета для ${userData.name}, ${userData.age} лет, цель: ${userData.goal}. Отвечай на русском.`
                    }
                ],
                max_tokens: 500
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
            advice: response.data.choices[0].message.content
        });
    } catch (error) {
        console.error('Ошибка:', error.response?.data || error.message);
        res.json({
            success: false,
            error: error.response?.data?.error?.message || error.message,
            fullError: error.response?.data
        });
    }
});

app.get('/test', (req, res) => {
    res.json({ message: 'Сервер работает!' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на порту ${PORT}`);
});

module.exports = app;
