// examples/src/users/users.service.ts

import { Injectable } from '@nestjs/common';
import { InjectLogger, BaseLoggerService, LogMethod } from '@ambak/nest-logger';
import { CreateUserDto, UpdateUserDto } from './user.dto';

@Injectable()
export class UsersService {
  @InjectLogger({ context: 'UsersService' })
  private readonly logger!: BaseLoggerService;

  private users: any[] = [];

  @LogMethod({ includeArgs: true })
  async createUser(createUserDto: CreateUserDto) {
    const user = {
      id: this.users.length + 1,
      ...createUserDto
    };
    this.users.push(user);

    // Regular console.log will be redirected to structured logging
    console.log('User created:', user.name);

    return user;
  }

  async findAll() {
    this.logger.info('Fetching all users', { count: this.users.length });
    return this.users;
  }

  @LogMethod()
  async findOne(id: number) {
    const user = this.users.find(u => u.id === id);
    if (!user) {
      this.logger.warn('User not found', { userId: id });
      return null;
    }
    return user;
  }

  async update(id: number, updateUserDto: UpdateUserDto) {
    const user = await this.findOne(id);
    if (!user) {
      throw new Error('User not found');
    }

    Object.assign(user, updateUserDto);
    this.logger.info('User updated', { userId: id, updates: updateUserDto });
    
    return user;
  }
}