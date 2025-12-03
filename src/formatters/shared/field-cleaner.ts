/**
 * Shared field cleaning utilities
 */

/**
 * Clean GCP-specific fields from object
 * Match Express logger exactly - just spread and delete
 */
export const cleanGcpFields = (obj: Record<string, any>): Record<string, any> => {
    const cleaned = { ...obj };
    delete cleaned['logging.googleapis.com/trace'];
    delete cleaned['logging.googleapis.com/spanId'];
    delete cleaned['logging.googleapis.com/logName'];
    delete cleaned['logging.googleapis.com/labels'];
    delete cleaned['logging.googleapis.com/sourceLocation'];
    delete cleaned['logging.googleapis.com/operation'];
    delete cleaned['logging.googleapis.com/httpRequest'];
    delete cleaned.resource;
    delete cleaned.levelNumber;
    // Ensure no empty string key exists
    if ('' in cleaned) {
        delete cleaned[''];
    }
    return cleaned;
};

/**
 * Extract and clean common unwanted fields
 */
export const extractCommonFields = (object: Record<string, any>) => {
    const {
        pid, hostname, level, levelNumber, time, timestamp,
        msg, severity, requestId, service, _awsFormat,
        traceId, spanId,
        method, url, path, remoteAddress, headers, request_payload,
        httpRequest, request,
        type, target_service,
        ...rest
    } = object;
    
    // Preserve request_payload and httpRequest in rest for GCP
    const restWithPayload = { ...rest };
    if (request_payload) {
        restWithPayload.request_payload = request_payload;
    }
    if (httpRequest) {
        restWithPayload.httpRequest = httpRequest;
    }
    
    return {
        system: { pid, hostname, level, levelNumber, time, timestamp, msg, severity },
        context: { requestId, service, traceId, spanId },
        request: { method, url, path, remoteAddress, headers, request_payload, httpRequest, request },
        other: { type, target_service },
        rest: restWithPayload
    };
};

