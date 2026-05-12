"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.helpHandler = void 0;
const telegraf_1 = require("telegraf");
const bot_1 = require("../../infrastructure/telegram/bot");
const helpHandler = async (ctx) => {
    const response = {
        text: 'Choose an option:',
        options: [telegraf_1.Markup.keyboard([['/start', '/help']]).resize()],
    };
    await (0, bot_1.sendResponse)(ctx, response);
};
exports.helpHandler = helpHandler;
//# sourceMappingURL=helpHandler.js.map