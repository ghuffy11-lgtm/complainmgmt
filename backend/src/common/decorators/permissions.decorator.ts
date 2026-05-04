import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'requiredPermissions';
export const ANY_PERMISSIONS_KEY = 'requiredAnyPermissions';

/** Caller must hold ALL of these permissions. */
export const RequirePermissions = (...perms: string[]) => SetMetadata(PERMISSIONS_KEY, perms);

/** Caller must hold AT LEAST ONE of these permissions. */
export const RequireAnyPermission = (...perms: string[]) => SetMetadata(ANY_PERMISSIONS_KEY, perms);
