// src/logger.module.ts

import { DynamicModule, Global, Module, Provider } from '@nestjs/common';
import { LOGGER_CONSTANTS } from './config/constants';
import { LoggerConfig } from './interfaces/logger-config.interface';
import { BaseLoggerService } from './logger/base-logger.service';
import { LoggingInterceptor } from './interceptors/logging.interceptor';
import { HttpExceptionFilter } from './filters/http-exception.filter';
import { AsyncLocalStorage } from 'async_hooks';
import { APP_INTERCEPTOR, APP_FILTER } from '@nestjs/core';
import { ConsoleOverrideService } from './services/console-override.service';

@Global()
@Module({})
export class LoggerModule {
  static forRoot(config: LoggerConfig): DynamicModule {
    const logRegister = Number(config.LOG_REGISTER ?? process.env.LOG_REGISTER ?? 5);
    const isBasicMode = !Number.isNaN(logRegister) && logRegister === 1;
    const isSilentMode = !Number.isNaN(logRegister) && logRegister === 0;
    const shouldAttachNestLogging = !(isBasicMode || isSilentMode);

    const providers: Provider[] = [
      {
        provide: LOGGER_CONSTANTS.MODULE_OPTIONS_TOKEN,
        useValue: config
      },
      {
        provide: LOGGER_CONSTANTS.ASYNC_STORAGE_TOKEN,
        useValue: new AsyncLocalStorage()
      },
      {
        provide: LOGGER_CONSTANTS.LOGGER_TOKEN, // Ensures LOGGER_TOKEN is bound to the logger service
        useClass: BaseLoggerService
      },
      BaseLoggerService, // Explicitly add BaseLoggerService
      ...(shouldAttachNestLogging
        ? [
            ConsoleOverrideService,
            {
              provide: APP_INTERCEPTOR,
              useClass: LoggingInterceptor
            },
            {
              provide: APP_FILTER,
              useClass: HttpExceptionFilter
            }
          ]
        : [])
    ];

    return {
      module: LoggerModule,
      providers,
      exports: [
        BaseLoggerService, // Ensure BaseLoggerService is exported properly
        LOGGER_CONSTANTS.LOGGER_TOKEN,
        LOGGER_CONSTANTS.ASYNC_STORAGE_TOKEN
      ]
    };
  }

  static forFeature(config: Partial<LoggerConfig>): DynamicModule {
    const providers: Provider[] = [
      {
        provide: LOGGER_CONSTANTS.MODULE_OPTIONS_TOKEN,
        useValue: config
      },
      {
        provide: LOGGER_CONSTANTS.LOGGER_TOKEN,
        useClass: BaseLoggerService
      },
      BaseLoggerService // Explicitly add BaseLoggerService
    ];

    return {
      module: LoggerModule,
      providers,
      exports: [
        BaseLoggerService, // Ensure BaseLoggerService is exported
        LOGGER_CONSTANTS.LOGGER_TOKEN
      ]
    };
  }
}
