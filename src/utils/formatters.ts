// src/utils/formatters.ts
// Re-export from new formatters structure for backward compatibility
export * from '../formatters';

// Re-export interfaces for backward compatibility
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