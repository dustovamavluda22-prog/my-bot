
const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const fs = require('fs');

// Твой токен
const bot = new Telegraf('8883314122:AAF_iwlBfEeGWc01AO3i5FpRpIpX6U0EPss');

// Твой Telegram ID — ТЕПЕРЬ ПОЛНАЯ ЗАЩИТА
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

    // СТРОГАЯ ПРОВЕРКА АДМИНА ДЛЯ РАССЫЛКИ
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
        const statusMessage = await ctx.reply('⏳ Обрабатываю ссылку, подожди немного...');

        try {
            // Запрос к Cobalt за лучшим качеством видео
            const response = await axios.post('https://api.cobalt.tools/api/json', {
                url: text,
                vQuality: '720' // Оптимальное качество для Телеграма
            }, {
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            });

            if (response.data && response.data.url) {
                // Удаляем сообщение «Обрабатываю...»
                try { await ctx.telegram.deleteMessage(ctx.chat.id, statusMessage.message_id); } catch(e){}

                // Создаем красивую кнопку СКАЧАТЬ МУЗЫКУ прямо под видео
                const musicKeyboard = Markup.inlineKeyboard([
                    [Markup.button.callback('🎵 Скачать музыку из видео 🎧', 'get_mp3')]
                ]);

                // Отправляем готовое видео с кнопкой под ним!
                await ctx.replyWithVideo(response.data.url, { 
                    caption: `⚡ Скачано легко через @${ctx.botInfo.username}`,
                    ...musicKeyboard
                });

                db.stats.total_downloads++;
                saveDB();
            } else {
                ctx.reply('❌ Не удалось скачать. Возможно, видео приватное.');
            }
        } catch (error) {
            console.error(error);
            ctx.reply('❌ Ошибка при загрузке. Попробуй еще раз или скинь другую ссылку.');
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
        const response = await axios.post('https://api.cobalt.tools/api/json', {
            url: url,
            isAudioOnly: true
        }, {
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        });

        if (response.data && response.data.url) {
            await ctx.replyWithAudio(response.data.url, { caption: '🎵 Аудио извлечено успешно!' });
        } else {
            await ctx.reply('❌ Не удалось вытащить звук.');
        }
    } catch (error) {
        console.error(error);
        await ctx.reply('❌ Ошибка при конвертации в MP3.');
    }
});

// ================= АДМИНКА (СТРОЖАЙШИЙ ДОСТУП) =================
bot.command('admin', (ctx) => {
    if (ctx.from.id !== ADMIN_ID) {
        return ctx.reply('❌ У тебя нет прав для использования этой команды.');
    }
    const adminKeyboard = Markup.inlineKeyboard([
        [Markup.button.callback('📢 Сделать рассылку', 'admin_broadcast')]
    ]);
    ctx.reply('👑 Добро пожаловать в секретную Админ-панель!', adminKeyboard);
});

bot.action('admin_broadcast', (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery();
    ctx.answerCbQuery();
    waitingForBroadcast = true;
    ctx.reply('📝 Напиши текст рассылки, который увидят ВСЕ пользователи бота:');
});
// ===============================================================

bot.launch().then(() => console.log('🚀 Бот с защищенной админкой успешно запущен!'));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

