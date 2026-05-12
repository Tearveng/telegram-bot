"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InMemoryUserRepo = void 0;
class InMemoryUserRepo {
    users = new Map();
    async findByTelegramId(id) {
        return this.users.get(id) || null;
    }
    async create(user) {
        this.users.set(user.telegramId.toString(), user);
    }
}
exports.InMemoryUserRepo = InMemoryUserRepo;
//# sourceMappingURL=InMemoryUserRepo.js.map