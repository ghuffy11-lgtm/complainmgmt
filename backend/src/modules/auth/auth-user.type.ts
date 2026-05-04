/** Shape attached to req.user after JwtAuthGuard succeeds. */
export type AuthUser = {
  id: number;
  username: string;
  displayName: string;
  roleKeys: string[];
  permissions: Set<string>;     // "resource:action"
};
