/**
 * AWS CloudWatch Logs Formatter
 */

import { convertToAwsXRayTraceId, generateXAmznTraceId } from '../shared/trace-utils';
import { extractCommonFields, cleanGcpFields } from '../shared/field-cleaner';

/**
 * Format AWS log entry
 */
export const formatAwsLog = (object: Record<string, any>): Record<string, any> => {
    if (!object || typeof object !== 'object') {
        return object;
    }

    const fields = extractCommonFields(object);
    const cleanRest = cleanGcpFields(fields.rest);
    delete cleanRest.type;
    delete cleanRest.target_service;
    
    const result: Record<string, any> = {
        ...(fields.system.level !== undefined ? { level: fields.system.level } : {}),
        timestamp: fields.system.timestamp || fields.system.time || new Date().toISOString(),
        ...(fields.context.service && { service: fields.context.service }),
        ...cleanRest
    };
    
    // Convert traceId to AWS X-Ray format
    if (fields.context.traceId) {
        result.traceId = convertToAwsXRayTraceId(fields.context.traceId, result.timestamp);
        result['x-amzn-trace-id'] = generateXAmznTraceId(fields.context.traceId, fields.context.spanId, result.timestamp);
    }
    
    if (fields.context.spanId) {
        result.spanId = fields.context.spanId;
    }
    
    // Add AWS CloudWatch structure
    result.aws = {
        cloudwatch: {
            logGroup: '/aws/service/gateway-manager',
            logStream: 'instance-1'
        }
    };
    
    // Build request object
    const requestMethod = fields.request.method || fields.request.httpRequest?.requestMethod;
    const requestUrl = fields.request.url || fields.request.path || fields.request.httpRequest?.requestUrl;
    const clientIp = fields.request.remoteAddress || fields.request.httpRequest?.remoteIp;
    const contentLength = fields.request.headers?.['content-length'] || fields.request.httpRequest?.requestSize;
    const userAgent = fields.request.headers?.['user-agent'] || fields.request.httpRequest?.userAgent;
    
    if (requestMethod || requestUrl || clientIp || contentLength || userAgent) {
        result.request = {};
        if (requestMethod) result.request.method = requestMethod;
        if (requestUrl) result.request.url = requestUrl;
        if (clientIp) result.request.clientIp = clientIp;
        if (contentLength) result.request.contentLength = parseInt(contentLength as string) || contentLength;
        if (userAgent) result.request.userAgent = userAgent;
    }
    
    // Body from request_payload
    if (fields.request.request_payload) {
        result.body = fields.request.request_payload;
    } else if (fields.request.httpRequest?.requestBody) {
        result.body = fields.request.httpRequest.requestBody;
    }
    
    // Remove unwanted fields
    delete result.pid;
    delete result.hostname;
    delete result.levelNumber;
    delete result.time;
    delete result.msg;
    delete result.severity;
    delete result.requestId;
    delete result.httpRequest;
    delete result.request_payload;
    delete result.method;
    delete result.url;
    delete result.path;
    delete result.remoteAddress;
    delete result.headers;
    
    return result;
};
