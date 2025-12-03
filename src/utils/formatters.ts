// src/utils/formatters.ts

import { FormatterOptions, LoggerConfig } from '../interfaces/logger-config.interface';
import { SEVERITY_LEVEL, LOGGER_CONSTANTS } from '../config/constants';
import { formatAwsLog } from './aws-formatter';

// Store LOG_TYPE from config to be accessed by formatters
let globalLogType: 'aws' | 'gcp' | undefined;

export const setGlobalLogType = (logType: 'aws' | 'gcp' | undefined) => {
  globalLogType = logType;
};

const getLogType = (): 'aws' | 'gcp' => {
  return globalLogType || process.env.LOG_TYPE as 'aws' | 'gcp' || (process.env.LOG_FORMAT === 'aws' ? 'aws' : 'gcp');
};

const getEffectiveLoggerName = (logSource?: string): string => {
    switch (logSource) {
        case 'exception':
            return LOGGER_CONSTANTS.ERROR_LOGGER_NAME;
        case 'console':
            return LOGGER_CONSTANTS.CONSOLE_LOGGER_NAME;
        default:
            return LOGGER_CONSTANTS.API_LOGGER_NAME;
    }
};
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
        logger_name: loggerName || 'nest-logger',
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
            // 'logging.googleapis.com/logName': getCloudLogName(
            //     bindings.projectId,
            //     bindings.loggerName
            // ),
            // resource: {
            //     type: 'global',
            //     labels: getResourceLabels(bindings.projectId, bindings.loggerName),
            // },
        };
    },

    log: (object: Record<string, any>) => {
        const logType = getLogType();
        const isAwsFormat = object._awsFormat === true || logType === 'aws';
        
        if (isAwsFormat) {
            return formatAwsLog(object);
        }
        
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
): CloudLogEntry | Record<string, any> => {
    if (!log) return log;
    
    const logType = options.LOG_TYPE || getLogType();
    
    if (logType === 'aws') {
        const {
            'logging.googleapis.com/trace': _trace,
            'logging.googleapis.com/spanId': _spanId,
            'logging.googleapis.com/logName': _logName,
            'logging.googleapis.com/labels': _labels,
            'logging.googleapis.com/sourceLocation': _sourceLocation,
            'logging.googleapis.com/operation': _operation,
            'logging.googleapis.com/httpRequest': _httpRequest,
            resource: _resource,
            ...rest
        } = log;
        return rest;
    }
    
    const {
        PROJECT_ID: configProjectId,
        includeResource = true,
        includeTrace = true,
    } = options;

    const effectiveProjectId = log.PROJECT_ID || log.projectId || configProjectId;
    const effectiveLoggerName = getEffectiveLoggerName(log.logSource);
    const formatted: CloudLogEntry = {
        severity: SEVERITY_LEVEL[log.level || 'info'] || 'DEFAULT',
    };
    
    if (includeTrace && log.traceId) {
        formatted['logging.googleapis.com/trace'] = effectiveProjectId 
            ? `projects/${effectiveProjectId}/traces/${log.traceId}`
            : log.traceId;
        
        if (log.spanId) {
            formatted['logging.googleapis.com/spanId'] = log.spanId;
        }
    }
    
    if (includeResource) {
        const loggerName = getEffectiveLoggerName(log.logSource);
        
        // Override the log name
        formatted['logging.googleapis.com/logName'] = getCloudLogName(
            effectiveProjectId,
            loggerName
        );
        
        formatted['logging.googleapis.com/labels'] = {
            requestId: log.requestId,
            service: log.service,
            logName: getCloudLogName(effectiveProjectId, loggerName),
        };
        
        // Also update resource labels
        if (formatted.resource?.labels) {
            formatted.resource.labels.logger_name = loggerName;
        }
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