
export const formatAwsLog = (object: Record<string, any>): Record<string, any> => {
    const {
        pid, hostname, level, levelNumber, time, timestamp,
        msg, severity, requestId, service, _awsFormat, ...rest
    } = object;
    
    const cleanRest = { ...rest };
    delete cleanRest['logging.googleapis.com/trace'];
    delete cleanRest['logging.googleapis.com/spanId'];
    delete cleanRest['logging.googleapis.com/logName'];
    delete cleanRest['logging.googleapis.com/labels'];
    delete cleanRest['logging.googleapis.com/sourceLocation'];
    delete cleanRest['logging.googleapis.com/operation'];
    delete cleanRest['logging.googleapis.com/httpRequest'];
    delete cleanRest.resource;
    delete cleanRest.levelNumber;
    
    const result: Record<string, any> = {
        ...(timestamp ? { timestamp } : (time ? { timestamp: time } : {})),
        ...(pid !== undefined ? { pid } : {}),
        ...(hostname ? { hostname } : {}),
        ...(severity ? { severity } : {}),
        ...(level !== undefined ? { level } : {}),
        ...cleanRest
    };
    
    delete result.levelNumber;
    
    return result;
};

