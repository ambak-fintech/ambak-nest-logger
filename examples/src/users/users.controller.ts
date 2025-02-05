// examples/src/users/users.controller.ts

import { 
    Controller, 
    Get, 
    Post, 
    Put, 
    Param, 
    Body, 
    NotFoundException 
  } from '@nestjs/common';
  import { 
    InjectLogger, 
    BaseLoggerService, 
    LogContext, 
    GetRequestContext 
  } from '@ambak/nest-logger';
  import { UsersService } from './users.service';
  import { CreateUserDto, UpdateUserDto } from './user.dto';
  
  @Controller('users')
  export class UsersController {
    @InjectLogger({ context: 'UsersController' })
    private readonly logger!: BaseLoggerService;
  
    constructor(private readonly usersService: UsersService) {}
  
    @Post()
    @LogContext({ includeArgs: true })
    async createUser(@Body() createUserDto: CreateUserDto) {
      // Password will be automatically redacted in logs
      return this.usersService.createUser(createUserDto);
    }
  
    @Get()
    async findAll() {
      this.logger.info('Retrieving all users');
      return this.usersService.findAll();
    }
  
    @Get(':id')
    async findOne(@Param('id') id: string) {
      const user = await this.usersService.findOne(Number(id));
      if (!user) {
        // This error will be automatically logged with context
        throw new NotFoundException(`User #${id} not found`);
      }
      return user;
    }
  
    @Put(':id')
    async updateUser(
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto
    ) {
        try {
            return await this.usersService.update(Number(id), updateUserDto);
        } catch (error) {
            if (error instanceof Error) {
            // Error will be automatically logged with stack trace and context
            throw new NotFoundException(error.message);
            } else {
            // Handle non-Error cases (optional)
            throw new NotFoundException('An unknown error occurred');
            }
        }
    }

  }