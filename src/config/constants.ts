// src/config/constants.ts

import type { Level as LogLevel } from 'pino';

export const EXCLUDED_PATHS = [
  '/health',
  '/metrics',
  '/*/health',
  '/*/metrics'
];

export const shouldExcludePath = (path: string, customExclusions: string[] = []): boolean => {
  const pathsToCheck = [...EXCLUDED_PATHS, ...customExclusions];
  return pathsToCheck.some(pattern => {
    if (pattern.includes('*')) {
      const regexPattern = pattern.replace('*', '[^/]+');
      return new RegExp(`^${regexPattern}$`).test(path);
    }
    return path === pattern;
  });
};

export const SEVERITY_LEVEL: Record<string, string> = {
  trace: 'DEBUG',
  debug: 'DEBUG',
  info: 'INFO',
  warn: 'WARNING',
  error: 'ERROR',
  fatal: 'CRITICAL'
};

export const LOG_LEVELS: Record<string, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60
};

export const DEFAULT_SENSITIVE_FIELDS = new Set([
  'password',
  'token',
  'authorization',
  'key',
  'secret',
  'credential',
  'creditcard',
  'credit_card',
  'cardnumber',
  'apikey',
  'phone',
  'email',
  'dob',
  'birth',
  'social'
]);

export function getLogLevel(status: number): 'error' | 'warn' | 'info' {
  if (status >= 500) return 'error';
  if (status >= 400) return 'warn';
  return 'info';
}

export const DEFAULT_SENSITIVE_HEADERS = [
  'authorization',
  'cookie',
  'x-api-key',
  'token',
  'password'
];

export const CONTENT_LIMITS = {
  STRING_RESPONSE: 1024,
  JSON_DEPTH: 10,
  ARRAY_LENGTH: 100
} as const;

export const LOGGER_CONSTANTS = {
  MODULE_OPTIONS_TOKEN: 'LOGGER_MODULE_OPTIONS',
  ASYNC_STORAGE_TOKEN: 'ASYNC_STORAGE_TOKEN',
  LOGGER_TOKEN: 'LOGGER_TOKEN',
  API_LOGGER_NAME: 'api-logger',
  ERROR_LOGGER_NAME: 'error-logger',
  CONSOLE_LOGGER_NAME: 'console-logger',
} as const;