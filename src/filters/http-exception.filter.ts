// src/filters/http-exception.filter.ts

import {
    ExceptionFilter,
    Catch,
    ArgumentsHost,
    HttpException,
    HttpStatus,
    Inject,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { BaseLoggerService } from '../logger/base-logger.service';
import { LOGGER_CONSTANTS, getLogLevel } from '../config/constants';
import { LoggerConfig } from '../interfaces';
import { RequestContext } from '../context';
import { serializers } from '../utils/serializers';
import { formatJsonLog } from '../utils/formatters';
import { AsyncLocalStorage } from 'async_hooks';

interface ErrorResponse {
    statusCode: number;
    message: string;
    error: string;
    timestamp: string;
    path: string;
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

    private getLogLevel(status: number): 'error' | 'warn' | 'info' {
        if (status >= 500) return 'error';
        if (status >= 400) return 'warn';
        return 'info';
    }

    catch(error: Error, host: ArgumentsHost): void {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse<Response>();
        const request = ctx.getRequest<Request>();
        const context = this.asyncStorage.getStore() || null;

        const status = this.getHttpStatus(error);
        const errorResponse = this.createErrorResponse(error, status, request, context);
        
        // Set the status before logging
        response.status(status);
        
        // Log using appropriate level based on status code
        const logLevel = getLogLevel(status);
        
        // Only log error response here, request was already logged by interceptor
        this.logErrorResponse(error, request, errorResponse, context, status, logLevel);

        response.json(errorResponse);
    }

    private logErrorResponse(
        error: Error,
        request: Request,
        errorResponse: ErrorResponse,
        context: RequestContext | null,
        status: number,
        logLevel: 'error' | 'warn' | 'info'
    ): void {
        const baseLogData = {
            requestId: context?.requestId,
            traceId: context?.traceId,
            spanId: context?.spanId,
            service: this.config.SERVICE_NAME,
            projectId: this.config.PROJECT_ID
        };

        const logData = {
            ...baseLogData,
            type: 'response',
            error: serializers.err(error),
            response: errorResponse,
            httpRequest: {
                requestMethod: request.method,
                requestUrl: request.originalUrl,
                status: status,
                userAgent: request.headers['user-agent'],
                remoteIp: request.ip,
                referer: request.headers.referer,
                latency: context ? {
                    seconds: parseInt(context.getElapsedMs()) / 1000,
                    nanos: (parseInt(context.getElapsedMs()) % 1000) * 1e6
                } : undefined
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

    private logResponse(
        request: Request,
        errorResponse: ErrorResponse,
        context: RequestContext | null,
        status: number
    ): void {
        const baseLogData = {
            requestId: context?.requestId,
            traceId: context?.traceId,
            spanId: context?.spanId,
            service: this.config.SERVICE_NAME,
            projectId: this.config.PROJECT_ID
        };

        const logData = {
            ...baseLogData,
            type: 'response',
            response: errorResponse,
            httpRequest: {
                requestMethod: request.method,
                requestUrl: request.originalUrl,
                status: status,
                userAgent: request.headers['user-agent'],
                remoteIp: request.ip,
                referer: request.headers.referer,
                latency: context ? {
                    seconds: parseInt(context.getElapsedMs()) / 1000,
                    nanos: (parseInt(context.getElapsedMs()) % 1000) * 1e6
                } : undefined
            }
        };

        const formattedLog = formatJsonLog(logData);
        this.logger.warn(formattedLog);
    }

    private getHttpStatus(error: Error): number {
        if (error instanceof HttpException) {
            const status = error.getStatus();
            return status;
        }
        
        if (error.name === 'NotFoundException') {
            return HttpStatus.NOT_FOUND;
        }
    
        return HttpStatus.INTERNAL_SERVER_ERROR;
    }

    private createErrorResponse(
        error: Error,
        status: number,
        request: Request,
        context: RequestContext | null
    ): ErrorResponse {
        let message: string;
        let errorType: string;
    
        if (error instanceof HttpException) {
            message = error.message;
            errorType = error.name;
        } else {
            // For non-HttpException errors, check if they have a response property
            const errorResponse = (error as any).response;
            if (errorResponse) {
                message = errorResponse.message;
                errorType = errorResponse.error;
            } else {
                message = error.message;
                errorType = error.name;
            }
        }
    
        // For 404s, always use the error message instead of "Internal server error"
        if (status === HttpStatus.NOT_FOUND) {
            message = error.message;
        }
    
        const response: ErrorResponse = {
            statusCode: status,
            message: message || 'Internal server error',
            error: errorType || 'Internal Server Error',
            timestamp: new Date().toISOString(),
            path: request.url,
        };
    
        if (context) {
            response.requestId = context.requestId;
            response.traceId = context.traceId;
        }
    
        return response;
    }

    private logError(
        error: Error,
        request: Request,
        errorResponse: ErrorResponse,
        context: RequestContext | null,
        status: number,
        logLevel: 'error' | 'warn' | 'info'
    ): void {
        const baseLogData = {
            requestId: context?.requestId,
            traceId: context?.traceId,
            spanId: context?.spanId,
            service: this.config.SERVICE_NAME,
            projectId: this.config.PROJECT_ID
        };

        const logData = {
            ...baseLogData,
            type: 'error',
            error: serializers.err(error),
            response: errorResponse,
            httpRequest: {
                requestMethod: request.method,
                requestUrl: request.originalUrl,
                status: status,
                userAgent: request.headers['user-agent'],
                remoteIp: request.ip,
                referer: request.headers.referer,
                latency: context ? {
                    seconds: parseInt(context.getElapsedMs()) / 1000,
                    nanos: (parseInt(context.getElapsedMs()) % 1000) * 1e6
                } : undefined
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