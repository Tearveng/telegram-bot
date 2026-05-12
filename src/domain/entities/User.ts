// src/domain/entities/User.ts
import { TelegramId } from '../valueObjects/TelegramId';

export interface IUserProps {
  telegramId: TelegramId;
  firstName?: string;
  lastName?: string;
  username?: string;
}

export class User {
  private props: IUserProps;

  constructor(props: IUserProps) {
    this.props = props;
  }

  get telegramId(): TelegramId {
    return this.props.telegramId;
  }

  get fullName(): string {
    const { firstName = '', lastName = '' } = this.props;
    return `${firstName} ${lastName}`.trim();
  }

  get username(): string | undefined {
    return this.props.username;
  }
}
