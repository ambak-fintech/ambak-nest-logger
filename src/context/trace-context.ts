// src/context/trace-context.ts
import { randomBytes } from 'crypto';

export class TraceContext {
    private version: string = '00';
    private traceId: string = '';
    private spanId: string = '';
    private traceFlags: string = '01';
    private traceState: Map<string, string> = new Map();

    static generateNew(awsFormat: boolean = false): TraceContext {
        const context = new TraceContext();
        
        if (awsFormat) {
            // Generate AWS X-Ray format: 1-{timestamp}-{traceId}
            const epochSeconds = Math.floor(Date.now() / 1000);
            const hexTimestamp = epochSeconds.toString(16).padStart(8, '0').toLowerCase();
            const traceIdHex = randomBytes(12).toString('hex').toLowerCase(); // 24 hex chars
            context.traceId = `1-${hexTimestamp}-${traceIdHex}`;
        } else {
            // Generate standard W3C format (32 hex chars)
            context.traceId = randomBytes(16).toString('hex');
        }
        
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

    static parseXAmznTraceId(header?: string): TraceContext {
        const context = new TraceContext();

        if (!header) {
            return TraceContext.generateNew(true);
        }

        try {
            // Format: Root=1-{timestamp}-{traceId};Parent={spanId};Sampled={0|1}
            // Example: Root=1-69313ce7-190b8f6099d578eaf1f561bc;Parent=745315306bfc9ca3;Sampled=1
            
            // Remove quotes if present
            header = header.replace(/^["']|["']$/g, '');
            
            const parts = header.split(';');
            let rootPart = '';
            let parentPart = '';
            let sampled = '1';

            for (const part of parts) {
                const trimmed = part.trim();
                if (trimmed.startsWith('Root=')) {
                    rootPart = trimmed.substring(5); // Remove 'Root='
                } else if (trimmed.startsWith('Parent=')) {
                    parentPart = trimmed.substring(7); // Remove 'Parent='
                } else if (trimmed.startsWith('Sampled=')) {
                    sampled = trimmed.substring(8); // Remove 'Sampled='
                }
            }

            if (!rootPart) {
                return TraceContext.generateNew(true);
            }

            // Extract trace ID from Root format: 1-{timestamp}-{traceId}
            // Store the full AWS format as traceId
            const rootParts = rootPart.split('-');
            if (rootParts.length >= 3) {
                // Full AWS trace ID format: 1-{timestamp}-{traceId}
                // Store the full AWS format as traceId
                context.traceId = rootPart; // Keep as 1-{timestamp}-{traceId} format
            } else {
                // Fallback: use the rootPart as-is
                context.traceId = rootPart;
            }

            // Extract span ID from Parent
            if (parentPart) {
                // AWS span ID is 16 hex chars, convert to our format (8 bytes = 16 hex)
                context.spanId = parentPart.replace(/[^0-9a-f]/gi, '').slice(0, 16).padStart(16, '0').toLowerCase();
            } else {
                context.spanId = randomBytes(8).toString('hex');
            }
            
            context.traceFlags = (sampled === '0' ? '00' : '01');

            return context;
        } catch {
            return TraceContext.generateNew(true);
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

    toXAmznTraceId(): string {
        // If traceId is already in AWS format (1-{timestamp}-{traceId}), use it directly
        if (typeof this.traceId === 'string' && /^1-[0-9a-f]{8}-[0-9a-f]{24}$/i.test(this.traceId)) {
            const spanIdHex = this.spanId.replace(/[^0-9a-f]/gi, '').slice(0, 16).padStart(16, '0').toLowerCase();
            const sampled = this.traceFlags === '01' ? '1' : '0';
            return `Root=${this.traceId};Parent=${spanIdHex};Sampled=${sampled}`;
        }

        // Convert standard trace ID to AWS format
        const epochSeconds = Math.floor(Date.now() / 1000);
        const hexTimestamp = epochSeconds.toString(16).padStart(8, '0').toLowerCase();
        const traceIdHex = this.traceId.replace(/[^0-9a-f]/gi, '').slice(0, 24).padStart(24, '0').toLowerCase();
        const awsTraceId = `1-${hexTimestamp}-${traceIdHex}`;

        const spanIdHex = this.spanId.replace(/[^0-9a-f]/gi, '').slice(0, 16).padStart(16, '0').toLowerCase();
        const sampled = this.traceFlags === '01' ? '1' : '0';

        return `Root=${awsTraceId};Parent=${spanIdHex};Sampled=${sampled}`;
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