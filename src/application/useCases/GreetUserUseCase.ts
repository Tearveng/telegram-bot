// src/application/useCases/GreetUserUseCase.ts
import { UserRepository } from '../interfaces/UserRepository';
import { User } from '../../domain/entities/User';
import { BotResponse } from '../interfaces/BotResponse';
import { TelegramId } from '../../domain/valueObjects/TelegramId';

export class GreetUserUseCase {
  constructor(private readonly userRepo: UserRepository) {}

  async execute(userId: string): Promise<BotResponse> {
    let user = await this.userRepo.findByTelegramId(userId);
    console.log("user", user)
    if (!user) {
      // If user does not exist, create a minimal entity
      user = new User({
        telegramId: new TelegramId(userId),
      });
      await this.userRepo.create(user);
    }

    const greeting = user.fullName
      ? `Hello, ${user.fullName}!`
      : `Hello! 👋`;
    return { text: greeting };
  }
}
