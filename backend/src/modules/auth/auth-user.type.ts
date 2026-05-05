/** Shape attached to req.user after JwtAuthGuard succeeds. */
export type AuthUser = {
  id: number;
  username: string;
  displayName: string;
  /** "Home" department id, used by the scoped user dashboard. Null when the
   *  user isn't tied to one (typical for admin/manager accounts). */
  departmentId: string | null;
  roleKeys: string[];
  permissions: Set<string>;     // "resource:action"
};
