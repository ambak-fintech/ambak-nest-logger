// src/utils/formatters.ts

import { FormatterOptions, LoggerConfig } from '../interfaces/logger-config.interface';
import { SEVERITY_LEVEL, LOGGER_CONSTANTS } from '../config/constants';

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
        PROJECT_ID: configProjectId,
        includeResource = true,
        includeTrace = true,
        LOG_TYPE: configLogType = 'gcp',
    } = options;

    const logType = (log.LOG_TYPE || log.logType || configLogType) as 'gcp' | 'aws';
    if (logType === "aws") {
        const awsLog: Record<string, any> = {
            severity: SEVERITY_LEVEL[log.level || "info"] || log.severity || "INFO",
            timestamp: log.timestamp || log.time || new Date().toISOString(),
            service: log.service || "api",
        };
    
        if (includeTrace && log.traceId) {
            const time = log.timestamp || log.time || new Date().toISOString();
            const epochHex = Math.floor(new Date(time).getTime() / 1000)
                .toString(16)
                .padStart(8, "0");
    
            const traceId24 = log.traceId
                .replace(/[^0-9a-f]/gi, "")
                .slice(0, 24)
                .padStart(24, "0")
                .toLowerCase();
    
            const spanId16 = (log.spanId || "")
                .replace(/[^0-9a-f]/gi, "")
                .slice(0, 16)
                .padStart(16, "0")
                .toLowerCase();
    
            const fullTraceId = `1-${epochHex}-${traceId24}`;
    
            awsLog.trace = {
                trace_id: fullTraceId,
                segment_id: spanId16 || "0000000000000000",
                sampled: true,
            };
    
            awsLog["x-amzn-trace-id"] =
                `Root=${fullTraceId};Parent=${spanId16};Sampled=1`;
        }
    
        const httpReq = log.httpRequest;
        const method = log.method || httpReq?.requestMethod;
        const url = log.url || log.path || httpReq?.requestUrl;
        const clientIp = log.remoteAddress || httpReq?.remoteIp;
        const contentLength = log.headers?.["content-length"] || httpReq?.requestSize;
        const userAgent = log.headers?.["user-agent"] || httpReq?.userAgent;
    
        awsLog.request = {};
        if (method) awsLog.request.method = method;
        if (url) awsLog.request.url = url;
        if (clientIp) awsLog.request.clientIp = clientIp;
        if (contentLength)
            awsLog.request.contentLength = Number(contentLength) || contentLength;
        if (userAgent) awsLog.request.userAgent = userAgent;
    
        if (log.request_payload) {
            awsLog.body = log.request_payload;
        } else if (httpReq?.requestBody) {
            awsLog.body = httpReq.requestBody;
        }
    
        awsLog.aws = {
            cloudwatch: {
                log_group: `/aws/service/${awsLog.service}`,
                log_stream: log.instance || "instance-1",
            },
        };
        const removeKeys = [
            "pid", "hostname", "time", "msg", "level", "levelNumber",
            "PROJECT_ID", "LOG_TYPE", "logType", "request_payload",
            "method", "url", "path", "headers", "remoteAddress",
            "type", "target_service", "httpRequest", "traceId", "spanId",
            "logging.googleapis.com/trace",
            "logging.googleapis.com/spanId",
            "logging.googleapis.com/logName",
            "logging.googleapis.com/labels",
            "logging.googleapis.com/sourceLocation",
            "logging.googleapis.com/operation",
            "logging.googleapis.com/httpRequest"
        ];
    
        removeKeys.forEach((k) => delete awsLog[k]);
    
        return awsLog as CloudLogEntry;
    }

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
    delete formatted.LOG_TYPE;
    delete formatted.logType;

    return formatted;
};