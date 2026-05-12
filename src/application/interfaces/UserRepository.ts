// src/application/interfaces/UserRepository.ts
import { User } from '../../domain/entities/User';

export interface UserRepository {
  findByTelegramId(id: string): Promise<User | null>;
  create(user: User): Promise<void>;
}
