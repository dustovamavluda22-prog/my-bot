const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const fs = require('fs');

// Твой токен
const bot = new Telegraf('8883314122:AAF_iwlBfEeGWc01AO3i5FpRpIpX6U0EPss');

// Твой Telegram ID — ПОЛНАЯ ЗАЩИТА
const ADMIN_ID = 6695270539; 

// Файл для хранения пользователей и статистики
const DB_FILE = 'users.json';
let db = { users: [], stats: { total_downloads: 0 } };

if (fs.existsSync(DB_FILE)) {
    try {
        db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    } catch (e) {
        console.log('Ошибка чтения базы данных');
    }
}

function saveDB() {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function registerUser(ctx) {
    const userId = ctx.from.id;
    if (!db.users.includes(userId)) {
        db.users.push(userId);
        saveDB();
    }
}

// Временное хранилище ссылок для извлечения MP3
const userLinks = {};
let waitingForBroadcast = false;

// 1. Главное меню (/start)
bot.start((ctx) => {
    registerUser(ctx);
    
    const welcomeText = 
        "👋 Привет, друг!\n\n" +
        "🤖 Я твой быстрый бот для скачивания медиа!\n\n" +
        "📥 Просто отправь мне ссылку на видео из TikTok, YouTube или Instagram Reels, и я сразу пришлю тебе файл!\n\n" +
        "👇 Используй меню ниже для проверки статистики или чтения инструкции:";

    ctx.reply(welcomeText, 
        Markup.keyboard([
            ['🔥 Топ Скачиваний', 'ℹ️ Инструкция']
        ]).resize()
    );
});

// 2. Прием сообщений и ссылок
bot.on('text', async (ctx) => {
    registerUser(ctx);
    const text = ctx.message.text;
    const userId = ctx.from.id;

    // Строгая проверка админа для рассылки
    if (waitingForBroadcast) {
        if (userId !== ADMIN_ID) {
            waitingForBroadcast = false;
            return;
        }
        waitingForBroadcast = false;
        ctx.reply(`📢 Начинаю рассылку...`);
        let successCount = 0;
        for (const id of db.users) {
            try {
                await ctx.telegram.sendMessage(id, text);
                successCount++;
            } catch (err) {}
        }
        return ctx.reply(`✅ Рассылка завершена! Доставлено: ${successCount}/${db.users.length}`);
    }

    // Если прислали ссылку — КАЧАЕМ СРАЗУ!
    if (text.includes('http://') || text.includes('https://')) {
        userLinks[userId] = text; // Запоминаем для кнопки MP3
        
        // Отправляем ТОЛЬКО анимированные часики ⏳
        const statusMessage = await ctx.reply('⏳');

        try {
            // Переключаемся на альтернативное стабильное API
            const response = await axios.get(`https://api.lolhuman.xyz/api/download/instagram?apikey=freekey&url=${encodeURIComponent(text)}`);

            if (response.data && response.data.result && response.data.result.url) {
                // Удаляем часики ⏳
                try { await ctx.telegram.deleteMessage(ctx.chat.id, statusMessage.message_id); } catch(e){}

                // Создаем красивую кнопку СКАЧАТЬ МУЗЫКУ прямо под видео
                const musicKeyboard = Markup.inlineKeyboard([
                    [Markup.button.callback('🎵 Скачать музыку из видео 🎧', 'get_mp3')]
                ]);

                // Отправляем готовое видео с кнопкой под ним!
                await ctx.replyWithVideo(response.data.result.url, { 
                    caption: `⚡ Скачано легко через @${ctx.botInfo.username}`,
                    ...musicKeyboard
                });

                db.stats.total_downloads++;
                saveDB();
            } else {
                // Если не инстаграм, пробуем универсальный метод этого же API
                const fallbackResponse = await axios.get(`https://api.lolhuman.xyz/api/twtdownload?apikey=freekey&url=${encodeURIComponent(text)}`);
                if (fallbackResponse.data && fallbackResponse.data.result && fallbackResponse.data.result.url) {
                    try { await ctx.telegram.deleteMessage(ctx.chat.id, statusMessage.message_id); } catch(e){}
                    
                    const musicKeyboard = Markup.inlineKeyboard([
                        [Markup.button.callback('🎵 Скачать музыку из видео 🎧', 'get_mp3')]
                    ]);

                    await ctx.replyWithVideo(fallbackResponse.data.result.url, { 
                        caption: `⚡ Скачано легко через @${ctx.botInfo.username}`,
                        ...musicKeyboard
                    });
                    db.stats.total_downloads++;
                    saveDB();
                } else {
                    try { await ctx.telegram.deleteMessage(ctx.chat.id, statusMessage.message_id); } catch(e){}
                    ctx.reply('❌ Не удалось скачать. Возможно, ссылка не поддерживается или профиль приватный.');
                }
            }
        } catch (error) {
            console.error(error);
            try { await ctx.telegram.deleteMessage(ctx.chat.id, statusMessage.message_id); } catch(e){}
            ctx.reply('❌ Ошибка сети. Попробуй отправить ссылку ещё раз.');
        }
    } else {
        // Кнопки нижнего меню
        if (text === '🔥 Топ Скачиваний') {
            return ctx.reply(`📊 Статистика бота:\n• Пользователей: ${db.users.length}\n• Скачано файлов: ${db.stats.total_downloads}`);
        }
        if (text === 'ℹ️ Инструкция') {
            return ctx.reply('📖 Как пользоваться:\n1. Скопируй ссылку на видео.\n2. Отправь её мне.\n3. Я сразу пришлю тебе видеофайл.\n4. Если нужна музыка — нажми на кнопку под присланным видео!');
        }
        ctx.reply('🤖 Отправь мне ссылку на видео, и я сразу пришлю тебе файл!');
    }
});

// 3. Обработка кнопки "Скачать музыку" под видео
bot.action('get_mp3', async (ctx) => {
    const userId = ctx.from.id;
    const url = userLinks[userId];

    if (!url) {
        return ctx.answerCbQuery('❌ Ссылка устарела. Отправь её заново!', { show_alert: true });
    }

    await ctx.answerCbQuery('Извлекаю аудиодорожку... ⏳');

    try {
        const response = await axios.get(`https://api.lolhuman.xyz/api/twtdownload?apikey=freekey&url=${encodeURIComponent(url)}`);

        if (response.data && response.data.result && response.data.result.url) {
            await ctx.replyWithAudio(response.data.result.url, { caption: '🎵 Аудио извлечено успешно!' });
        } else {
            await ctx.reply('❌ Не удалось вытащить звук.');
        }
    } catch (error) {
        console.error(error);
        await ctx.reply('❌ Ошибка при конвертации в MP3.');
    }
});

// ================= АДМИНКА =================
bot.command('admin', (ctx) => {
    if (ctx.from.id !== ADMIN_ID) {
        return ctx.reply('❌ У тебя нет прав для использования этой команды.');
    }
    const adminKeyboard = Markup.inlineKeyboard([
        [Markup.button.callback('📢 Сделать рассылку', 'admin_broadcast')]
    ]);
    ctx.reply('👑 Добро пожаловать в секретную Admin-панель!', adminKeyboard);
});

bot.action('admin_broadcast', (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery();
    ctx.answerCbQuery();
    waitingForBroadcast = true;
    ctx.reply('📝 Напиши текст рассылки для ВСЕХ пользователей:');
});
// ===============================================================

bot.launch().then(() => console.log('🚀 Бот с красивой анимацией запущен!'));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

