// src/context/trace-context.ts
import { randomBytes } from 'crypto';

export class TraceContext {
    private version: string = '00';
    private traceId: string = '';
    private spanId: string = '';
    private traceFlags: string = '01';
    private traceState: Map<string, string> = new Map();

    static generateNew(): TraceContext {
        const context = new TraceContext();
        context.traceId = randomBytes(16).toString('hex');
        context.spanId = randomBytes(8).toString('hex');
        return context;
    }

    static parseTraceParent(header?: string): TraceContext {
        const context = new TraceContext();
        
        if (!header) {
            return TraceContext.generateNew();
        }

        try {
            const parts = header.split('-');
            if (parts.length !== 4) {
                return TraceContext.generateNew();
            }

            const [version, traceId, spanId, flags] = parts;

            if (!/^[0-9a-f]{2}$/.test(version) ||
                !/^[0-9a-f]{32}$/.test(traceId) ||
                !/^[0-9a-f]{16}$/.test(spanId) ||
                !/^[0-9a-f]{2}$/.test(flags)) {
                return TraceContext.generateNew();
            }

            context.version = version;
            context.traceId = traceId;
            context.spanId = randomBytes(8).toString('hex');
            context.traceFlags = flags;

            return context;
        } catch {
            return TraceContext.generateNew();
        }
    }

    static parseCloudTrace(header?: string): TraceContext {
        const context = new TraceContext();
        
        if (!header) {
            return TraceContext.generateNew();
        }
    
        try {
            const [traceSpan, options] = header.split(';o=');
            const [traceId] = traceSpan.split('/');
    
            if (!traceId) {
                return TraceContext.generateNew();
            }
    
            context.traceId = traceId.padStart(32, '0');
            context.spanId = randomBytes(8).toString('hex');
            context.traceFlags = (options === '0' ? '00' : '01');
    
            return context;
        } catch {
            return TraceContext.generateNew();
        }
    }

    parseTraceState(header?: string): void {
        if (!header) return;

        try {
            const pairs = header.split(',');
            for (const pair of pairs) {
                const [key, value] = pair.trim().split('=');
                if (key && value) {
                    this.traceState.set(key, value);
                }
            }
        } catch {
            // Invalid tracestate header, ignore
        }
    }

    toTraceParent(): string {
        return `${this.version}-${this.traceId}-${this.spanId}-${this.traceFlags}`;
    }

    toTraceState(): string {
        return Array.from(this.traceState.entries())
            .map(([key, value]) => `${key}=${value}`)
            .join(',');
    }

    toCloudTrace(): string {
        const isTraced = this.traceFlags === '01';
        return `${this.traceId}/${this.spanId};o=${isTraced ? '1' : '0'}`;
    }

    createChildSpan(): TraceContext {
        const childContext = new TraceContext();
        childContext.version = this.version;
        childContext.traceId = this.traceId;
        childContext.spanId = randomBytes(8).toString('hex');
        childContext.traceFlags = this.traceFlags;
        childContext.traceState = new Map(this.traceState);
        return childContext;
    }

    get currentTraceId(): string {
        return this.traceId;
    }

    get currentSpanId(): string {
        return this.spanId;
    }
}