import { Controller, Get } from '@nestjs/common';
import { PermissionsService } from './permissions.service';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';

@Controller('permissions')
export class PermissionsController {
  constructor(private readonly perms: PermissionsService) {}

  @Get()
  @RequirePermissions('admin.roles:read')
  list() {
    return this.perms.listAllPermissions();
  }
}
