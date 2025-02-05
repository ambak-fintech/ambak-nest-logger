// src/interfaces/serializer.interface.ts

export interface SerializedRequest {
    method: string;
    url: string;
    path?: string;
    params?: Record<string, any>;
    headers: Record<string, any>;
    remoteAddress: string;
    query_params?: Record<string, any>;
    request_payload?: any;
    files?: Array<{
        fieldname: string;
        originalname: string;
        encoding: string;
        mimetype: string;
        size: number;
    }>;
    error?: string;
    message?: string;
}

export interface SerializedResponse {
    statusCode: number;
    responseTime: string | 'N/A';
    body?: any;
    error?: any;
    message?: string;
}

export interface SerializedError {
    type: string;
    message: string;
    code?: string | number;
    stack?: string;
    statusCode?: number;
    details?: any;
    context?: any;
}