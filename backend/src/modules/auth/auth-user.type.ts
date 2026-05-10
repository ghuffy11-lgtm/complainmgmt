/** Shape attached to req.user after JwtAuthGuard succeeds. */
export type AuthUser = {
  id: number;
  username: string;
  displayName: string;
  /** "Home" / primary department id, used to default form pickers. Null when
   *  the user isn't tied to one (typical for admin/manager accounts). */
  departmentId: string | null;
  /** Every active department the user belongs to (includes the primary).
   *  Used by `*.own:read` permissions to scope visibility. Empty array for
   *  users with no memberships (e.g. spanning admins). */
  departmentIds: string[];
  roleKeys: string[];
  permissions: Set<string>;     // "resource:action"
  /** True if the user has TOTP enrolled (set by PermissionsService.materialize
   *  from `users.totp_enrolled_at`). Drives the Profile UI's enroll-vs-disable
   *  affordance. */
  twoFactorEnrolled?: boolean;
};
