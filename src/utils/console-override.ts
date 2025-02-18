// src/utils/console-override.ts

import { BaseLoggerService } from '../logger/base-logger.service';
import { formatJsonLog } from './formatters';
import { RequestContext } from '../context/request-context';
import { AsyncLocalStorage } from 'async_hooks';

interface OriginalConsole {
    log: typeof console.log;
    warn: typeof console.warn;
    error: typeof console.error;
    info: typeof console.info;
    debug: typeof console.debug;
}

interface ConsoleOverrideConfig {
    preserveOriginal?: boolean;
    projectId?: string;
    service?: string;
}

const originalConsole: OriginalConsole = {
    log: console.log,
    warn: console.warn,
    error: console.error,
    info: console.info,
    debug: console.debug
};

const safeStringify = (obj: any, seen = new WeakSet()): string => {
    // Handle non-object types
    if (obj === null || typeof obj !== 'object') {
        return String(obj);
    }

    // Handle Date objects
    if (obj instanceof Date) {
        return obj.toISOString();
    }

    // Handle Error objects
    if (obj instanceof Error) {
        const { name, message, stack, ...rest } = obj;
        return JSON.stringify({
            error: {
                name,
                message,
                stack,
                ...rest
            }
        });
    }

    // Check for circular references
    if (seen.has(obj)) {
        return '[Circular Reference]';
    }

    // Add object to WeakSet of seen objects
    seen.add(obj);

    // Handle arrays
    if (Array.isArray(obj)) {
        const arr = obj.map(item => {
            try {
                return safeStringify(item, seen);
            } catch (e) {
                return '[Complex Value]';
            }
        });
        return `[${arr.join(', ')}]`;
    }

    // Handle objects
    try {
        const entries = Object.entries(obj)
            .filter(([_, value]) => value !== undefined) // Filter out undefined values
            .map(([key, value]) => {
                try {
                    // Skip internal Node.js properties that often cause circular refs
                    if (key === 'socket' || key === '_httpMessage' || key === 'connection') {
                        return `"${key}": "[Socket]"`;
                    }
                    return `"${key}": ${safeStringify(value, seen)}`;
                } catch (e) {
                    return `"${key}": "[Complex Value]"`;
                }
            });
        return `{${entries.join(', ')}}`;
    } catch (e) {
        return '[Complex Object]';
    }
};

const formatArgs = (
    asyncLocalStorage: AsyncLocalStorage<RequestContext>,
    config: ConsoleOverrideConfig,
    ...args: any[]
): any => {
    const message = args.map(arg => {
        try {
            return safeStringify(arg);
        } catch (e) {
            return '[Unserializable Object]';
        }
    }).join(' ');

    const context = asyncLocalStorage.getStore();

    const logData = {
        message,
        logSource: 'console',
        requestId: context?.requestId,
        traceId: context?.traceId,
        spanId: context?.spanId,
        timestamp: new Date().toISOString(),
        log_override: true,
        projectId: config.projectId,
        service: config.service
    };

    return formatJsonLog(logData);
};

const createConsoleHandlers = (
    logger: BaseLoggerService,
    asyncLocalStorage: AsyncLocalStorage<RequestContext>,
    config: ConsoleOverrideConfig = {}
) => ({
    log: (...args: any[]) => {
        const formattedLog = formatArgs(asyncLocalStorage, config, ...args);
        logger.info(formattedLog);
    },
    
    info: (...args: any[]) => {
        const formattedLog = formatArgs(asyncLocalStorage, config, ...args);
        logger.info(formattedLog);
    },
    
    warn: (...args: any[]) => {
        const formattedLog = formatArgs(asyncLocalStorage, config, ...args);
        logger.warn(formattedLog);
    },
    
    error: (...args: any[]) => {
        const formattedLog = formatArgs(asyncLocalStorage, config, ...args);
        if (args.length === 1 && args[0] instanceof Error) {
            const err = args[0];
            Object.assign(formattedLog, {
                error: {
                    name: err.name,
                    message: err.message,
                    stack: err.stack
                }
            });
        }
        logger.error(formattedLog);
    },
    
    debug: (...args: any[]) => {
        const formattedLog = formatArgs(asyncLocalStorage, config, ...args);
        logger.debug(formattedLog);
    }
});

export const enableConsoleOverride = (
    logger: BaseLoggerService,
    asyncLocalStorage: AsyncLocalStorage<RequestContext>,
    config: ConsoleOverrideConfig = {}
): void => {
    const handlers = createConsoleHandlers(logger, asyncLocalStorage, config);

    Object.entries(handlers).forEach(([method, handler]) => {
        (console as any)[method] = config.preserveOriginal
            ? (...args: any[]) => {
                handler(...args);
                (originalConsole as any)[method](...args);
            }
            : handler;
    });
};

export const disableConsoleOverride = (): void => {
    Object.entries(originalConsole).forEach(([method, fn]) => {
        (console as any)[method] = fn;
    });
};