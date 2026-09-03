# @ambak/nest-logger

Structured logging for NestJS applications with request tracing, sensitive data sanitization, and optional GraphQL-aware request logging.

## Installation

```bash
npm install @ambak/nest-logger pino pino-pretty safe-stable-stringify
```

Required peer dependencies:

- `@nestjs/common`
- `@nestjs/core`
- `reflect-metadata`
- `rxjs`

Optional GraphQL support is enabled automatically when `@nestjs/graphql` is installed.

## Quick Start

```ts
import { Module } from '@nestjs/common';
import { LoggerModule } from '@ambak/nest-logger';

@Module({
  imports: [
    LoggerModule.forRoot({
      PROJECT_ID: 'ambak-prod',
      SERVICE_NAME: 'payments-api',
      LOG_LEVEL: 'info',
      LOG_FORMAT: 'json',
      LOG_TYPE: 'gcp'
    })
  ]
})
export class AppModule {}
```

The module attaches a global interceptor and exception filter for structured request, response, and error logs unless `LOG_REGISTER` is set to `0` or `1`.

## Usage

Inject a contextual child logger into providers:

```ts
import { Injectable } from '@nestjs/common';
import { InjectLogger, BaseLoggerService } from '@ambak/nest-logger';

@Injectable()
export class UsersService {
  @InjectLogger()
  private readonly logger!: BaseLoggerService;

  findAll() {
    this.logger.info({ message: 'Fetching users' });
    return [];
  }
}
```

Log method execution:

```ts
import { Injectable } from '@nestjs/common';
import { InjectLogger, LogMethod, BaseLoggerService } from '@ambak/nest-logger';

@Injectable()
export class PaymentsService {
  @InjectLogger()
  private readonly logger!: BaseLoggerService;

  @LogMethod({ includeArgs: true, includeResult: true })
  async createPayment(payload: Record<string, unknown>) {
    return { ok: true, payload };
  }
}
```

Access the current request context inside a controller:

```ts
import { Controller, Get } from '@nestjs/common';
import { GetRequestContext } from '@ambak/nest-logger';
import { RequestContext } from '@ambak/nest-logger';

@Controller('health')
export class HealthController {
  @Get()
  get(@GetRequestContext() context: RequestContext | undefined) {
    return { requestId: context?.requestId };
  }
}
```

## Configuration

| Option | Required | Description |
| --- | --- | --- |
| `PROJECT_ID` | Yes | Project or account identifier included in log records. |
| `SERVICE_NAME` | Yes | Service name used in logger metadata and resource fields. |
| `LOG_LEVEL` | No | Pino log level such as `trace`, `debug`, `info`, `warn`, `error`, or `fatal`. |
| `LOG_FORMAT` | No | `json` or `pretty`. Defaults to JSON output. |
| `LOG_TYPE` | No | `gcp` or `aws`. Controls log formatting conventions. |
| `LOGGER_NAME` | No | Overrides the logger name sent in the base log payload. |
| `LOG_REGISTER` | No | `0` disables logs, `1` uses raw console output, `2-5` use structured logging. |
| `LOGGER_SENSITIVE_FIELDS` | No | Comma-separated request/response fields to redact in addition to built-ins. |
| `LOGGER_SENSITIVE_HEADERS` | No | Comma-separated headers to redact in addition to built-ins. |
| `includeResource` | No | Adds resource metadata to formatted output when supported. |
| `includeTrace` | No | Adds trace correlation metadata when available. |

Built-in exclusions skip noisy endpoints such as `/health`, `/metrics`, and `/ready`.

## GraphQL Logging

When `@nestjs/graphql` is installed, GraphQL requests are logged automatically and include:

- operation type
- operation name
- resolver field name
- request variables and response payloads

From `v1.1.0`, GraphQL response and error logs also include operation metadata consistently.

## Notes

- Sensitive headers such as `authorization`, `cookie`, `x-api-key`, and `gateway-services` are redacted by default.
- Large payloads, base64 blobs, image URLs, and common PII patterns are sanitized before logging.
- The package publishes compiled files from `dist/` plus this README.
