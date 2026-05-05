import {
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { ComplaintPriority, ComplaintStatus } from '../entities/complaint.entity';

const STATUSES: ComplaintStatus[] = ['open', 'in_progress', 'resolved', 'closed', 'rejected'];
const PRIORITIES: ComplaintPriority[] = ['low', 'normal', 'high', 'critical'];

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATE_MSG = { message: 'must be YYYY-MM-DD' };

export class CreateComplaintDto {
  @IsObject()
  values!: Record<string, unknown>;

  @IsOptional() @IsIn(PRIORITIES) priority?: ComplaintPriority;

  @IsOptional() @IsString() departmentId?: string;
  @IsOptional() @IsString() assignedTo?: string;
  @IsOptional() @IsString() @MaxLength(500) assignmentNote?: string;

  /**
   * The date the complaint actually occurred (event date), as YYYY-MM-DD.
   * Optional — operators may not know it yet at submission time.
   */
  @IsOptional() @IsString() @Matches(ISO_DATE_REGEX, ISO_DATE_MSG)
  complaintDate?: string;
}

export class UpdateComplaintDto {
  @IsOptional() @IsObject() values?: Record<string, unknown>;

  /**
   * Update or clear the complaint date. Pass `null` to clear, omit to leave
   * unchanged, pass a string to set.
   */
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString() @Matches(ISO_DATE_REGEX, ISO_DATE_MSG)
  complaintDate?: string | null;
}

export class UpdateStatusDto {
  @IsIn(STATUSES) status!: ComplaintStatus;
  /**
   * Optional note recorded on the audit row. Particularly useful for
   * reopens (status moving out of closed/resolved) so reviewers see why.
   */
  @IsOptional() @IsString() @MaxLength(500) note?: string;
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
