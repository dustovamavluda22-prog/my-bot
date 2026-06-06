const { Telegraf, Markup } = require('telegraf');

// Railway сам подтянет TOKEN из переменных, которые мы настроили
const bot = new Telegraf(process.env.TOKEN);

// 1. Обработка команды /start — ТОЛЬКО КРАСИВЫЙ ТЕКСТ И КНОПКИ
bot.start((ctx) => {
    const welcomeText = 
        `👋 *Привет, друг\\!* \n\n` +
        `🤖 Рад видеть тебя в нашем ультимативном боте для скачивания\\! \n\n` +
        `📥 *Что я умею:* \n` +
        `Просто отправь мне ссылку на видео из *TikTok*, *YouTube* или *Instagram Reels*, и я помогу тебе скачать его в нужном качестве или вытащить оттуда музыку\\! \n\n` +
        `👇 Выбирай нужный раздел на кнопках ниже или просто кидай ссылку\\!`;

    ctx.replyWithMarkdownV2(welcomeText, 
        Markup.keyboard([
            ['🎵 Скачать Музыку', '🔥 Топ Скачиваний'],
            ['ℹ️ Инструкция']
        ]).resize()
    );
});

// 2. Логика, когда пользователь присылает ссылку на видео
bot.on('text', async (ctx) => {
    const text = ctx.message.text;

    // Проверяем, ссылка ли это
    if (text.includes('http://') || text.includes('https://')) {
        // Создаем инлайн-кнопки под сообщением для выбора качества
        const qualityKeyboard = Markup.inlineKeyboard([
            [
                Markup.button.callback('🎬 360p', 'download_360'),
                Markup.button.callback('🎬 720p HD', 'download_720')
            ],
            [
                Markup.button.callback('🚀 1080p Full HD', 'download_1080'),
                Markup.button.callback('🎵 Только MP3', 'download_audio')
            ]
        ]);

        await ctx.reply('🔍 Ссылка принята! В каком качестве качаем?', qualityKeyboard);
    } else {
        // Реакция на обычные кнопки меню под клавишами
        if (text === '🎵 Скачать Музыку') {
            return ctx.reply('🎵 Чтобы скачать только аудио, просто отправь мне ссылку на видео, а затем нажми кнопку "Только MP3" под ним!');
        }
        if (text === '🔥 Топ Скачиваний') {
            return ctx.reply('📊 Сегодня чаще всего качают тренды из TikTok и Shorts! Будь на волне 🚀');
        }
        if (text === 'ℹ️ Инструкция') {
            return ctx.reply('📖 Всё проще некуда:\n1. Копируешь ссылку из TikTok/YouTube/Instagram.\n2. Отправляешь её мне в чат.\n3. Выбираешь качество на кнопке под видео.\n4. Забираешь готовый файл!');
        }

        // Если прислал не ссылку и не кнопку
        ctx.reply('🤖 Я понимаю только ссылки на видео или кнопки меню! Отправь мне ссылку!');
    }
});

// 3. Обработка нажатий на кнопки качества (InlineButtons)
bot.action('download_360', (ctx) => ctx.answerCbQuery('Запускаю скачивание в 360p... ⏳'));
bot.action('download_720', (ctx) => ctx.answerCbQuery('Запускаю скачивание в 720p HD... ⏳'));
bot.action('download_1080', (ctx) => ctx.answerCbQuery('Запускаю скачивание в 1080p Full HD... ⏳'));
bot.action('download_audio', (ctx) => ctx.answerCbQuery('Извлекаю аудиодорожку в MP3... ⏳'));

// Запуск бота
bot.launch().then(() => {
    console.log('Бот успешно запущен на Railway!');
});

// Плавная остановка
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

