// src/filters/http-exception.filter.ts
import {
    ExceptionFilter,
    Catch,
    ArgumentsHost,
    HttpException,
    HttpStatus,
    Inject,
    BadRequestException,
    ExecutionContext
} from '@nestjs/common';
import { Request, Response } from 'express';
import { BaseLoggerService } from '../logger/base-logger.service';
import { LOGGER_CONSTANTS } from '../config/constants';
import { LoggerConfig } from '../interfaces';
import { RequestContext } from '../context';
import { serializers } from '../utils/serializers';
import { formatJsonLog } from '../utils/formatters';
import { AsyncLocalStorage } from 'async_hooks';

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
    // Silent catch - GraphQL support is optional
}

interface ErrorResponse {
    statusCode: number;
    message?: string;
    error?: any;
    timestamp?: string;
    path?: string;
    requestId?: string;
    traceId?: string;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
    constructor(
        private readonly logger: BaseLoggerService,
        @Inject(LOGGER_CONSTANTS.MODULE_OPTIONS_TOKEN)
        private readonly config: LoggerConfig,
        @Inject(LOGGER_CONSTANTS.ASYNC_STORAGE_TOKEN)
        private readonly asyncStorage: AsyncLocalStorage<RequestContext>
    ) {}

    catch(error: Error, host: ArgumentsHost): void {
        const contextType = host.getType() as ContextType;
        let request: Request;
        let response: Response;

        if (contextType === ContextType.HTTP) {
            const ctx = host.switchToHttp();
            request = ctx.getRequest<Request>();
            response = ctx.getResponse<Response>();
        } else if (contextType === ContextType.GRAPHQL && GqlExecutionContext) {
            const gqlContext = GqlExecutionContext.create(host as ExecutionContext);
            const ctx = gqlContext.getContext();
            request = ctx.req;
            response = {
                status: (statusCode: number) => ({
                    json: (data: any) => {
                        ctx.errorResponse = { ...data, statusCode };
                        return response;
                    }
                }),
                setHeader: () => response
            } as any;
        } else {
            this.logger.error(`Unsupported context type: ${contextType}`);
            return;
        }

        if (!request || !response) {
            this.logger.error('Unable to get request or response objects');
            return;
        }

        const existingContext = this.asyncStorage.getStore();
        if (!existingContext) {
            const newContext = RequestContext.create(request);
            this.asyncStorage.run(newContext, () => {
                this.handleError(error, request, response, newContext, contextType);
            });
            return;
        }

        this.handleError(error, request, response, existingContext, contextType);
    }

    private handleError(
        error: Error,
        request: Request,
        response: Response,
        context: RequestContext,
        contextType: ContextType
    ): void {
        const status = this.getHttpStatus(error);
        const errorResponse = this.createErrorResponse(error, status, request, context);
        
        if (contextType === ContextType.HTTP) {
            const headers = context.addTraceHeaders();
            Object.entries(headers).forEach(([key, value]) => {
                if (value) {
                    response.setHeader(key, value);
                }
            });
        }

        const logLevel = this.getLogLevel(status);
        this.logErrorResponse(error, request, errorResponse, context, status, logLevel, contextType);

        if (contextType === ContextType.GRAPHQL) {
            throw this.formatGraphQLError(errorResponse);
        } else {
            const httpError = error as HttpException;
            response.status(status).json(httpError.getResponse() || errorResponse);
        }
    }

    private formatGraphQLError(errorResponse: ErrorResponse): Error {
        const graphQLError = new Error(errorResponse.message || 'GraphQL Error');
        Object.assign(graphQLError, {
            extensions: {
                ...errorResponse,
                code: typeof errorResponse.error === 'string' ? errorResponse.error : 'BAD_REQUEST'
            }
        });
        return graphQLError;
    }

    private getLogLevel(status: number): 'error' | 'warn' | 'info' {
        if (status >= 500) return 'error';
        if (status >= 400) return 'warn';
        return 'info';
    }

    private getHttpStatus(error: Error): number {
        if (error instanceof HttpException) {
            return error.getStatus();
        }

        if (error.name === 'ValidationError' || error.name === 'UserInputError' || error.name === 'BadRequestException') {
            return HttpStatus.BAD_REQUEST;
        }

        return HttpStatus.INTERNAL_SERVER_ERROR;
    }

    private createErrorResponse(
        error: Error,
        status: number,
        request: Request,
        context: RequestContext
    ): ErrorResponse {
        // For BadRequestException, preserve the original error structure
        if (error instanceof BadRequestException) {
            const errorResponse = error.getResponse() as any;
            
            // If errorResponse is an object and has the 'error' property we want to preserve
            if (typeof errorResponse === 'object' && errorResponse.error) {
                return {
                    statusCode: status,
                    error: errorResponse.error
                };
            }

            // If errorResponse itself is the error object we want to preserve
            if (typeof errorResponse === 'object' && !errorResponse.message && !errorResponse.error) {
                return {
                    statusCode: status,
                    error: errorResponse
                };
            }

            // If it's a validation error array
            if (Array.isArray(errorResponse.message)) {
                return {
                    statusCode: status,
                    error: {
                        messages: errorResponse.message
                    }
                };
            }
        }

        // For other HttpExceptions
        if (error instanceof HttpException) {
            const errorResponse = error.getResponse() as any;
            
            // If errorResponse is an object, preserve its structure
            if (typeof errorResponse === 'object') {
                return {
                    statusCode: status,
                    ...errorResponse
                };
            }

            // If errorResponse is a string or other primitive
            return {
                statusCode: status,
                message: errorResponse
            };
        }

        // Default error response for non-HTTP exceptions
        return {
            statusCode: status,
            message: error.message,
            error: error.name,
            timestamp: new Date().toISOString(),
            path: request.url,
            requestId: context.requestId,
            traceId: context.traceId
        };
    }

    private logErrorResponse(
        error: Error,
        request: Request,
        errorResponse: ErrorResponse,
        context: RequestContext,
        status: number,
        logLevel: 'error' | 'warn' | 'info',
        contextType: ContextType
    ): void {
        const logData = {
            requestId: context.requestId,
            traceId: context.traceId,
            spanId: context.spanId,
            service: this.config.SERVICE_NAME,
            projectId: this.config.PROJECT_ID,
            contextType,
            type: 'response',
            error: serializers.err(error),
            response: errorResponse,
            httpRequest: {
                requestMethod: request.method,
                requestUrl: request.originalUrl,
                status,
                userAgent: request.headers['user-agent'],
                remoteIp: request.ip,
                referer: request.headers.referer,
                requestBody: request.body,
                protocol: request.protocol,
                requestSize: request.headers['content-length'],
                latency: {
                    seconds: parseInt(context.getElapsedMs()) / 1000,
                    nanos: (parseInt(context.getElapsedMs()) % 1000) * 1e6
                },
                headers: request.headers
            }
        };

        const formattedLog = formatJsonLog(logData);

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
}