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
import { LOGGER_CONSTANTS } from '../config/constants';
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

    catch(error: Error, host: ArgumentsHost): void {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse<Response>();
        const request = ctx.getRequest<Request>();
        const context = this.asyncStorage.getStore() || null;

        const status = this.getHttpStatus(error);
        const errorResponse = this.createErrorResponse(error, status, request, context);
        
        // Log the error
        this.logError(error, request, errorResponse, context);

        // Send response to client
        response
            .status(status)
            .json(errorResponse);
    }

    private getHttpStatus(error: Error): number {
        return error instanceof HttpException
            ? error.getStatus()
            : HttpStatus.INTERNAL_SERVER_ERROR;
    }

    private createErrorResponse(
        error: Error,
        status: number,
        request: Request,
        context: RequestContext | null
    ): ErrorResponse {
        const message = error instanceof HttpException
            ? error.message
            : 'Internal server error';

        const response: ErrorResponse = {
            statusCode: status,
            message,
            error: error.name,
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
        context: RequestContext | null
    ): void {
        const baseLogData = {
            requestId: context?.requestId,
            traceId: context?.traceId,
            spanId: context?.spanId,
            service: this.config.SERVICE_NAME
        };

        const errorLog = formatJsonLog({
            ...baseLogData,
            type: 'error',
            error: serializers.err(error),
            response: errorResponse,
            httpRequest: {
                requestMethod: request.method,
                requestUrl: request.originalUrl,
                status: errorResponse.statusCode,
                userAgent: request.headers['user-agent'],
                remoteIp: request.ip,
                referer: request.headers.referer,
                latency: context ? {
                    seconds: parseInt(context.getElapsedMs()) / 1000,
                    nanos: (parseInt(context.getElapsedMs()) % 1000) * 1e6
                } : undefined
            }
        });

        this.logger.error(errorLog);
    }
}

// src/filters/index.ts

export * from './http-exception.filter';