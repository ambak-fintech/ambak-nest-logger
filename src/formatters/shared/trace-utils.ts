/**
 * AWS X-Ray Trace ID utilities
 */

/**
 * Convert trace ID to AWS X-Ray format: Root=1-{timestamp}-{traceId}
 */
export const convertToAwsXRayTraceId = (traceId: string | undefined, timestamp?: string | null): string | null => {
    if (!traceId) return null;
    
    // If already in Root= format, return as is
    if (typeof traceId === 'string' && traceId.startsWith('Root=')) {
        return traceId;
    }
    
    // Get timestamp (Unix epoch in seconds)
    const epochSeconds = timestamp 
        ? Math.floor(new Date(timestamp).getTime() / 1000)
        : Math.floor(Date.now() / 1000);
    
    // Convert to 8-char hex (lowercase)
    const hexTimestamp = epochSeconds.toString(16).padStart(8, '0').toLowerCase();
    
    // Extract first 24 chars of traceId (AWS X-Ray uses 96-bit = 24 hex chars)
    const traceIdStr = typeof traceId === 'string' ? traceId : (traceId as any).toString(16);
    const traceIdHex = traceIdStr.replace(/[^0-9a-f]/gi, '').slice(0, 24).padStart(24, '0').toLowerCase();
    
    return `Root=1-${hexTimestamp}-${traceIdHex}`;
};

/**
 * Generate X-Amzn-Trace-Id header value
 */
export const generateXAmznTraceId = (traceId: string | undefined, spanId?: string | undefined, sampled: boolean = true): string | null => {
    if (!traceId) return null;
    
    const awsTraceId = convertToAwsXRayTraceId(traceId);
    if (!awsTraceId) return null;
    
    const parts = [awsTraceId];
    if (spanId) {
        parts.push(`Parent=${spanId}`);
    }
    parts.push(`Sampled=${sampled ? '1' : '0'}`);
    
    return parts.join(';');
};

