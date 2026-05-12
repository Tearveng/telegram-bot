// src/presentation/handlers/helpHandler.ts
import { Context } from 'telegraf';
import { Markup } from 'telegraf';
import { sendResponse } from '../../infrastructure/telegram/bot';

export const helpHandler = async (ctx: Context) => {
  const response = {
    text: 'Choose an option:',
    options: [Markup.keyboard([['/start', '/help']]).resize()],
  };
  await sendResponse(ctx, response);
};
