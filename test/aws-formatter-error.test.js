require('reflect-metadata');
const http = require('http');
const { Test } = require('@nestjs/testing');
const { Controller, Get, ConflictException, BadRequestException } = require('@nestjs/common');
const { BaseLoggerService, LoggerModule } = require('../dist');
const { formatAwsLog } = require('../dist/utils/aws-formatter');
const { formatJsonLog } = require('../dist/utils/formatters');

// Shape of the log object LoggingInterceptor / HttpExceptionFilter build for a failed request.
const failedRequestLog = (overrides = {}) => ({
  LOG_TYPE: 'aws',
  type: 'error',
  requestId: 'abc12345',
  error: {
    type: 'ConflictException',
    message: 'Resource already exists and cannot be modified.',
    statusCode: 409,
    stack: 'ConflictException: Resource already exists ...\n    at ItemService.update (item.service.ts:42:13)',
  },
  response: { statusCode: 409, response_time_ms: 1.5 },
  httpRequest: { requestMethod: 'POST', requestUrl: '/items/1/actions' },
  ...overrides,
});

describe('formatAwsLog keeps the exception', () => {
  it('uses error.message as the message when the line has none, and keeps the error with its stack', () => {
    const out = formatAwsLog(failedRequestLog());
    expect(out.message).toBe('Resource already exists and cannot be modified.');
    expect(out.error).toMatchObject({ type: 'ConflictException', statusCode: 409 });
    expect(out.error.stack).toContain('item.service.ts:42');
    expect(out.type).toBe('error');
    expect(out.response.statusCode).toBe(409);
  });

  it('keeps an explicit message over error.message, and still keeps the error', () => {
    const out = formatAwsLog(failedRequestLog({ message: 'explicit' }));
    expect(out.message).toBe('explicit');
    expect(out.error.message).toContain('already exists');
  });

  it('adds nothing when there is no error', () => {
    const out = formatAwsLog({ LOG_TYPE: 'aws', type: 'api', message: 'hello', requestId: 'r1' });
    expect(out.message).toBe('hello');
    expect('error' in out).toBe(false);
  });

  it('leaves message unset when the error has no message text, but keeps the error', () => {
    const out = formatAwsLog(failedRequestLog({ error: { type: 'X', statusCode: 500 } }));
    expect(out.message).toBeUndefined();
    expect(out.error).toEqual({ type: 'X', statusCode: 500 });
  });

  it('accepts a plain string error', () => {
    const out = formatAwsLog(failedRequestLog({ error: 'boom' }));
    expect(out.message).toBe('boom');
    expect(out.error).toBe('boom');
  });

  it('does not change non-aws output', () => {
    const log = failedRequestLog({ LOG_TYPE: 'gcp' });
    expect(formatAwsLog(log)).toBe(log);
    expect(formatJsonLog(log).error.stack).toContain('item.service.ts:42');
  });
});

describe('real request through LoggerModule (LOG_TYPE=aws)', () => {
  const realConsole = { ...console };
  let app;
  let port;
  let warn;

  class ErrController {
    conflict() {
      throw new ConflictException('Resource already exists and cannot be modified.');
    }
    bad() {
      throw new BadRequestException("'name' is required.");
    }
  }
  Controller('t')(ErrController);
  ['conflict', 'bad'].forEach((name) =>
    Get(name)(ErrController.prototype, name, Object.getOwnPropertyDescriptor(ErrController.prototype, name)),
  );

  const get = (path) =>
    new Promise((resolve, reject) => {
      http.get({ port, path }, (res) => {
        res.resume();
        res.on('end', () => resolve(res.statusCode));
      }).on('error', reject);
    });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        LoggerModule.forRoot({
          LOG_LEVEL: 'silent',
          SERVICE_NAME: 'test',
          PROJECT_ID: 'test',
          LOG_TYPE: 'aws',
        }),
      ],
      controllers: [ErrController],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0);
    port = app.getHttpServer().address().port;
    warn = jest.spyOn(BaseLoggerService.prototype, 'warn');
  });

  afterAll(async () => {
    warn.mockRestore();
    await app.close();
    Object.assign(console, realConsole); // LoggerModule replaces global console methods
  });

  it.each([
    ['conflict', 409, 'Resource already exists and cannot be modified.', 'ConflictException'],
    ['bad', 400, "'name' is required.", 'BadRequestException'],
  ])('%s: the log line carries the reason and the stack', async (path, status, message, type) => {
    warn.mockClear();
    expect(await get(`/t/${path}`)).toBe(status);
    const lines = warn.mock.calls.map((c) => c[0]).filter((l) => l?.error);
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(line.type).toBe('error');
      expect(line.message).toBe(message);
      expect(line.error.type).toBe(type);
      expect(line.error.stack).toContain(`ErrController.${path}`);
    }
  });
});
