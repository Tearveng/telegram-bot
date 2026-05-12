// src/infrastructure/persistence/InMemoryUserRepo.ts
import { UserRepository } from '../../application/interfaces/UserRepository';
import { User } from '../../domain/entities/User';

export class InMemoryUserRepo implements UserRepository {
  private readonly users = new Map<string, User>();

  async findByTelegramId(id: string): Promise<User | null> {
    return this.users.get(id) || null;
  }

  async create(user: User): Promise<void> {
    this.users.set(user.telegramId.toString(), user);
  }
}
