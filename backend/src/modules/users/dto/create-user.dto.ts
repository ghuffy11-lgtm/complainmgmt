import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateUserDto {
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  username!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  displayName!: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @IsString()
  @MinLength(10)
  @MaxLength(200)
  password!: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  roleIds?: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  displayName?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class SetUserRolesDto {
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  roleIds!: string[];
}

export class ResetPasswordDto {
  @IsString()
  @MinLength(10)
  @MaxLength(200)
  newPassword!: string;
}
