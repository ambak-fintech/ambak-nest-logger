// src/decorators/log-context.decorator.ts

import { SetMetadata } from '@nestjs/common';

export const LOG_CONTEXT = 'log_context';

export interface LogContextOptions {
    name?: string;
    includeArgs?: boolean;
    includeResult?: boolean;
}

export const LogContext = (options: LogContextOptions = {}) => 
    SetMetadata(LOG_CONTEXT, options);