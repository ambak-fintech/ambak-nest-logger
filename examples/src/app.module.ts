// examples/src/app.module.ts

import { Module } from '@nestjs/common';
import { LoggerModule } from '@ambak/nest-logger';
import { UsersController } from './users/users.controller';
import { UsersService } from './users/users.service';

@Module({
  imports: [
    LoggerModule.forRoot({
      LOG_LEVEL: 'info',
      SERVICE_NAME: 'example-app',
      PROJECT_ID: 'ambak-399309',
      LOG_FORMAT: 'json' // Use 'pretty' for development, 'json' for production
    })
  ],
  controllers: [UsersController],
  providers: [UsersService],
})
export class AppModule {}