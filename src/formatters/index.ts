/**
 * Formatters index - routes to AWS or GCP formatters based on LOG_TYPE
 */

import { FormatterOptions } from '../interfaces/logger-config.interface';
import { SEVERITY_LEVEL, LOGGER_CONSTANTS } from '../config/constants';
import { formatAwsLog } from './aws';
import { formatGcpLog } from './gcp';

// Store LOG_TYPE from config to be accessed by formatters
let globalLogType: 'aws' | 'gcp' | undefined;

export const setGlobalLogType = (logType: 'aws' | 'gcp' | undefined) => {
  globalLogType = logType;
};

const getLogType = (): 'aws' | 'gcp' => {
  return globalLogType || (process.env.LOG_TYPE as 'aws' | 'gcp') || 'gcp';
};

const isAwsFormat = (): boolean => {
  return getLogType() === 'aws';
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
) => {
    return {
        project_id: projectId || '',
        logger_name: loggerName || 'nest-logger',
    };
};

export const formatters = {
    level: (label: string, number: number) => {
        // Return severity and level for both AWS and GCP
        // They will be removed in formatAwsLog if needed
        return {
            severity: SEVERITY_LEVEL[label] || 'DEFAULT',
            level: number
        };
    },

    bindings: (bindings: Record<string, any>) => {
        // Return empty bindings for AWS to prevent Pino from adding pid/hostname
        // Keep standard bindings for GCP
        if (isAwsFormat()) {
            return {};
        }
        return {
            pid: bindings.pid,
            hostname: bindings.hostname,
        };
    },

    log: (object: Record<string, any>) => {
        const logType = getLogType();
        const isAwsFormat = object._awsFormat === true || logType === 'aws';
        
        if (isAwsFormat) {
            // Match Express logger exactly - just call formatAwsLog directly
            // The formatAwsLog already does all the cleaning
            return formatAwsLog(object);
        }
        
        // GCP format - remove level, pid, hostname
        const {
            pid, hostname, level, levelNumber, ...rest
        } = object;

        return rest;
    }
};

export const formatJsonLog = (
    log: Record<string, any>, 
    options: FormatterOptions = {}
): Record<string, any> => {
    if (!log) return log;
    
    const logType = options.LOG_TYPE || getLogType();
    
    if (logType === 'aws') {
        return formatAwsLog(log);
    }
    
    // GCP Format
    const {
        PROJECT_ID: configProjectId,
        includeResource = true,
        includeTrace = true,
    } = options;

    const effectiveProjectId = log.PROJECT_ID || log.projectId || configProjectId;
    const effectiveLoggerName = getEffectiveLoggerName(log.logSource);
    
    return formatGcpLog({
        ...log,
        PROJECT_ID: effectiveProjectId,
        loggerName: effectiveLoggerName
    });
};

export { getLogType, isAwsFormat };

