import { 
    Injectable, 
    NestInterceptor, 
    ExecutionContext, 
    CallHandler,
    Inject
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AsyncLocalStorage } from 'async_hooks';
import { Request, Response } from 'express';
import { BaseLoggerService } from '../logger/base-logger.service';
import { RequestContext } from '../context/request-context';
import { LOGGER_CONSTANTS, shouldExcludePath } from '../config/constants';
import { LoggerConfig } from '../interfaces';
import { serializers } from '../utils/serializers';
import { formatJsonLog } from '../utils/formatters';

class RequestMetrics {
    constructor(private readonly startTime: [number, number]) {}

    getResponseTime(): number {
        const diff = process.hrtime(this.startTime);
        return parseFloat((diff[0] * 1e3 + diff[1] * 1e-6).toFixed(2));
    }

    getLatencyObject(responseTime: number) {
        return {
            seconds: Math.floor(responseTime / 1000),
            nanos: (responseTime % 1000) * 1e6
        };
    }
}

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
    constructor(
        @Inject(LOGGER_CONSTANTS.MODULE_OPTIONS_TOKEN)
        private readonly config: LoggerConfig,
        @Inject(LOGGER_CONSTANTS.ASYNC_STORAGE_TOKEN)
        private readonly asyncStorage: AsyncLocalStorage<RequestContext>,
        private readonly logger: BaseLoggerService
    ) {}

    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
        const httpContext = context.switchToHttp();
        const req = httpContext.getRequest<Request>();
        const res = httpContext.getResponse<Response>();

        // Skip logging for excluded paths
        if (shouldExcludePath(req.path)) {
            return next.handle();
        }

        const requestContext = RequestContext.create(req);
        const metrics = new RequestMetrics(process.hrtime());

        // Log initial request
        this.logRequest(req, requestContext);

        // Set trace headers
        this.setTraceHeaders(res, requestContext);

        return this.asyncStorage.run(requestContext, () => 
            next.handle().pipe(
                tap({
                    next: (data: any) => {
                        // Log successful response
                        this.logResponse(req, res, data, metrics, requestContext);
                    },
                    error: (error: Error) => {
                        // Log error response
                        this.logErrorResponse(req, res, error, metrics, requestContext);
                    }
                })
            )
        );
    }

    private createBaseLogData(context: RequestContext) {
        return {
            requestId: context.requestId,
            traceId: context.traceId,
            spanId: context.spanId,
            service: this.config.SERVICE_NAME
        };
    }

    private createHttpRequestObject(
        req: Request, 
        res?: Response, 
        responseTime?: number
    ) {
        const requestObject: Record<string, any> = {
            requestMethod: req.method,
            requestUrl: req.originalUrl || req.url,
            protocol: req.protocol,
            remoteIp: req.ip || req.socket?.remoteAddress,
            requestSize: req.headers['content-length'],
            userAgent: req.headers['user-agent'],
            referer: req.headers.referer || req.headers.referrer
        };

        if (req.body) {
            requestObject.requestBody = serializers.req(req).request_payload;
        }

        if (res) {
            requestObject.status = res.statusCode;
            requestObject.responseSize = res.getHeader('content-length');
            
            if (responseTime) {
                requestObject.latency = new RequestMetrics(process.hrtime())
                    .getLatencyObject(responseTime);
            }
        }

        return requestObject;
    }

    private logRequest(req: Request, context: RequestContext): void {
        const baseLogData = this.createBaseLogData(context);
        const serializedReq = serializers.req(req);

        const requestLog = formatJsonLog({
            ...baseLogData,
            type: 'request',
            ...serializedReq,
            target_service: req.path.split('/')[1] || 'unknown',
            httpRequest: this.createHttpRequestObject(req)
        });

        this.logger.info(requestLog);
    }

    private logResponse(
        req: Request,
        res: Response,
        data: any,
        metrics: RequestMetrics,
        context: RequestContext
    ): void {
        const responseTime = metrics.getResponseTime();
        const baseLogData = this.createBaseLogData(context);

        const responseLog = formatJsonLog({
            ...baseLogData,
            type: 'response',
            response: {
                statusCode: res.statusCode,
                response_time_ms: responseTime,
                body: data
            },
            httpRequest: this.createHttpRequestObject(req, res, responseTime)
        });

        this.logger.info(responseLog);
    }

    private logErrorResponse(
        req: Request,
        res: Response,
        error: Error,
        metrics: RequestMetrics,
        context: RequestContext
    ): void {
        const responseTime = metrics.getResponseTime();
        const baseLogData = this.createBaseLogData(context);

        const errorLog = formatJsonLog({
            ...baseLogData,
            type: 'error',
            error: serializers.err(error),
            response: {
                statusCode: res.statusCode,
                response_time_ms: responseTime
            },
            httpRequest: this.createHttpRequestObject(req, res, responseTime)
        });

        this.logger.error(errorLog);
    }

    private setTraceHeaders(res: Response, context: RequestContext): void {
        const headers = context.addTraceHeaders();
        Object.entries(headers).forEach(([key, value]) => {
            if (value) {
                res.setHeader(key, value);
            }
        });
    }
}