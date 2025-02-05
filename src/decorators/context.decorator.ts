// src/decorators/context.decorator.ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';
import { RequestContext } from '../context';
import { LOGGER_CONSTANTS } from '../config/constants';

export const GetRequestContext = createParamDecorator(
    (data: unknown, ctx: ExecutionContext) => {
        const asyncStorage = ctx.switchToHttp().getRequest()[
            LOGGER_CONSTANTS.ASYNC_STORAGE_TOKEN
        ] as AsyncLocalStorage<RequestContext>;
        
        return asyncStorage.getStore();
    }
);