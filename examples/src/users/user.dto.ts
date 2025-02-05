// examples/src/users/user.dto.ts

export class CreateUserDto {
    name!: string;
    email!: string;
    password!: string;
  }
  
  export class UpdateUserDto {
    name?: string;
    email?: string;
  }