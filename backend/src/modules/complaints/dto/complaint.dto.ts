import {
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { ComplaintPriority, ComplaintStatus } from '../entities/complaint.entity';

const STATUSES: ComplaintStatus[] = ['open', 'in_progress', 'resolved', 'closed', 'rejected'];
const PRIORITIES: ComplaintPriority[] = ['low', 'normal', 'high', 'critical'];

export class CreateComplaintDto {
  @IsObject()
  values!: Record<string, unknown>;

  @IsOptional() @IsIn(PRIORITIES) priority?: ComplaintPriority;

  @IsOptional() @IsString() departmentId?: string;
  @IsOptional() @IsString() assignedTo?: string;
  @IsOptional() @IsString() @MaxLength(500) assignmentNote?: string;
}

export class UpdateComplaintDto {
  @IsOptional() @IsObject() values?: Record<string, unknown>;
}

export class UpdateStatusDto {
  @IsIn(STATUSES) status!: ComplaintStatus;
}

export class UpdatePriorityDto {
  @IsIn(PRIORITIES) priority!: ComplaintPriority;
}

export class AssignDto {
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsString()
  departmentId?: string | null;

  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsString()
  assignedTo?: string | null;

  @IsOptional() @IsString() @MaxLength(500)
  note?: string;
}
