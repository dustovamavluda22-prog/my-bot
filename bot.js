const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const fs = require('fs');

// Твой токен
const bot = new Telegraf('8883314122:AAF_iwlBfEeGWc01AO3i5FpRpIpX6U0EPss');

// Твой Telegram ID 
const ADMIN_ID = 66952705396695270539; 

// Файл для хранения пользователей и статистики
const DB_FILE = 'users.json';
let db = { users: [], stats: { total_downloads: 0 } };

if (fs.existsSync(DB_FILE)) {
    db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

function saveDB() {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

// Функция для добавления нового юзера в базу
function registerUser(ctx) {
    const userId = ctx.from.id;
    if (!db.users.includes(userId)) {
        db.users.push(userId);
        saveDB();
    }
}

// Переменная для отслеживания режима рассылки
let waitingForBroadcast = false;

// Главное меню (при команде /start)
bot.start((ctx) => {
    registerUser(ctx);
    
    // Красивые кнопки прямо под сообщением (как на скрине)
    const inlineKeyboard = Markup.inlineKeyboard([
        [Markup.button.callback('📥 Скачать видео', 'menu_download')],
        [Markup.button.callback('📊 Моя статистика', 'menu_stats'), Markup.button.callback('⚙️ Настройки', 'menu_settings')]
    ]);

    ctx.replyWithMarkdownV2(
        `👋 *Привет\\! Я твой бот для скачивания видео\\!*\\n\\n` +
        `🤖 Отправь мне ссылку на видео из *YouTube, TikTok, Instagram или VK*, и я пришлю тебе файл\\!`,
        inlineKeyboard
    );
});

// Обработка нажатий на инлайн-кнопки
bot.action('menu_download', (ctx) => {
    ctx.answerCbQuery();
    ctx.reply('Просто отправь мне ссылку на видео в чат, и я начну загрузку! 🚀');
});

bot.action('menu_stats', (ctx) => {
    ctx.answerCbQuery();
    ctx.reply(`📊 Статистика:\n• Всего пользователей в боте: ${db.users.length}\n• Скачано видео через бота: ${db.stats.total_downloads}`);
});

bot.action('menu_settings', (ctx) => {
    ctx.answerCbQuery();
    ctx.reply('⚙️ Настройки: Бот автоматически выбирает максимальное доступное качество видео.');
});

// ================= СЕКЦИЯ АДМИНА =================
bot.command('admin', (ctx) => {
    if (ctx.from.id !== ADMIN_ID) {
        return ctx.reply('❌ У тебя нет прав для использования этой команды.');
    }

    const adminKeyboard = Markup.inlineKeyboard([
        [Markup.button.callback('📢 Сделать рассылку', 'admin_broadcast')],
        [Markup.button.callback('📊 Полная статистика', 'admin_stats')]
    ]);

    ctx.reply('👑 Добро пожаловать в Админ-панель!', adminKeyboard);
});

// Нажатие кнопки "Сделать рассылку"
bot.action('admin_broadcast', (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery();
    ctx.answerCbQuery();
    waitingForBroadcast = true;
    ctx.reply('📝 Напиши текст сообщения, которое нужно отправить ВСЕМ пользователям:');
});

// Нажатие кнопки "Полная статистика" в админке
bot.action('admin_stats', (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery();
    ctx.answerCbQuery();
    ctx.reply(`📊 [АДМИН] Статистика системы:\n• Юзеров в базе: ${db.users.length}\n• Успешных скачиваний: ${db.stats.total_downloads}`);
});
// =================================================

// Обработка обычного текста и ссылок
bot.on('text', async (ctx) => {
    registerUser(ctx);

    // Если админ включил режим рассылки
    if (ctx.from.id === ADMIN_ID && waitingForBroadcast) {
        waitingForBroadcast = false;
        const textToBroadcast = ctx.message.text;
        ctx.reply(`📢 Начинаю рассылку для ${db.users.length} пользователей...`);
        
        let successCount = 0;
        for (const userId of db.users) {
            try {
                await ctx.telegram.sendMessage(userId, textToBroadcast);
                successCount++;
            } catch (err) {
                console.log(`Не удалось отправить сообщение юзеру ${userId}`);
            }
        }
        return ctx.reply(`✅ Рассылка завершена! Успешно доставлено: ${successCount}/${db.users.length}`);
    }

    const text = ctx.message.text;

    // Проверка на ссылку
    if (text.includes('http://') || text.includes('https://')) {
        await ctx.reply('⏳ Обрабатываю ссылку, подожди немного...');

        try {
            const response = await axios.get(`https://api.cobalt.tools/api/json`, {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                data: { url: text }
            });

            if (response.data && response.data.url) {
                await ctx.reply('🎬 Видео найдено! Отправляю файл...');
                await ctx.replyWithVideo(response.data.url);
                
                // Считаем скачивание в общую стату
                db.stats.total_downloads++;
                saveDB();
            } else {
                ctx.reply('❌ Не удалось получить прямую ссылку на видео. Попробуй другую ссылку.');
            }
        } catch (error) {
            console.error(error);
            ctx.reply('❌ Ошибка при скачивании. Возможно, этот сайт пока не поддерживается или защищен.');
        }
    } else {
        ctx.reply('🤖 Я понимаю только ссылки на видео. Отправь мне ссылку!');
    }
});

// Запуск бота
bot.launch().then(() => console.log('🚀 Бот успешно запущен!'));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
