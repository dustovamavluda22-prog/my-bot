const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const fs = require('fs');

// Твой токен
const bot = new Telegraf('8883314122:AAF_iwlBfEeGWc01AO3i5FpRpIpX6U0EPss');

// Твой Telegram ID
const ADMIN_ID = 6695270539; 

// Файл для хранения пользователей и статистики
const DB_FILE = 'users.json';
let db = { users: [], stats: { total_downloads: 0 } };

if (fs.existsSync(DB_FILE)) {
    try { db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch (e) { console.log('Ошибка чтения БД'); }
}

function saveDB() { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); }

function registerUser(ctx) {
    const userId = ctx.from.id;
    if (!db.users.includes(userId)) { db.users.push(userId); saveDB(); }
}

const userLinks = {};
let waitingForBroadcast = false;

// 1. Главное меню (Пересобрано на 3 кнопки)
bot.start((ctx) => {
    registerUser(ctx);
    const welcomeText = 
        "👋 Привет, друг!\n\n" +
        "🤖 Я твой быстрый бот для скачивания медиа!\n\n" +
        "📥 Просто отправь мне ссылку на видео из TikTok, YouTube или Instagram Reels, и я сразу пришлю тебе файл!\n\n" +
        "👇 Используй меню ниже для навигации:";
    
    ctx.reply(welcomeText, 
        Markup.keyboard([
            ['🔥 Топ Скачиваний', 'ℹ️ Инструкция'],
            ['🆘 Помощь']
        ]).resize()
    );
});

// Вычищаем мусор из ссылок
function extractUrl(text) {
    const match = text.match(/(https?:\/\/[^\s]+)/);
    return match ? match[0] : null;
}

// 2. Прием сообщений и ссылок
bot.on('text', async (ctx) => {
    registerUser(ctx);
    const text = ctx.message.text;
    const userId = ctx.from.id;

    if (waitingForBroadcast && userId === ADMIN_ID) {
        waitingForBroadcast = false;
        ctx.reply(`📢 Начинаю рассылку...`);
        let successCount = 0;
        for (const id of db.users) {
            try { await ctx.telegram.sendMessage(id, text); successCount++; } catch (err) {}
        }
        return ctx.reply(`✅ Рассылка завершена! Доставлено: ${successCount}/${db.users.length}`);
    }

    const cleanUrl = extractUrl(text);

    if (cleanUrl) {
        userLinks[userId] = cleanUrl;
        const statusMessage = await ctx.reply('⏳');

        try {
            // Стабильный глобальный шлюз
            const response = await axios.get(`https://api.leoxhtml.my.id/api/download/allinone?url=${encodeURIComponent(cleanUrl)}`);
            
            let videoUrl = null;
            if (response.data && response.data.result) {
                const res = response.data.result;
                videoUrl = res.videoUrl || res.url || (res.links && res.links.find(l => l.type === 'video')?.url);
            }

            // Запасной шлюз
            if (!videoUrl) {
                const res2 = await axios.get(`https://api.alyachan.pro/api/allinone?url=${encodeURIComponent(cleanUrl)}`);
                if (res2.data && res2.data.result) {
                    videoUrl = res2.data.result.videoUrl || res2.data.result.url || res2.data.result.mp4;
                }
            }

            if (videoUrl) {
                try { await ctx.telegram.deleteMessage(ctx.chat.id, statusMessage.message_id); } catch(e){}

                const musicKeyboard = Markup.inlineKeyboard([[Markup.button.callback('🎵 Скачать музыку из видео 🎧', 'get_mp3')]]);

                await ctx.replyWithVideo(videoUrl, { 
                    caption: `⚡ Скачано легко через @${ctx.botInfo.username}`,
                    ...musicKeyboard
                });

                db.stats.total_downloads++;
                saveDB();
                return;
            }

            throw new Error('No media found');

        } catch (error) {
            console.error(error);
            try { await ctx.telegram.deleteMessage(ctx.chat.id, statusMessage.message_id); } catch(e){}
            ctx.reply('❌ Сервер загрузки временно перегружен запросами. Попробуй переотправить ссылку через 5 секунд!');
        }
    } else {
        if (text === '🔥 Топ Скачиваний') {
            return ctx.reply(`📊 Статистика бота:\n• Пользователей в базе: ${db.users.length}\n• Всего успешно скачано: ${db.stats.total_downloads} файлов`);
        }
        if (text === 'ℹ️ Инструкция') {
            return ctx.reply('📖 Быстрая инструкция:\n\n1. Скопируй ссылку на видео.\n2. Отправь её мне в чат.\n3. Через пару секунд забирай готовый файл!');
        }
        if (text === '🆘 Помощь') {
            return ctx.reply("🆘 Ошибка загрузки?\n\n1️⃣ Проверь, чтобы профиль автора был открытым.\n2️⃣ Стримы и видео длиннее 10 минут не поддерживаются.\n3️⃣ Если сервер лег, просто отправь ссылку еще раз через пару секунд.");
        }
        ctx.reply('🤖 Отправь мне рабочую ссылку, и я сразу пришлю тебе файл!');
    }
});

// 3. Извлечение MP3
bot.action('get_mp3', async (ctx) => {
    const userId = ctx.from.id;
    const url = userLinks[userId];
    if (!url) return ctx.answerCbQuery('❌ Ссылка устарела!', { show_alert: true });

    await ctx.answerCbQuery('Извлекаю аудио... ⏳');
    try {
        const response = await axios.get(`https://api.leoxhtml.my.id/api/download/allinone?url=${encodeURIComponent(url)}`);
        const audioUrl = response.data?.result?.audioUrl || response.data?.result?.url;
        if (audioUrl) {
            await ctx.replyWithAudio(audioUrl, { caption: '🎵 Аудио успешно извлечено!' });
        } else {
            await ctx.reply('❌ Не удалось вытащить звук.');
        }
    } catch (error) {
        await ctx.reply('❌ Ошибка при конвертации в MP3.');
    }
});

// Админка
bot.command('admin', (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return ctx.reply('❌ Нет прав.');
    ctx.reply('👑 Админ-панель:', Markup.inlineKeyboard([[Markup.button.callback('📢 Рассылка', 'admin_broadcast')]]));
});

bot.action('admin_broadcast', (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery();
    ctx.answerCbQuery();
    waitingForBroadcast = true;
    ctx.reply('📝 Напиши текст рассылки:');
});

bot.launch().then(() => console.log('🚀 Бот перезапущен в чистом виде!'));


