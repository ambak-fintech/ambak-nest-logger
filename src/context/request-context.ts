    // src/context/request-context.ts
    import { randomBytes } from 'crypto';
    import { TraceContext } from './trace-context';
    import { Request } from 'express';

    export class RequestContext {
        private readonly _requestId: string;
        private readonly _traceContext: TraceContext | null;
        private readonly _startTime: [number, number];
        private readonly _metadata: Map<string, any>;

        constructor() {
            this._requestId = '';
            this._traceContext = null;
            this._startTime = process.hrtime();
            this._metadata = new Map();
        }

        static create(req: Request): RequestContext {
            const context = new RequestContext();
            Object.defineProperties(context, {
                _requestId: {
                    value: req.headers['x-request-id'] || 
                        randomBytes(16).toString('hex').slice(0, 8),
                    writable: false
                },
                _traceContext: {
                    value: this.createTraceContext(req),
                    writable: false
                }
            });
            return context;
        }

        private static createTraceContext(req: Request): TraceContext {
            let traceContext: TraceContext;
            
            if (req.headers['x-cloud-trace-context']) {
                traceContext = TraceContext.parseCloudTrace(
                    req.headers['x-cloud-trace-context'] as string
                );
            } else {
                traceContext = TraceContext.parseTraceParent(
                    req.headers.traceparent as string
                );
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

        getElapsedMs(): string {
            const diff = process.hrtime(this._startTime);
            return (diff[0] * 1e3 + diff[1] * 1e-6).toFixed(2);
        }

        addTraceHeaders(headers: Record<string, string> = {}): Record<string, string> {
            if (this._traceContext) {
                headers.traceparent = this._traceContext.toTraceParent();
                
                const tracestate = this._traceContext.toTraceState();
                if (tracestate) {
                    headers.tracestate = tracestate;
                }

                headers['x-cloud-trace-context'] = this._traceContext.toCloudTrace();
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
                        TraceContext.generateNew(),
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