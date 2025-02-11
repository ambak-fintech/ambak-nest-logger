// src/utils/console-override.ts

import { BaseLoggerService } from '../logger/base-logger.service';

interface OriginalConsole {
    log: typeof console.log;
    warn: typeof console.warn;
    error: typeof console.error;
    info: typeof console.info;
    debug: typeof console.debug;
}

// Store original console methods
const originalConsole: OriginalConsole = {
    log: console.log,
    warn: console.warn,
    error: console.error,
    info: console.info,
    debug: console.debug
};

/**
 * Format multiple arguments into a single message
 * Handles cases like: console.log('User:', user, 'Action:', action)
 */
const formatArgs = (...args: any[]): string => {
    return args.map(arg => {
        if (arg === undefined) return 'undefined';
        if (arg === null) return 'null';
        
        if (typeof arg === 'object') {
            try {
                // Handle Error objects specially
                if (arg instanceof Error) {
                    return `${arg.name}: ${arg.message}\n${arg.stack || ''}`;
                }
                return JSON.stringify(arg, null, 2);
            } catch (e) {
                return '[Complex Object]';
            }
        }
        return String(arg);
    }).join(' ');
};

/**
 * Create console override handlers
 */
const createConsoleHandlers = (logger: BaseLoggerService) => ({
    log: (...args: any[]) => {
        logger.info(formatArgs(...args));
    },
    
    info: (...args: any[]) => {
        logger.info(formatArgs(...args));
    },
    
    warn: (...args: any[]) => {
        logger.warn(formatArgs(...args));
    },
    
    error: (...args: any[]) => {
        // Special handling for Error objects
        if (args.length === 1 && args[0] instanceof Error) {
            const { message, name, stack, ...rest } = args[0] as Error & Record<string, any>;
            logger.error({
                message,
                name,
                stack,
                ...rest
            });
            return;
        }
        logger.error(formatArgs(...args));
    },
    
    debug: (...args: any[]) => {
        logger.debug(formatArgs(...args));
    }
});

/**
 * Console override configuration
 */
interface ConsoleOverrideConfig {
    preserveOriginal?: boolean; // If true, also calls original console methods
}

/**
 * Override console methods with logger
 */
export const enableConsoleOverride = (
    logger: BaseLoggerService,
    config: ConsoleOverrideConfig = {}
): void => {
    const handlers = createConsoleHandlers(logger);

    // Override each console method
    Object.entries(handlers).forEach(([method, handler]) => {
        (console as any)[method] = config.preserveOriginal
            ? (...args: any[]) => {
                handler(...args);
                (originalConsole as any)[method](...args);
            }
            : handler;
    });
};

/**
 * Restore original console methods
 */
export const disableConsoleOverride = (): void => {
    Object.entries(originalConsole).forEach(([method, fn]) => {
        (console as any)[method] = fn;
    });
};

/**
 * Create a scoped console override
 * Useful for temporarily overriding console within a specific scope
 */
export class ScopedConsoleOverride {
    private isEnabled = false;

    constructor(
        private readonly logger: BaseLoggerService,
        private readonly config: ConsoleOverrideConfig = {}
    ) {}

    enable(): void {
        if (!this.isEnabled) {
            enableConsoleOverride(this.logger, this.config);
            this.isEnabled = true;
        }
    }

    disable(): void {
        if (this.isEnabled) {
            disableConsoleOverride();
            this.isEnabled = false;
        }
    }

    // Helper method to use with try/finally
    execute<T>(fn: () => T): T {
        this.enable();
        try {
            return fn();
        } finally {
            this.disable();
        }
    }

    // Helper method to use as decorator
    static withConsoleOverride(
        logger: BaseLoggerService,
        config: ConsoleOverrideConfig = {}
    ) {
        return function (
            target: any,
            propertyKey: string,
            descriptor: PropertyDescriptor
        ) {
            const originalMethod = descriptor.value;
            const override = new ScopedConsoleOverride(logger, config);

            descriptor.value = function (...args: any[]) {
                return override.execute(() => originalMethod.apply(this, args));
            };

            return descriptor;
        };
    }
}