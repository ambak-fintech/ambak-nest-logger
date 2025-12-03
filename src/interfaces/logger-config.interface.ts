// src/interfaces/logger-config.interface.ts

import type { Level as LogLevel } from 'pino';

export interface LoggerConfig {
    LOG_LEVEL?: LogLevel;
    LOG_FORMAT?: 'json' | 'pretty';
    LOG_TYPE?: 'aws' | 'gcp';
    PROJECT_ID: string;
    SERVICE_NAME: string;
    LOGGER_NAME?: string;
    LOGGER_SENSITIVE_FIELDS?: string;
    LOGGER_SENSITIVE_HEADERS?: string;
    includeResource?: boolean;
    includeTrace?: boolean;
}

export interface FormatterOptions extends Partial<LoggerConfig> {
    LOG_TYPE?: 'aws' | 'gcp';
    includeResource?: boolean;
    includeTrace?: boolean;
}