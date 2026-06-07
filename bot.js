const { Telegraf, Markup } = require('telegraf');
const fs = require('fs');

// Твой рабочий боевой токен
const bot = new Telegraf('8883314122:AAHd_MYGF5GSZBOSk94PPAXpEZCQsW4u4GQ');

// Твой Telegram ID
const ADMIN_ID = 6695270539; 

// Простая база данных в файле
const DB_FILE = 'users.json';
let db = { users: [], stats: { total_downloads: 0 } };

if (fs.existsSync(DB_FILE)) {
    try { db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch (e) { console.log('Ошибка чтения базы данных'); }
}

function saveDB() { 
    try { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); } catch(e) {}
}

function registerUser(ctx) {
    const userId = ctx.from.id;
    if (!db.users.includes(userId)) { db.users.push(userId); saveDB(); }
}

const userLinks = {};
let waitingForBroadcast = false;

// 1. Главное меню
bot.start((ctx) => {
    registerUser(ctx);
    const welcomeText = 
        "👋 Привет, друг!\n\n" +
        "🤖 Я твой быстрый бот для скачивания медиа!\n\n" +
        "📥 Просто отправь мне ссылку на видео из TikTok, YouTube или Instagram Reels, и я пришлю тебе файл!\n\n" +
        "👇 Используй меню ниже:";
    
    ctx.reply(welcomeText, 
        Markup.keyboard([
            ['🔥 Топ Скачиваний', 'ℹ️ Инструкция'],
            ['🆘 Помощь']
        ]).resize()
    );
});

// Регулярка для вытягивания чистой ссылки
function extractUrl(text) {
    const match = text.match(/(https?:\/\/[^\s]+)/);
    return match ? match[0] : null;
}

// 2. Прием сообщений и ссылок
bot.on('text', async (ctx) => {
    registerUser(ctx);
    const text = ctx.message.text;
    const userId = ctx.from.id;

    // Админ-рассылка
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
            // Отправляем запрос на Cobalt через встроенный fetch без лишних библиотек
            const response = await fetch('https://api.cobalt.tools/api/json', {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    url: cleanUrl,
                    vQuality: "720"
                })
            });

            const data = await response.json();

            if (data && data.url) {
                try { await ctx.telegram.deleteMessage(ctx.chat.id, statusMessage.message_id); } catch(e){}

                const musicKeyboard = Markup.inlineKeyboard([[Markup.button.callback('🎵 Скачать музыку из видео 🎧', 'get_mp3')]]);

                // Твоё фирменное описание видео без левой рекламы
                await ctx.replyWithVideo(data.url, { 
                    caption: `⚡ Скачано легко через @${ctx.botInfo.username}`,
                    ...musicKeyboard
                });

                db.stats.total_downloads++;
                saveDB();
                return;
            }

            throw new Error('Кобальт не вернул ссылку');

        } catch (error) {
            console.error('Ошибка загрузки:', error.message);
            try { await ctx.telegram.deleteMessage(ctx.chat.id, statusMessage.message_id); } catch(e){}
            ctx.reply('❌ Не удалось скачать. Возможно, сервер перегружен. Попробуй еще раз через 5 секунд!');
        }
    } else {
        if (text === '🔥 Топ Скачиваний') {
            return ctx.reply(`📊 Статистика бота:\n• Пользователей: ${db.users.length}\n• Скачано файлов: ${db.stats.total_downloads}`);
        }
        if (text === 'ℹ️ Инструкция') {
            return ctx.reply('📖 Инструкция:\n1. Скопируй ссылку на видео.\n2. Отправь её мне в чат.\n3. Забирай готовый файл!');
        }
        if (text === '🆘 Помощь') {
            return ctx.reply("🆘 Ошибка?\n1️⃣ Проверь, чтобы профиль был открытым.\n2️⃣ Длинные видео не поддерживаются.\n3️⃣ Скинь ссылку еще раз через пару секунд.");
        }
        ctx.reply('🤖 Отправь мне рабочую ссылку, и я пришлю тебе файл!');
    }
});

// 3. Извлечение MP3
bot.action('get_mp3', async (ctx) => {
    const userId = ctx.from.id;
    const url = userLinks[userId];
    if (!url) return ctx.answerCbQuery('❌ Ссылка устарела!', { show_alert: true });

    await ctx.answerCbQuery('Извлекаю аудио... ⏳');
    try {
        const response = await fetch('https://api.cobalt.tools/api/json', {
            method: 'POST',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: url, isAudioOnly: true })
        });
        const data = await response.json();

        if (data && data.url) {
            await ctx.replyWithAudio(data.url, { caption: '🎵 Аудио успешно извлечено!' });
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
    ctx.reply('👑 Админ:', Markup.inlineKeyboard([[Markup.button.callback('📢 Рассылка', 'admin_broadcast')]]));
});

bot.action('admin_broadcast', (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery();
    ctx.answerCbQuery();
    waitingForBroadcast = true;
    ctx.reply('📝 Напиши текст рассылки:');
});

// ГЛОБАЛЬНЫЙ ЩИТ: Защищает бота от крашей при любых внутренних ошибках
process.on('uncaughtException', (err) => { console.log('Поймана критическая ошибка:', err); });
process.on('unhandledRejection', (err) => { console.log('Поймана ошибка промиса:', err); });
bot.catch((err) => { console.log('Ошибка Telegraf:', err); });

bot.launch().then(() => console.log('🚀 Бот запущен со стопроцентной защитой от крашей!'));

