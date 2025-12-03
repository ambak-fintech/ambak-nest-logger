// src/logger/base-logger.service.ts

import { Inject, Injectable } from '@nestjs/common';
import pino, { Logger as PinoLogger } from 'pino';
import { AsyncLocalStorage } from 'async_hooks';
import { LOGGER_CONSTANTS } from '../config/constants';
import { LoggerConfig } from '../interfaces';
import { formatters, setGlobalLogType } from '../utils/formatters';
import { serializers } from '../utils/serializers';
import { RequestContext } from '../context';

@Injectable()
export class BaseLoggerService {
  private logger: PinoLogger;

  constructor(
    @Inject(LOGGER_CONSTANTS.MODULE_OPTIONS_TOKEN)
    private readonly config: LoggerConfig,
    @Inject(LOGGER_CONSTANTS.ASYNC_STORAGE_TOKEN)
    private readonly asyncStorage: AsyncLocalStorage<RequestContext>
  ) {
    // Set global log type from config so formatters can access it
    if (this.config.LOG_TYPE) {
      setGlobalLogType(this.config.LOG_TYPE);
    }
    this.logger = this.createLogger();
  }

  private createLogger(): PinoLogger {
    const transport = {
      target: this.config.LOG_FORMAT === 'pretty' ? 'pino-pretty' : 'pino/file',
      options: this.config.LOG_FORMAT === 'pretty' ? {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
        messageFormat: '[{time}] [{requestId}] [{type}] {msg}',
        levelFirst: true,
        sync: false
      } : {
        destination: 1,
        sync: false,
        mkdir: true
      }
    };

    return pino({
      level: this.config.LOG_LEVEL || 'info',
      messageKey: 'message',
      timestamp: pino.stdTimeFunctions.isoTime,
      formatters,
      serializers,
      transport,
      base: {
        projectId: this.config.PROJECT_ID,
        loggerName: this.config.LOGGER_NAME || this.config.SERVICE_NAME
      }
    });
  }

  private getLogMetadata() {
    const context = this.asyncStorage.getStore();
    if (!context) return {};

    return {
      requestId: context.requestId,
      traceId: context.traceId,
      spanId: context.spanId,
      service: this.config.SERVICE_NAME,
      projectId: this.config.PROJECT_ID
    };
  }

  private formatLog(message: string | object, ...args: any[]): object {
    const metadata = this.getLogMetadata();

    if (typeof message === 'string') {
      return {
        msg: message,
        ...metadata,
        ...(args[0] || {})
      };
    }

    return {
      ...message,
      ...metadata
    };
  }

  trace(message: string | object, ...args: any[]): void {
    this.logger.trace(this.formatLog(message, ...args));
  }

  debug(message: string | object, ...args: any[]): void {
    this.logger.debug(this.formatLog(message, ...args));
  }

  info(message: string | object, ...args: any[]): void {
    this.logger.info(this.formatLog(message, ...args));
  }

  warn(message: string | object, ...args: any[]): void {
    this.logger.warn(this.formatLog(message, ...args));
  }

  error(message: string | object, ...args: any[]): void {
    this.logger.error(this.formatLog(message, ...args));
  }

  fatal(message: string | object, ...args: any[]): void {
    this.logger.fatal(this.formatLog(message, ...args));
  }

  child(bindings: Record<string, any>): BaseLoggerService {
    const childLogger = new BaseLoggerService(this.config, this.asyncStorage);
    childLogger.logger = this.logger.child(bindings);
    return childLogger;
  }
}

exports: [
  BaseLoggerService,
  LOGGER_CONSTANTS.LOGGER_TOKEN,
  LOGGER_CONSTANTS.ASYNC_STORAGE_TOKEN
]