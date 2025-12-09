import { 
    Injectable, 
    NestInterceptor, 
    ExecutionContext, 
    CallHandler,
    Inject,
    HttpException
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AsyncLocalStorage } from 'async_hooks';
import { Request, Response } from 'express';
import { BaseLoggerService } from '../logger/base-logger.service';
import { RequestContext } from '../context/request-context';
import { LOGGER_CONSTANTS, shouldExcludePath, getLogLevel } from '../config/constants';
import { LoggerConfig } from '../interfaces';
import { serializers } from '../utils/serializers';
import { formatJsonLog } from '../utils/formatters';

enum ContextType {
    HTTP = 'http',
    GRAPHQL = 'graphql',
    RPC = 'rpc',
    WS = 'ws'
}

let GqlExecutionContext: any;
try {
    const { GqlExecutionContext: GqlContext } = require('@nestjs/graphql');
    GqlExecutionContext = GqlContext;
} catch {
    console.error("GraphQL is not Installed");
}

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

    private getLogType(): 'gcp' | 'aws' {
        const configured = (this.config.LOG_TYPE || process.env.LOG_TYPE || 'gcp').toLowerCase();
        return configured === 'aws' ? 'aws' : 'gcp';
    }

    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
        const metrics = new RequestMetrics(process.hrtime());
        const contextType = context.getType<string>();
    
        if (contextType === ContextType.HTTP) {
            return this.handleHttpRequest(context, next, metrics);
        } else if (contextType === ContextType.GRAPHQL) {
            return this.handleGraphQLRequest(context, next, metrics);
        }
    
        return next.handle();
    }

    private handleHttpRequest(context: ExecutionContext, next: CallHandler, metrics: RequestMetrics): Observable<any> {
        const httpContext = context.switchToHttp();
        const req = httpContext.getRequest<Request>();
        const res = httpContext.getResponse<Response>();

        if (shouldExcludePath(req.path)) {
            return next.handle();
        }

        const requestContext = RequestContext.create(req, this.getLogType());
        
        // Add trace headers to request for forwarding to downstream services
        if (requestContext.traceContext) {
            const headers = requestContext.addTraceHeaders();
            Object.entries(headers).forEach(([key, value]) => {
                if (value && key !== 'x-request-id') { // Don't override existing x-request-id
                    req.headers[key] = value;
                }
            });
        }
        
        this.logRequest(req, requestContext);
        this.setTraceHeaders(res, requestContext);

        return this.asyncStorage.run(requestContext, () => 
            next.handle().pipe(
                tap({
                    next: (data: any) => {
                        this.logResponse(req, res, data, metrics, requestContext);
                    },
                    error: (error: Error) => {
                        // Get actual status from error if available
                        const status = error instanceof HttpException ? error.getStatus() : 500;
                        // Set status on response so it's available for logging
                        res.status(status);
                        this.logErrorResponse(req, res, error, metrics, requestContext);
                    }
                })
            )
        );
    }

    private handleGraphQLRequest(context: ExecutionContext, next: CallHandler, metrics: RequestMetrics): Observable<any> {

        const gqlContext = GqlExecutionContext.create(context);
        const req = gqlContext.getContext().req;
        const info = gqlContext.getInfo();
    
        if (!req || shouldExcludePath(req.path)) {
            return next.handle();
        }

        const requestContext = RequestContext.create(req, this.getLogType());
        this.logGraphQLRequest(gqlContext, requestContext);
    
        return this.asyncStorage.run(requestContext, () => 
            next.handle().pipe(
                tap({
                    next: (data: any) => {
                        this.logGraphQLResponse(gqlContext, data, metrics, requestContext);
                    },
                    error: (error: Error) => {
                        this.logGraphQLError(gqlContext, error, metrics, requestContext);
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
            service: this.config.SERVICE_NAME,
            PROJECT_ID: this.config.PROJECT_ID,
            LOG_TYPE: this.getLogType()
        };
    }

    private createGraphQLRequestObject(gqlContext: any) {
        const info = gqlContext.getInfo();
        const context = gqlContext.getContext();
        const req = context.req;

        return {
            requestMethod: 'POST',
            requestUrl: req.originalUrl || req.url,
            protocol: req.protocol,
            remoteIp: req.ip || req.socket?.remoteAddress,
            requestSize: req.headers['content-length'],
            userAgent: req.headers['user-agent'],
            referer: req.headers.referer || req.headers.referrer,
            graphql: {
                operationType: info.operation.operation,
                operationName: info.operation.name?.value,
                fieldName: info.fieldName,
                variables: gqlContext.getArgs(),
            },
            requestBody: {
                query: req.body.query,
                variables: req.body.variables,
                operationName: req.body.operationName
            }
        };
    }

    private logGraphQLRequest(gqlContext: any, context: RequestContext): void {
        const baseLogData = this.createBaseLogData(context);
        const req = gqlContext.getContext().req;

        const requestLog = formatJsonLog({
            ...baseLogData,
            type: 'request',
            target_service: 'graphql',
            ...serializers.req(req),
            httpRequest: this.createGraphQLRequestObject(gqlContext)
        });

        this.logger.info(requestLog);
    }

    private isGraphQLContext(context: ExecutionContext): boolean {
        const contextType = context.getType<string>();
        return contextType === ContextType.GRAPHQL;
    }

    private logGraphQLResponse(
        gqlContext: any,
        data: any,
        metrics: RequestMetrics,
        context: RequestContext
    ): void {
        const responseTime = metrics.getResponseTime();
        const baseLogData = this.createBaseLogData(context);
        const req = gqlContext.getContext().req;

        const responseLog = formatJsonLog({
            ...baseLogData,
            type: 'response',
            response: {
                statusCode: 200,
                response_time_ms: responseTime,
                body: data
            },
            httpRequest: {
                ...this.createGraphQLRequestObject(gqlContext),
                status: 200,
                responseSize: JSON.stringify(data).length,
                latency: metrics.getLatencyObject(responseTime)
            }
        });

        this.logger.info(responseLog);
    }

    private logGraphQLError(
        gqlContext: any,
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
                statusCode: 500,
                response_time_ms: responseTime
            },
            httpRequest: {
                ...this.createGraphQLRequestObject(gqlContext),
                status: 500,
                latency: metrics.getLatencyObject(responseTime)
            }
        });

        this.logger.error(errorLog);
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
            target_service: req.path.split('/')[1] || 'unknown',
            ...serializedReq,
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
        const status = res.statusCode;
    
        const logData = {
            ...baseLogData,
            type: 'error',
            error: serializers.err(error),
            response: {
                statusCode: status,
                response_time_ms: responseTime
            },
            httpRequest: this.createHttpRequestObject(req, res, responseTime)
        };
    
        const formattedLog = formatJsonLog(logData);
        const logLevel = getLogLevel(status);
    
        switch(logLevel) {
            case 'warn':
                this.logger.warn(formattedLog);
                break;
            case 'error':
                this.logger.error(formattedLog);
                break;
            default:
                this.logger.info(formattedLog);
        }
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