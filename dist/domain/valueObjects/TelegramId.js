"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TelegramId = void 0;
// src/domain/valueObjects/TelegramId.ts
class TelegramId {
    _value;
    constructor(value) {
        if (!/^\d+$/.test(value)) {
            throw new Error('TelegramId must be numeric string');
        }
        this._value = value;
    }
    toString() {
        return this._value;
    }
}
exports.TelegramId = TelegramId;
//# sourceMappingURL=TelegramId.js.map