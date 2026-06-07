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

// 1. Главное меню (Обновленное, с новыми кнопками)
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
            ['🆘 Помощь', '🌟 Поддержать']
        ]).resize()
    );
});

// Функция для очистки ссылок от мусора приложений
function extractUrl(text) {
    const match = text.match(/(https?:\/\/[^\s]+)/);
    return match ? match[0] : null;
}

// 2. Прием сообщений и ссылок
bot.on('text', async (ctx) => {
    registerUser(ctx);
    const text = ctx.message.text;
    const userId = ctx.from.id;

    // Рассылка от админа
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

    // Если прислали ссылку — запускаем загрузку
    if (cleanUrl) {
        userLinks[userId] = cleanUrl;
        const statusMessage = await ctx.reply('⏳');

        try {
            // Основное API
            const response = await axios.get(`https://api.agatz.xyz/api/allinone?url=${encodeURIComponent(cleanUrl)}`);
            
            if (response.data && response.data.status === 200 && response.data.data) {
                const mediaData = response.data.data;
                const videoUrl = mediaData.videoUrl || (mediaData.links && mediaData.links.find(l => l.type === 'video')?.url) || mediaData.url;

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
            }
            
            // Резервное API
            const fallback = await axios.get(`https://api.giftedtech.my.id/api/download/allinone?url=${encodeURIComponent(cleanUrl)}`);
            if (fallback.data && fallback.data.success && fallback.data.result) {
                const fallbackUrl = fallback.data.result.video_url || fallback.data.result.url;
                if (fallbackUrl) {
                    try { await ctx.telegram.deleteMessage(ctx.chat.id, statusMessage.message_id); } catch(e){}
                    const musicKeyboard = Markup.inlineKeyboard([[Markup.button.callback('🎵 Скачать музыку из видео 🎧', 'get_mp3')]]);
                    await ctx.replyWithVideo(fallbackUrl, { caption: `⚡ Скачано через @${ctx.botInfo.username}`, ...musicKeyboard });
                    db.stats.total_downloads++;
                    saveDB();
                    return;
                }
            }

            throw new Error('No video found');

        } catch (error) {
            console.error(error);
            try { await ctx.telegram.deleteMessage(ctx.chat.id, statusMessage.message_id); } catch(e){}
            ctx.reply('❌ Ошибка загрузки. Попробуй еще раз. Если не получается — загляни в кнопку «🆘 Помощь».');
        }
    } else {
        // Обработка обычных текстовых кнопок меню
        if (text === '🔥 Топ Скачиваний') {
            return ctx.reply(`📊 Статистика бота:\n• Пользователей в базе: ${db.users.length}\n• Всего успешно скачано: ${db.stats.total_downloads} файлов`);
        }
        if (text === 'ℹ️ Инструкция') {
            return ctx.reply('📖 Быстрая инструкция:\n\n1. Открой TikTok, Instagram или YouTube.\n2. Нажми кнопку «Поделиться» и скопируй ссылку.\n3. Отправь ссылку мне в чат.\n4. Через пару секунд я пришлю тебе готовый файл!\n\n🎵 Под каждым видео будет кнопка для скачивания MP3 дорожки.');
        }
        if (text === '🆘 Помощь') {
            const helpText = 
                "🆘 Что делать, если бот выдает ошибку?\n\n" +
                "1️⃣ **Проверь приватность:** Бот не умеет скачивать видео из закрытых (приватных) аккаунтов. Профиль автора должен быть открыт.\n" +
                "2️⃣ **Удаленное медиа:** Возможно, автор только что удалил видео или оно заблокировано платформой.\n" +
                "3️⃣ **Ограничения YouTube:** Слишком длинные видео (фильмы, стримы по 2-3 часа) бот скачать не сможет, отправляй только Reels, Shorts или короткие ролики.\n" +
                "4️⃣ **Перегрузка серверов:** Если часики зависли, просто подожди 10 секунд и отправь ссылку еще раз.";
            return ctx.reply(helpText);
        }
        if (text === '🌟 Поддержать') {
            const donateText = 
                "🌟 Понравился бот?\n\n" +
                "Ты можешь поддержать разработчика и помочь проекту оставаться бесплатным и быстрым! Все донаты идут исключительно на оплату мощных серверов хостинга.\n\n" +
                "💳 **Для поддержки проекта:**\n" +
                "• Сюда можно вписать карту, крипту или ссылку на Qiwi / ЮMoney!\n\n" +
                "Спасибо, что ты с нами! 🚀";
            return ctx.reply(donateText);
        }
        ctx.reply('🤖 Отправь мне рабочую ссылку на видео, и я сразу пришлю тебе файл!');
    }
});

// 3. Извлечение MP3
bot.action('get_mp3', async (ctx) => {
    const userId = ctx.from.id;
    const url = userLinks[userId];
    if (!url) return ctx.answerCbQuery('❌ Ссылка устарела. Отправь её заново!', { show_alert: true });

    await ctx.answerCbQuery('Извлекаю аудио... ⏳');
    try {
        const response = await axios.get(`https://api.agatz.xyz/api/allinone?url=${encodeURIComponent(url)}`);
        const audioUrl = response.data?.data?.audioUrl || response.data?.data?.url;
        if (audioUrl) {
            await ctx.replyWithAudio(audioUrl, { caption: '🎵 Аудио извлечено успешно!' });
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
    ctx.reply('📝 Напиши текст рассылки для ВСЕХ пользователей:');
});

bot.launch().then(() => console.log('🚀 Бот успешно перезапущен с новыми фичами!'));

