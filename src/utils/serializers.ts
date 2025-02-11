// src/utils/serializers.ts

import { Request, Response } from 'express';
import { sanitizeHeaders, sanitizeBody } from './sanitizers';
import { CONTENT_LIMITS } from '../config/constants';
import { SerializedRequest, SerializedResponse, SerializedError } from '../interfaces';

/**
 * Get content type from response object
 */
export const getContentType = (res: Response | null): string => {
    if (!res) return '';
    if (typeof res.getHeaders === 'function') {
        return (res.getHeaders()['content-type'] as string) || '';
    }
    return '';
};

/**
 * Handle request body serialization based on content type
 */
const handleRequestBody = (req: Request, contentType: string): any => {
    const payload = (req as any).parsedBody || req.body;
    if (!payload) return undefined;
    
    try {
        // Handle JSON and form data
        if (contentType.includes('application/json') || 
            contentType.includes('application/x-www-form-urlencoded')) {
            return sanitizeBody(payload);
        }
        
        // Handle multipart form data
        if (contentType.includes('multipart/form-data')) {
            return {
                payload: sanitizeBody(payload),
                message: '[MULTIPART FORM DATA]',
                size: req.headers['content-length'],
                boundary: contentType.split('boundary=')[1]
            };
        }
        
        // Handle text content
        if (contentType.includes('text/')) {
            const stringBody = String(payload);
            return stringBody.length > CONTENT_LIMITS.STRING_RESPONSE
                ? `${stringBody.slice(0, CONTENT_LIMITS.STRING_RESPONSE)}... [TRUNCATED]`
                : stringBody;
        }
        
        // Handle other content types
        return `[${contentType.split(';')[0]} CONTENT]`;
    } catch (error) {
        return '[BODY SERIALIZATION ERROR]';
    }
};

/**
 * Pino serializers for various objects
 */
export const serializers = {
    /**
     * Serialize request object
     */
    req: (req: Request): SerializedRequest => {
        if (!req) return req;
        
        try {
            const contentType = req.headers?.['content-type'] || '';
            
            const serialized: SerializedRequest = {
                method: req.method,
                url: req.originalUrl || req.url,
                path: req.path,
                params: req.params,
                headers: sanitizeHeaders(req.headers),
                remoteAddress: req.ip || 
                             req.socket?.remoteAddress || 
                             'unknown'
            };

            // Add query parameters if present
            if (req.query && Object.keys(req.query).length > 0) {
                serialized.query_params = sanitizeBody(req.query);
            }

            // Add request payload
            const requestPayload = handleRequestBody(req, contentType);
            if (requestPayload) {
                serialized.request_payload = requestPayload;
            }

            // Handle file uploads
            if ((req as any).files?.length > 0 || ((req as any).file && Object.keys((req as any).file).length > 0)) {
                const files = (req as any).files || [(req as any).file];
                serialized.files = files.map((file: any) => ({
                    fieldname: file.fieldname,
                    originalname: file.originalname,
                    encoding: file.encoding,
                    mimetype: file.mimetype,
                    size: file.size
                }));
            }

            return serialized;
        } catch (err) {
            return {
                method: 'unknown',
                url: 'unknown',
                headers: {},
                remoteAddress: 'unknown',
                error: 'Failed to serialize request',
                message: err instanceof Error ? err.message : 'Unknown error'
            };
        }
    },

    /**
     * Serialize response object
     */
    res: (res: Response): SerializedResponse => {
        if (!res) return res;
        
        try {
            const raw = (res as any).raw || res;
            const contentType = getContentType(raw);
            
            const serialized: SerializedResponse = {
                statusCode: raw.statusCode,
                responseTime: (res as any).responseTime || 'N/A'
            };

            const body = (res as any).body ?? raw.body;
            
            if (body !== undefined) {
                if (body === null) {
                    serialized.body = '[NO CONTENT]';
                } else if (typeof body === 'string' && !body) {
                    serialized.body = '[EMPTY STRING]';
                } else if (contentType.includes('application/json')) {
                    serialized.body = sanitizeBody(body);
                } else if (contentType.includes('text/') || 
                          contentType.includes('html') || 
                          typeof body === 'string') {
                    const stringBody = String(body);
                    serialized.body = stringBody.length > CONTENT_LIMITS.STRING_RESPONSE
                        ? `${stringBody.slice(0, CONTENT_LIMITS.STRING_RESPONSE)}... [TRUNCATED]`
                        : stringBody;
                } else if (contentType.includes('image/')) {
                    serialized.body = '[IMAGE CONTENT]';
                } else if (Buffer.isBuffer(body)) {
                    serialized.body = '[BUFFER CONTENT]';
                } else if (typeof body === 'object') {
                    serialized.body = sanitizeBody(body);
                } else {
                    serialized.body = String(body);
                }
            }

            if ((res as any).error) {
                serialized.error = serializers.err((res as any).error);
            }

            return serialized;
        } catch (err) {
            return {
                statusCode: 500,
                responseTime: 'N/A',
                error: 'Failed to serialize response',
                message: err instanceof Error ? err.message : 'Unknown error'
            };
        }
    },

    /**
     * Serialize error object
     */
    err: (err: Error): SerializedError => {
        if (!err) return err;
        
        try {
            return {
                type: (err as any).type || err.name,
                message: err.message,
                code: (err as any).code,
                stack: err.stack,
                statusCode: (err as any).statusCode || (err as any).status,
                ...(err as any).details && { details: (err as any).details },
                ...(err as any).context && { 
                    context: sanitizeBody((err as any).context) 
                }
            };
        } catch (e) {
            return {
                type: 'SerializationError',
                message: e instanceof Error ? e.message : 'Failed to serialize error',
            };
        }
    }
};

export { SerializedRequest, SerializedResponse, SerializedError };