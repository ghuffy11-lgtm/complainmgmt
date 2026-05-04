/**
 * Permission resolution.
 *
 * A permission key is "<resource>:<action>". Resources may include wildcards
 * with "*" as the last segment (e.g. "complaint.field:*"). Actions are exact.
 *
 * has(perms, "complaint.field:investigation:write") returns true if any of:
 *   - "complaint.field:investigation:write"
 *   - "complaint.field:*:write"
 *   - "*:write"     (only seeded for explicit super-permissions)
 */
export function hasPermission(perms: Set<string>, required: string): boolean {
  if (perms.has(required)) return true;

  const lastColon = required.lastIndexOf(':');
  if (lastColon < 0) return false;
  const resource = required.slice(0, lastColon);
  const action = required.slice(lastColon + 1);

  // Wildcard at the last colon boundary:
  // "complaint.field:investigation" → check "complaint.field:*"
  const lastResColon = resource.lastIndexOf(':');
  if (lastResColon >= 0) {
    const wildcardResource = resource.slice(0, lastResColon) + ':*';
    if (perms.has(`${wildcardResource}:${action}`)) return true;
  }

  // Top-level "*:action" — reserved, opt-in only via seed.
  if (perms.has(`*:${action}`)) return true;

  return false;
}
