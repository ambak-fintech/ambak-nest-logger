// src/utils/sanitizers.ts

import { CONTENT_LIMITS } from '../config/constants';

export interface Patterns {
    BASE64_IMAGE: RegExp;
    BASE64_GENERIC: RegExp;
    IMAGE_URL: RegExp;
    CREDIT_CARD: RegExp;
    SSN: RegExp;
    EMAIL: RegExp;
}

export const PATTERNS: Patterns = {
    BASE64_IMAGE: /^data:image\/[^;]+;base64,[^"'\s)]+$/,
    BASE64_GENERIC: /^(?:[A-Za-z0-9+/]{4}){10,}(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/,
    IMAGE_URL: /\.(jpe?g|png|gif|svg|webp|bmp|ico)($|\?)/i,
    CREDIT_CARD: /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/,
    SSN: /\b\d{3}[-]?\d{2}[-]?\d{4}\b/,
    EMAIL: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/
};

// Memoization cache for frequently checked strings
const memoizedChecks = new Map<string, string>();

/**
 * Sanitize image and base64 data
 */
export function sanitizeImageData(value: any): any {
    if (typeof value !== 'string') return value;
    
    // Check memoization cache
    const cached = memoizedChecks.get(value);
    if (cached) return cached;
    
    let result = value;
    
    if (value.length > 100) {
        if (PATTERNS.BASE64_IMAGE.test(value) || PATTERNS.BASE64_GENERIC.test(value)) {
            result = '[BASE64 REDACTED]';
        } else if (PATTERNS.IMAGE_URL.test(value)) {
            result = '[IMAGE URL REDACTED]';
        }
    }
    
    // Cache the result (with size limit)
    if (memoizedChecks.size < 1000) {
        memoizedChecks.set(value, result);
    }
    
    return result;
}

/**
 * Sanitize a single value, checking for various sensitive data patterns
 */
export function sanitizeValue(
    key: string, 
    value: any, 
    sensitiveFields: Set<string>
): any {
    if (sensitiveFields.has(key.toLowerCase())) {
        return '[REDACTED]';
    }

    if (!value || typeof value !== 'string') {
        return value;
    }

    if (value.length > 100) {
        const keyLower = key.toLowerCase();
        
        if (keyLower.includes('image') || value.startsWith('data:image/')) {
            return '[IMAGE DATA REDACTED]';
        }
        if (PATTERNS.BASE64_GENERIC.test(value)) {
            return '[BASE64 DATA REDACTED]';
        }
        if (PATTERNS.CREDIT_CARD.test(value)) {
            return '[CREDIT CARD REDACTED]';
        }
        if (PATTERNS.SSN.test(value)) {
            return '[SSN REDACTED]';
        }
        if (PATTERNS.EMAIL.test(value)) {
            return '[EMAIL REDACTED]';
        }
    }

    return sanitizeImageData(value);
}

/**
 * Recursively sanitize an object or array
 */
export function sanitizeBody(
    obj: any, 
    sensitiveFields: Set<string> = new Set(),
    depth: number = 0
): any {
    if (!obj || typeof obj !== 'object') {
        return obj;
    }

    if (depth >= CONTENT_LIMITS.JSON_DEPTH) {
        return '[MAX DEPTH EXCEEDED]';
    }

    if (Array.isArray(obj)) {
        return obj
            .slice(0, CONTENT_LIMITS.ARRAY_LENGTH)
            .map(item => sanitizeBody(item, sensitiveFields, depth + 1));
    }

    return Object.entries(obj).reduce((acc, [key, value]) => {
        acc[key] = sanitizeValue(
            key,
            typeof value === 'object' 
                ? sanitizeBody(value, sensitiveFields, depth + 1) 
                : value,
            sensitiveFields
        );
        return acc;
    }, {} as Record<string, any>);
}

/**
 * Sanitize HTTP headers
 */
export function sanitizeHeaders(
    headers: Record<string, any> = {}, 
    sensitiveHeaders: string[] = []
): Record<string, any> {
    if (!headers || typeof headers !== 'object') {
        return {};
    }

    return Object.entries(headers).reduce((acc, [key, value]) => {
        acc[key] = sensitiveHeaders.includes(key.toLowerCase()) 
            ? '[REDACTED]' 
            : value;
        return acc;
    }, {} as Record<string, any>);
}