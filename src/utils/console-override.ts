// src/utils/console-override.ts

import { BaseLoggerService } from '../logger/base-logger.service';
import { formatJsonLog } from './formatters';
import { RequestContext } from '../context/request-context';
import { AsyncLocalStorage } from 'async_hooks';
import { stringify } from 'safe-stable-stringify';  
import { serializers } from './serializers';

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
    logType?: 'gcp' | 'aws';
}

const originalConsole: OriginalConsole = {
    log: console.log,
    warn: console.warn,
    error: console.error,
    info: console.info,
    debug: console.debug
};

const safeStringify = (obj: any) => {
    if (obj === null || obj === undefined) return String(obj);
    if (typeof obj !== 'object') return String(obj);
    
    // Route known complex objects through your existing serializers
    if (obj instanceof Error) return stringify(serializers.err(obj));
    
    // Detect req/res objects (IncomingMessage, ServerResponse)
    if (obj.method && obj.headers && (obj.url || obj.originalUrl)) {
        return stringify(serializers.req(obj));
    }
    if (obj.statusCode !== undefined && typeof obj.getHeaders === 'function') {
        return stringify(serializers.res(obj));
    }
    
    // safe-stable-stringify handles circular refs, throwing getters,
    // BigInt, etc. — all the cases your manual code misses
    return stringify(obj);
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
    const logType = (config.logType || process.env.LOG_TYPE || 'gcp').toLowerCase();

    const logData = {
        message,
        logSource: 'console',
        requestId: context?.requestId,
        traceId: context?.traceId,
        spanId: context?.spanId,
        timestamp: new Date().toISOString(),
        log_override: true,
        projectId: config.projectId,
        service: config.service,
        LOG_TYPE: logType === 'aws' ? 'aws' : 'gcp'
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