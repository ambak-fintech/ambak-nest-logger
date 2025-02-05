// src/utils/formatters.ts

import { FormatterOptions, LoggerConfig } from '../interfaces/logger-config.interface';
import { SEVERITY_LEVEL } from '../config/constants';

export interface CloudLogEntry {
    severity: string;
    'logging.googleapis.com/trace'?: string;
    'logging.googleapis.com/spanId'?: string;
    'logging.googleapis.com/labels'?: {
        requestId?: string;
        service?: string;
        logName?: string;
    };
    'logging.googleapis.com/sourceLocation'?: {
        file: string;
        line: string;
        function: string;
    };
    'logging.googleapis.com/operation'?: Record<string, any>;
    'logging.googleapis.com/httpRequest'?: Record<string, any>;
    [key: string]: any;
}

export interface ResourceLabels {
    project_id: string;
    logger_name: string;
}

export const getCloudLogName = (
    projectId: string | undefined, 
    loggerName: string
): string => {
    if (!projectId) return loggerName;
    return `projects/${projectId}/logs/${loggerName}`;
};

export const getResourceLabels = (
    projectId: string | undefined, 
    loggerName: string
): ResourceLabels => {
    return {
        project_id: projectId || '',
        logger_name: loggerName,
    };
};

export const formatters = {
    level: (label: string, number: number) => {
        return {
            severity: SEVERITY_LEVEL[label] || 'DEFAULT',
            level: number
        };
    },

    bindings: (bindings: Record<string, any>) => {
        return {
            pid: bindings.pid,
            hostname: bindings.hostname,
            'logging.googleapis.com/logName': getCloudLogName(
                bindings.projectId,
                bindings.loggerName
            ),
            resource: {
                type: 'global',
                labels: getResourceLabels(bindings.projectId, bindings.loggerName),
            },
        };
    },

    log: (object: Record<string, any>) => {
        const {
            pid, hostname, level, time, msg, 
            severity, requestId, service, 
            ...rest
        } = object;

        return rest;
    }
};

export const formatJsonLog = (
    log: Record<string, any>, 
    options: FormatterOptions = {}
): CloudLogEntry => {
    if (!log) return log;
    
    const {
        PROJECT_ID: projectId,
        includeResource = true,
        includeTrace = true,
    } = options;
    
    const formatted: CloudLogEntry = {
        severity: SEVERITY_LEVEL[log.level || 'info'] || 'DEFAULT',
    };
    
    if (includeTrace && log.traceId) {
        formatted['logging.googleapis.com/trace'] = projectId 
            ? `projects/${projectId}/traces/${log.traceId}`
            : log.traceId;
        
        if (log.spanId) {
            formatted['logging.googleapis.com/spanId'] = log.spanId;
        }
    }
    
    if (includeResource) {
        formatted['logging.googleapis.com/labels'] = {
            requestId: log.requestId,
            service: log.service,
            logName: getCloudLogName(projectId, log.loggerName),
        };
    }
    
    if (log.sourceLocation) {
        formatted['logging.googleapis.com/sourceLocation'] = log.sourceLocation;
    }
    
    if (log.operation) {
        formatted['logging.googleapis.com/operation'] = log.operation;
    }
    
    if (log.httpRequest) {
        formatted['logging.googleapis.com/httpRequest'] = log.httpRequest;
    }
    
    Object.assign(formatted, log);
    
    delete formatted.pid;
    delete formatted.hostname;
    delete formatted.requestId;
    delete formatted.service;
    delete formatted.traceId;
    delete formatted.spanId;
    delete formatted.sourceLocation;
    delete formatted.operation;
    
    return formatted;
};