// src/domain/valueObjects/TelegramId.ts
export class TelegramId {
  private readonly _value: string;

  constructor(value: string) {
    if (!/^\d+$/.test(value)) {
      throw new Error('TelegramId must be numeric string');
    }
    this._value = value;
  }

  toString() {
    return this._value;
  }
}
