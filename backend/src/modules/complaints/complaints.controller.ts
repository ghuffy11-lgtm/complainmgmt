import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ComplaintsService } from './complaints.service';
import {
  AssignDto,
  CreateComplaintDto,
  UpdateComplaintDto,
  UpdatePriorityDto,
  UpdateStatusDto,
} from './dto/complaint.dto';
import {
  RequireAnyPermission,
  RequirePermissions,
} from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthUser } from '../auth/auth-user.type';
import { ComplaintPriority, ComplaintStatus } from './entities/complaint.entity';

@Controller('complaints')
export class ComplaintsController {
  constructor(private readonly complaints: ComplaintsService) {}

  @Get()
  @RequireAnyPermission('complaint:read', 'complaint.own:read')
  async list(
    @CurrentUser() actor: AuthUser,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '25',
    @Query('status') status?: ComplaintStatus,
    @Query('priority') priority?: ComplaintPriority,
    @Query('assignedTo') assignedTo?: string,
    @Query('departmentId') departmentId?: string,
    @Query('originId') originId?: string,
    @Query('subcategoryId') subcategoryId?: string,
    @Query('q') q?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    /**
     * Express + qs parses `?fv[mobile_number]=555` as `fv: { mobile_number: '555' }`.
     * Sanitised below — strings only, ignored otherwise.
     */
    @Query('fv') fvRaw?: unknown,
  ) {
    const p = Math.max(1, parseInt(page, 10) || 1);
    const ps = Math.min(200, Math.max(1, parseInt(pageSize, 10) || 25));
    const fv = sanitiseFv(fvRaw);
    const r = await this.complaints.list(
      {
        page: p, pageSize: ps,
        status, priority, assignedTo, departmentId, q,
        dateFrom, dateTo,
        originId, subcategoryId,
        fv,
      },
      actor,
    );
    return { data: r.data, meta: { page: p, pageSize: ps, total: r.total } };
  }

  @Get(':id')
  @RequireAnyPermission('complaint:read', 'complaint.own:read')
  detail(@Param('id') id: string, @CurrentUser() actor: AuthUser) {
    return this.complaints.detail(id, actor);
  }

  @Post()
  @RequirePermissions('complaint:create')
  create(@Body() dto: CreateComplaintDto, @CurrentUser() actor: AuthUser) {
    return this.complaints.create(dto, actor);
  }

  @Patch(':id')
  @RequirePermissions('complaint:update')
  update(@Param('id') id: string, @Body() dto: UpdateComplaintDto, @CurrentUser() actor: AuthUser) {
    return this.complaints.update(id, dto, actor);
  }

  @Patch(':id/status')
  @RequirePermissions('complaint:update')
  setStatus(@Param('id') id: string, @Body() dto: UpdateStatusDto, @CurrentUser() actor: AuthUser) {
    return this.complaints.setStatus(id, dto.status, actor, dto.note);
  }

  @Patch(':id/priority')
  @RequirePermissions('complaint:update')
  setPriority(@Param('id') id: string, @Body() dto: UpdatePriorityDto, @CurrentUser() actor: AuthUser) {
    return this.complaints.setPriority(id, dto.priority, actor);
  }

  @Post(':id/assign')
  @RequirePermissions('complaint:assign')
  @HttpCode(200)
  assign(@Param('id') id: string, @Body() dto: AssignDto, @CurrentUser() actor: AuthUser) {
    return this.complaints.assign(
      id,
      {
        departmentId: dto.departmentId ?? null,
        userId: dto.assignedTo ?? null,
        note: dto.note,
      },
      actor,
    );
  }
}

/**
 * Defensive: qs may parse weird query strings into shapes other than a flat
 * `Record<string, string>`. Anything not a plain object → undefined; nested
 * non-string values → dropped. The downstream service still rejects unknown
 * or non-searchable keys.
 */
function sanitiseFv(raw: unknown): Record<string, string> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === 'string' && v.trim() !== '') out[k] = v;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}
