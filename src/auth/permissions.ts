import type { WorkspaceRole } from '../types/domain'

export type Permission =
  | 'board:view'
  | 'task:view'
  | 'task:create'
  | 'task:edit'
  | 'task:delete'
  | 'task:move'
  | 'task:assign'
  | 'comment:create'
  | 'checklist:edit'
  | 'attachment:write'
  | 'workspace:manage'
  | 'members:manage'

const permissionsByRole: Record<WorkspaceRole, ReadonlySet<Permission>> = {
  ADMIN: new Set<Permission>([
    'board:view',
    'task:view',
    'task:create',
    'task:edit',
    'task:delete',
    'task:move',
    'task:assign',
    'comment:create',
    'checklist:edit',
    'attachment:write',
    'workspace:manage',
    'members:manage',
  ]),
  MEMBER: new Set<Permission>([
    'board:view',
    'task:view',
    'task:create',
    'task:edit',
    'task:move',
    'task:assign',
    'comment:create',
    'checklist:edit',
    'attachment:write',
  ]),
  VIEWER: new Set<Permission>(['board:view', 'task:view']),
}

export function can(role: WorkspaceRole | null | undefined, permission: Permission): boolean {
  return role ? permissionsByRole[role].has(permission) : false
}
