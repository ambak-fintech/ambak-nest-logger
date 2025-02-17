// src/services/console-override.service.ts

import { Injectable, OnModuleInit, Inject } from '@nestjs/common';
import { BaseLoggerService } from '../logger/base-logger.service';
import { enableConsoleOverride } from '../utils/console-override';
import { LOGGER_CONSTANTS } from '../config/constants';
import { AsyncLocalStorage } from 'async_hooks';
import { RequestContext } from '../context/request-context';
import { LoggerConfig } from '../interfaces/logger-config.interface';

@Injectable()
export class ConsoleOverrideService implements OnModuleInit {
  constructor(
    private readonly logger: BaseLoggerService,
    @Inject(LOGGER_CONSTANTS.ASYNC_STORAGE_TOKEN)
    private readonly asyncLocalStorage: AsyncLocalStorage<RequestContext>,
    @Inject(LOGGER_CONSTANTS.MODULE_OPTIONS_TOKEN)
    private readonly config: LoggerConfig
  ) {}

  onModuleInit() {
    enableConsoleOverride(this.logger, this.asyncLocalStorage, {
      preserveOriginal: false,
      projectId: this.config.PROJECT_ID,
      service: this.config.SERVICE_NAME,
    });
  }
}