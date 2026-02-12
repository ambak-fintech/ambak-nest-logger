// src/logger/base-logger.service.ts

import { Inject, Injectable } from '@nestjs/common';
import pino, { Logger as PinoLogger } from 'pino';
import { AsyncLocalStorage } from 'async_hooks';
import { LOGGER_CONSTANTS } from '../config/constants';
import { LoggerConfig } from '../interfaces';
import { formatters } from '../utils/formatters';
import { serializers } from '../utils/serializers';
import { RequestContext } from '../context';

interface LoggerLike {
  trace: (msg: any) => void;
  debug: (msg: any) => void;
  info: (msg: any) => void;
  warn: (msg: any) => void;
  error: (msg: any) => void;
  fatal: (msg: any) => void;
  child: (bindings: Record<string, any>) => LoggerLike;
}

@Injectable()
export class BaseLoggerService {
  private logger: PinoLogger | LoggerLike;

  constructor(
    @Inject(LOGGER_CONSTANTS.MODULE_OPTIONS_TOKEN)
    private readonly config: LoggerConfig,
    @Inject(LOGGER_CONSTANTS.ASYNC_STORAGE_TOKEN)
    private readonly asyncStorage: AsyncLocalStorage<RequestContext>
  ) {
    this.logger = this.createLogger();
  }

  private createLogger(): PinoLogger | LoggerLike {
    const logRegister = this.resolveLogRegisterValue(
      this.config.LOG_REGISTER ?? process.env.LOG_REGISTER ?? '5',
    );

    // LOG_REGISTER=1 -> raw/basic node logs (no JSON formatting)
    if (logRegister === 1) {
      return this.createRawLogger();
    }

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

    // Check LOG_TYPE - for AWS, don't use Pino's timestamp (we add our own 'timestamp' field)
    const logType = this.config.LOG_TYPE || 'gcp';
    const timestamp = logType === 'aws' ? false : pino.stdTimeFunctions.isoTime;
    const configuredLevel = this.resolveLogLevel(this.config.LOG_LEVEL);
    const effectiveLevel = this.resolveLogRegisterToLevel(
      logRegister,
      configuredLevel,
    );

    return pino({
      level: effectiveLevel,
      messageKey: 'message',
      timestamp,
      formatters,
      serializers,
      transport,
      base: {
        projectId: this.config.PROJECT_ID,
        loggerName: this.config.LOGGER_NAME || this.config.SERVICE_NAME
      }
    });
  }

  private createRawLogger(): LoggerLike {
    const toRawMessage = (payload: any): string => {
      if (typeof payload === 'string') return payload;
      try {
        return JSON.stringify(payload);
      } catch (_e) {
        return String(payload);
      }
    };

    const rawLogger: LoggerLike = {
      trace: (msg: any) => console.debug(toRawMessage(msg)),
      debug: (msg: any) => console.debug(toRawMessage(msg)),
      info: (msg: any) => console.log(toRawMessage(msg)),
      warn: (msg: any) => console.warn(toRawMessage(msg)),
      error: (msg: any) => console.error(toRawMessage(msg)),
      fatal: (msg: any) => console.error(toRawMessage(msg)),
      child: (_bindings: Record<string, any>) => rawLogger,
    };

    return rawLogger;
  }

  private resolveLogLevel(level: LoggerConfig['LOG_LEVEL']): string {
    const normalized = level !== undefined && level !== null
      ? String(level).trim().toLowerCase()
      : '';

    if (!normalized) {
      return 'info';
    }

    return normalized;
  }

  private resolveLogRegisterValue(register: LoggerConfig['LOG_REGISTER']): number {
    const normalized = register !== undefined && register !== null
      ? String(register).trim().toLowerCase()
      : '';

    if (!normalized) {
      return 5;
    }

    const numericLevel = Number(normalized);
    if (!Number.isNaN(numericLevel) && numericLevel >= 0 && numericLevel <= 5) {
      return numericLevel;
    }

    return 5;
  }

  // LOG_REGISTER behavior:
  // 0 => silent, 1 => raw mode (handled in createLogger), 2..5 => structured logger with fallbackLevel.
  private resolveLogRegisterToLevel(logRegister: number, fallbackLevel: string): string {
    if (logRegister === 0) return 'silent';
    return fallbackLevel;
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