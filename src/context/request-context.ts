    // src/context/request-context.ts
    import { randomBytes } from 'crypto';
    import { TraceContext } from './trace-context';
    import { Request } from 'express';

    export class RequestContext {
        private readonly _requestId: string;
        private readonly _traceContext: TraceContext | null;
        private readonly _startTime: [number, number];
        private readonly _metadata: Map<string, any>;
        private readonly _logType: 'gcp' | 'aws';

        constructor() {
            this._requestId = '';
            this._traceContext = null;
            this._startTime = process.hrtime();
            this._metadata = new Map();
            this._logType = 'gcp';
        }

        static create(req: Request, logType: 'gcp' | 'aws' = 'gcp'): RequestContext {
            const context = new RequestContext();
            
            // Generate request ID - always use short 8-character format for consistency
            // If x-request-id header exists, use it only if it's already 8 chars, otherwise generate new one
            const incomingRequestId = req.headers['x-request-id'];
            let requestId: string;
            if (incomingRequestId && typeof incomingRequestId === 'string' && incomingRequestId.length === 8 && /^[0-9a-f]{8}$/i.test(incomingRequestId)) {
                requestId = incomingRequestId.toLowerCase();
            } else {
                requestId = randomBytes(16).toString('hex').slice(0, 8);
            }
            
            Object.defineProperties(context, {
                _requestId: {
                    value: requestId,
                    writable: false
                },
                _traceContext: {
                    value: this.createTraceContext(req, logType),
                    writable: false
                },
                _logType: {
                    value: logType,
                    writable: false
                }
            });
            return context;
        }

        private static createTraceContext(req: Request, logType: 'gcp' | 'aws'): TraceContext {
            let traceContext: TraceContext | null = null;

            if (logType === 'aws') {
                if (req.headers['x-amzn-trace-id']) {
                    traceContext = TraceContext.parseXAmznTraceId(
                        req.headers['x-amzn-trace-id'] as string
                    );
                } else {
                    // Generate new AWS-formatted trace ID if no header present
                    traceContext = TraceContext.generateNew(true);
                }
            } else if (req.headers['x-cloud-trace-context']) {
                traceContext = TraceContext.parseCloudTrace(
                    req.headers['x-cloud-trace-context'] as string
                );
            } else if (req.headers.traceparent) {
                traceContext = TraceContext.parseTraceParent(
                    req.headers.traceparent as string
                );
            } else {
                traceContext = TraceContext.generateNew(false);
            }

            traceContext.parseTraceState(req.headers.tracestate as string);
            return traceContext;
        }

        get requestId(): string {
            return this._requestId;
        }

        get traceId(): string {
            return this._traceContext?.currentTraceId || '';
        }

        get spanId(): string {
            return this._traceContext?.currentSpanId || '';
        }

        get traceContext(): TraceContext | null {
            return this._traceContext;
        }

        get logType(): 'gcp' | 'aws' {
            return this._logType;
        }

        getElapsedMs(): string {
            const diff = process.hrtime(this._startTime);
            return (diff[0] * 1e3 + diff[1] * 1e-6).toFixed(2);
        }

        addTraceHeaders(headers: Record<string, string> = {}): Record<string, string> {
            if (this._traceContext) {
                if (this._logType === 'aws') {
                    headers['x-amzn-trace-id'] = this._traceContext.toXAmznTraceId();
                } else {
                    headers.traceparent = this._traceContext.toTraceParent();

                    const tracestate = this._traceContext.toTraceState();
                    if (tracestate) {
                        headers.tracestate = tracestate;
                    }

                    headers['x-cloud-trace-context'] = this._traceContext.toCloudTrace();
                }
            }

            headers['x-request-id'] = this._requestId;

            return headers;
        }

        createChildContext(): RequestContext {
            const childContext = new RequestContext();
            Object.defineProperties(childContext, {
                _requestId: {
                    value: this._requestId,
                    writable: false
                },
                _traceContext: {
                    value: this._traceContext?.createChildSpan() ||
                        TraceContext.generateNew(this._logType === 'aws'),
                    writable: false
                },
                _logType: {
                    value: this._logType,
                    writable: false
                }
            });
            return childContext;
        }

        setMetadata(key: string, value: any): void {
            this._metadata.set(key, value);
        }

        getMetadata<T>(key: string): T | undefined {
            return this._metadata.get(key) as T;
        }
    }