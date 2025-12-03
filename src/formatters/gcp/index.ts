/**
 * GCP Cloud Logging Formatter
 */

import { extractCommonFields } from '../shared/field-cleaner';

/**
 * Format GCP log entry
 */
export const formatGcpLog = (log: Record<string, any>): Record<string, any> => {
    if (!log) return log;
    
    const fields = extractCommonFields(log);
    const projectId = log.PROJECT_ID || log.projectId || process.env.PROJECT_ID;
    
    const formatted: Record<string, any> = {
        ...(fields.system.time && { time: fields.system.time }),
        ...(fields.context.service && { service: fields.context.service }),
        ...(fields.context.traceId && { traceId: fields.context.traceId }),
        ...(fields.context.spanId && { spanId: fields.context.spanId }),
        ...(fields.context.traceId && projectId && {
            'logging.googleapis.com/trace': `projects/${projectId}/traces/${fields.context.traceId}`
        }),
        ...(fields.context.spanId && {
            'logging.googleapis.com/spanId': fields.context.spanId
        }),
        'logging.googleapis.com/labels': {
            ...(fields.context.service && { service: fields.context.service }),
            ...((log as any).env && { env: (log as any).env }),
        },
        ...(projectId && {
            resource: {
                type: 'global',
                labels: {
                    project_id: projectId
                }
            }
        }),
        ...fields.rest
    };
    
    // Clean up httpRequest - remove unwanted fields
    if (formatted.httpRequest) {
        const cleanHttpRequest: Record<string, any> = {
            ...(formatted.httpRequest.requestMethod && { requestMethod: formatted.httpRequest.requestMethod }),
            ...(formatted.httpRequest.requestUrl && { requestUrl: formatted.httpRequest.requestUrl }),
            ...(formatted.httpRequest.remoteIp && { remoteIp: formatted.httpRequest.remoteIp }),
            ...(formatted.httpRequest.requestSize && { requestSize: formatted.httpRequest.requestSize }),
            ...(formatted.httpRequest.userAgent && { userAgent: formatted.httpRequest.userAgent }),
        };
        formatted.httpRequest = cleanHttpRequest;
    }
    
    // Keep request_payload as is (not in request object)
    // Remove request object if it exists
    delete formatted.request;
    
    // Clean up unwanted fields
    delete formatted.pid;
    delete formatted.hostname;
    delete formatted.level;
    delete formatted.levelNumber;
    delete formatted.requestId;
    delete formatted.type;
    delete formatted.target_service;
    delete formatted.method;
    delete formatted.url;
    delete formatted.path;
    delete formatted.remoteAddress;
    delete formatted.headers;
    delete formatted.params;
    delete formatted.query_params;
    
    return formatted;
};

