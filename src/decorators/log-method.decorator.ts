import { BaseLoggerService } from '../logger/base-logger.service';
import { LogContextOptions } from './log-context.decorator';

export function LogMethod(options: LogContextOptions = {}) {
    return function (
        target: any,
        propertyKey: string,
        descriptor: PropertyDescriptor
    ) {
        const originalMethod = descriptor.value;
        const methodName = propertyKey;

        descriptor.value = async function (...args: any[]) {
            const logger: BaseLoggerService = (this as any).logger;
            if (!logger) {
                throw new Error('Logger is not injected. Use @InjectLogger() decorator.');
            }

            const context = options.name || `${target.constructor.name}.${methodName}`;
            const startTime = process.hrtime();

            try {
                logger.debug({
                    message: `Executing ${context}`,
                    ...(options.includeArgs && { arguments: args })
                });

                const result = await originalMethod.apply(this, args);

                const [seconds, nanoseconds] = process.hrtime(startTime);
                const duration = seconds * 1000 + nanoseconds / 1e6;

                logger.debug({
                    message: `Completed ${context}`,
                    duration_ms: duration.toFixed(2),
                    ...(options.includeResult && { result })
                });

                return result;
            } catch (error) {
                const [seconds, nanoseconds] = process.hrtime(startTime);
                const duration = seconds * 1000 + nanoseconds / 1e6;

                logger.error({
                    message: `Error in ${context}`,
                    error,
                    duration_ms: duration.toFixed(2),
                    ...(options.includeArgs && { arguments: args })
                });

                throw error;
            }
        };

        return descriptor;
    };
}