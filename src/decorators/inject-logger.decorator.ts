// src/decorators/inject-logger.decorator.ts

import { Inject } from '@nestjs/common';
import type { BaseLoggerService } from '../logger/base-logger.service';
import { LOGGER_CONSTANTS } from '../config/constants';  // Import the shared constants

export interface LoggerMetadata {
    context?: string;
    labels?: Record<string, string>;
}

export function InjectLogger(metadata?: LoggerMetadata): PropertyDecorator {
    return (target: any, propertyKey: string | symbol) => {
        const loggerProperty = propertyKey;
        
        // Use the class name as default context
        const context = metadata?.context || target.constructor.name;
        
        // Create a getter that returns a child logger with context
        Object.defineProperty(target, loggerProperty, {
            get(): BaseLoggerService {
                const logger: BaseLoggerService = (this as any)[LOGGER_CONSTANTS.LOGGER_TOKEN];  // Use shared token
                if (!logger) {
                    throw new Error('Logger is not injected. Make sure LoggerModule is imported.');
                }
                return logger.child({ context, ...metadata?.labels });
            },
            enumerable: true,
            configurable: true
        });

        // Inject the base logger using the shared token
        Inject(LOGGER_CONSTANTS.LOGGER_TOKEN)(target, LOGGER_CONSTANTS.LOGGER_TOKEN);
    };
}
