const express = require('express');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/test', (req, res) => {
    res.json({ message: 'Сервер работает!', timestamp: new Date() });
});

app.post('/api/trainer', (req, res) => {
    const { userData } = req.body;
    res.json({
        success: true,
        advice: `Привет, ${userData.name}! Рекомендации по тренировкам появятся позже.`,
        type: 'trainer'
    });
});

app.listen(PORT, () => console.log(`Сервер на порту ${PORT}`));

module.exports = app;
