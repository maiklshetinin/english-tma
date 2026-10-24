import { Telegraf, Markup } from 'telegraf';

const BOT_TOKEN = process.env.BOT_TOKEN;
const WEB_APP_URL = "https://maiklshetinin.github.io/english-tma/";

const bot = new Telegraf(BOT_TOKEN);

bot.start((ctx) => {
  return ctx.reply(
    "👋 **Добро пожаловать в личный кабинет!**\n\nНажмите на кнопку ниже, чтобы открыть учебный кабинет:",
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.webApp("Open 🚀", WEB_APP_URL)]
      ])
    }
  );
});

bot.launch();
console.log('Бот успешно запущен на Node.js!');

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));