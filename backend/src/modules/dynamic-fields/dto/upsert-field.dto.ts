import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { DynamicFieldType, FieldLocking } from '../entities/dynamic-field.entity';

const TYPES: DynamicFieldType[] = ['text', 'number', 'date', 'dropdown', 'file'];
const LOCKINGS: FieldLocking[] = ['none', 'first_writer_wins'];

export class FieldVisibilityDto {
  // Either the literal "*" or an array of role keys.
  @IsOptional()
  roles?: '*' | string[];
}

export class CreateFieldDto {
  @IsString() @MinLength(2) @MaxLength(60) @Matches(/^[a-z][a-z0-9_]*$/, {
    message: 'key must be lower-snake-case and start with a letter',
  })
  key!: string;

  @IsString() @MinLength(1) @MaxLength(120) label!: string;

  @IsIn(TYPES) type!: DynamicFieldType;

  @IsOptional() @IsBoolean() isRequired?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsBoolean() isSearchable?: boolean;
  @IsOptional() sortOrder?: number;

  @IsOptional() @IsObject() validation?: Record<string, unknown>;

  @IsOptional() @ValidateNested() @Type(() => FieldVisibilityDto)
  visibility?: FieldVisibilityDto;

  @IsOptional() @IsIn(LOCKINGS) locking?: FieldLocking;
}

export class UpdateFieldDto {
  // `key` and `type` are intentionally absent — both are immutable after create.

  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) label?: string;
  @IsOptional() @IsBoolean() isRequired?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsBoolean() isSearchable?: boolean;
  @IsOptional() sortOrder?: number;
  @IsOptional() @IsObject() validation?: Record<string, unknown>;
  @IsOptional() @ValidateNested() @Type(() => FieldVisibilityDto) visibility?: FieldVisibilityDto;
  @IsOptional() @IsIn(LOCKINGS) locking?: FieldLocking;
}

export class FieldOptionInputDto {
  @IsOptional() @IsString() id?: string;     // existing option id, if updating in-place
  @IsString() @MinLength(1) @MaxLength(100) value!: string;
  @IsString() @MinLength(1) @MaxLength(120) label!: string;
  @IsOptional() sortOrder?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class ReplaceOptionsDto {
  @IsArray() @ArrayUnique((o: FieldOptionInputDto) => o.value)
  @ValidateNested({ each: true })
  @Type(() => FieldOptionInputDto)
  options!: FieldOptionInputDto[];
}
