import { IsString, MinLength, MaxLength } from 'class-validator';

export class LoginDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  username!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  password!: string;
}
