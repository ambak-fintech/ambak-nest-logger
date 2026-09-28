const { AsyncLocalStorage } = require('async_hooks');
const { BaseLoggerService, InjectLogger } = require('../dist');
const { LOGGER_CONSTANTS } = require('../dist/config/constants');

describe('child logger transport leak', () => {
  const originalRegister = process.env.LOG_REGISTER;
  let root;

  beforeAll(() => {
    delete process.env.LOG_REGISTER;
    root = new BaseLoggerService({ LOG_LEVEL: 'info' }, new AsyncLocalStorage());
  });

  afterAll(() => {
    if (originalRegister === undefined) delete process.env.LOG_REGISTER;
    else process.env.LOG_REGISTER = originalRegister;
  });

  it('child() adds no process exit listeners', () => {
    const before = process.listenerCount('exit');
    for (let i = 0; i < 50; i++) root.child({ context: `ctx-${i}` });
    expect(process.listenerCount('exit')).toBe(before);
  });

  it('child() returns a working BaseLoggerService bound to the parent pino logger', () => {
    const child = root.child({ context: 'Child' });
    expect(child).toBeInstanceOf(BaseLoggerService);
    expect(() => child.info('hello')).not.toThrow();
    expect(child.child({ nested: true })).toBeInstanceOf(BaseLoggerService);
  });

  it('@InjectLogger returns one cached child per instance', () => {
    class Svc {}
    InjectLogger({ context: 'Svc' })(Svc.prototype, 'logger');
    const a = new Svc();
    const b = new Svc();
    a[LOGGER_CONSTANTS.LOGGER_TOKEN] = root;
    b[LOGGER_CONSTANTS.LOGGER_TOKEN] = root;

    const before = process.listenerCount('exit');
    for (let i = 0; i < 50; i++) a.logger.info('x');
    expect(a.logger).toBe(a.logger);
    expect(a.logger).not.toBe(b.logger);
    expect(process.listenerCount('exit')).toBe(before);
  });
});
