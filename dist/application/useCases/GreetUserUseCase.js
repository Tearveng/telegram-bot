"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GreetUserUseCase = void 0;
const User_1 = require("../../domain/entities/User");
const TelegramId_1 = require("../../domain/valueObjects/TelegramId");
class GreetUserUseCase {
    userRepo;
    constructor(userRepo) {
        this.userRepo = userRepo;
    }
    async execute(userId) {
        let user = await this.userRepo.findByTelegramId(userId);
        console.log("user", user);
        if (!user) {
            // If user does not exist, create a minimal entity
            user = new User_1.User({
                telegramId: new TelegramId_1.TelegramId(userId),
            });
            await this.userRepo.create(user);
        }
        const greeting = user.fullName
            ? `Hello, ${user.fullName}!`
            : `Hello! 👋`;
        return { text: greeting };
    }
}
exports.GreetUserUseCase = GreetUserUseCase;
//# sourceMappingURL=GreetUserUseCase.js.map