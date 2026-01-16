/**
 * Role-Based Access Control (RBAC) utilities
 *
 * Roles:
 * - admin: Full access to all admin features
 * - editor: Can create/edit catalog items, but not delete or manage users
 * - viewer: Read-only access to admin dashboard
 */

// Define user roles
export type UserRole = 'admin' | 'editor' | 'viewer'

// Role hierarchy (higher index = more permissions)
const ROLE_HIERARCHY: UserRole[] = ['viewer', 'editor', 'admin']

/**
 * Permission definitions for different operations
 */
export const Permissions = {
  // Catalog permissions
  CATALOG_VIEW: 'catalog:view',
  CATALOG_CREATE: 'catalog:create',
  CATALOG_EDIT: 'catalog:edit',
  CATALOG_DELETE: 'catalog:delete',

  // User management permissions
  USERS_VIEW: 'users:view',
  USERS_MANAGE: 'users:manage',

  // Admin dashboard permissions
  ADMIN_VIEW: 'admin:view',
  ADMIN_SETTINGS: 'admin:settings',

  // Tag/Author/MCP management
  METADATA_VIEW: 'metadata:view',
  METADATA_MANAGE: 'metadata:manage',
} as const

export type Permission = typeof Permissions[keyof typeof Permissions]

/**
 * Role-to-Permission mapping
 */
const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  viewer: [
    Permissions.ADMIN_VIEW,
    Permissions.CATALOG_VIEW,
    Permissions.USERS_VIEW,
    Permissions.METADATA_VIEW,
  ],
  editor: [
    Permissions.ADMIN_VIEW,
    Permissions.CATALOG_VIEW,
    Permissions.CATALOG_CREATE,
    Permissions.CATALOG_EDIT,
    Permissions.USERS_VIEW,
    Permissions.METADATA_VIEW,
    Permissions.METADATA_MANAGE,
  ],
  admin: [
    Permissions.ADMIN_VIEW,
    Permissions.ADMIN_SETTINGS,
    Permissions.CATALOG_VIEW,
    Permissions.CATALOG_CREATE,
    Permissions.CATALOG_EDIT,
    Permissions.CATALOG_DELETE,
    Permissions.USERS_VIEW,
    Permissions.USERS_MANAGE,
    Permissions.METADATA_VIEW,
    Permissions.METADATA_MANAGE,
  ],
}

/**
 * Check if a role has a specific permission
 */
export function hasPermission(role: UserRole | undefined | null, permission: Permission): boolean {
  if (!role) return false
  const permissions = ROLE_PERMISSIONS[role]
  return permissions?.includes(permission) ?? false
}

/**
 * Check if a role has any of the given permissions
 */
export function hasAnyPermission(role: UserRole | undefined | null, permissions: Permission[]): boolean {
  return permissions.some(permission => hasPermission(role, permission))
}

/**
 * Check if a role has all of the given permissions
 */
export function hasAllPermissions(role: UserRole | undefined | null, permissions: Permission[]): boolean {
  return permissions.every(permission => hasPermission(role, permission))
}

/**
 * Check if role1 has equal or higher rank than role2
 */
export function hasRoleOrHigher(role1: UserRole | undefined | null, role2: UserRole): boolean {
  if (!role1) return false
  const index1 = ROLE_HIERARCHY.indexOf(role1)
  const index2 = ROLE_HIERARCHY.indexOf(role2)
  return index1 >= index2
}

/**
 * Get all permissions for a role
 */
export function getPermissionsForRole(role: UserRole): Permission[] {
  return ROLE_PERMISSIONS[role] || []
}

/**
 * Get the minimum role required for a permission
 */
export function getMinimumRoleForPermission(permission: Permission): UserRole | null {
  for (const role of ROLE_HIERARCHY) {
    if (hasPermission(role, permission)) {
      return role
    }
  }
  return null
}

/**
 * Check if a role can perform CRUD operations
 */
export function canCreate(role: UserRole | undefined | null): boolean {
  return hasPermission(role, Permissions.CATALOG_CREATE)
}

export function canEdit(role: UserRole | undefined | null): boolean {
  return hasPermission(role, Permissions.CATALOG_EDIT)
}

export function canDelete(role: UserRole | undefined | null): boolean {
  return hasPermission(role, Permissions.CATALOG_DELETE)
}

export function canManageUsers(role: UserRole | undefined | null): boolean {
  return hasPermission(role, Permissions.USERS_MANAGE)
}

/**
 * Role labels for UI display
 */
export const ROLE_LABELS: Record<UserRole, { label: string; description: string; color: string }> = {
  admin: {
    label: 'Admin',
    description: 'Full access to all admin features including user management and deletion',
    color: 'bg-red-500/20 text-red-400 border-red-500/30',
  },
  editor: {
    label: 'Editor',
    description: 'Can create and edit catalog items, but cannot delete or manage users',
    color: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  },
  viewer: {
    label: 'Viewer',
    description: 'Read-only access to the admin dashboard',
    color: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  },
}

/**
 * Validate role string
 */
export function isValidRole(role: unknown): role is UserRole {
  return typeof role === 'string' && ROLE_HIERARCHY.includes(role as UserRole)
}

/**
 * Get all available roles
 */
export function getAllRoles(): UserRole[] {
  return [...ROLE_HIERARCHY]
}

// ============================================
// Server-side utilities (require auth import)
// These are separated to allow pure utility functions
// to be imported without auth dependency
// ============================================

/**
 * API route helper: Require specific permission
 * Returns error response if user doesn't have permission, null otherwise
 * NOTE: This is an async function that imports auth dynamically
 */
export async function requirePermission(
  permission: Permission
): Promise<import('next/server').NextResponse | null> {
  // Dynamic import to avoid circular dependencies
  const { auth } = await import('@/lib/core/auth')
  const { ApiErrors } = await import('@/lib/utils/api-utils')

  const session = await auth()

  if (!session?.user) {
    return ApiErrors.unauthorized('Authentication required')
  }

  const userRole = session.user.role as UserRole | undefined

  if (!hasPermission(userRole, permission)) {
    return ApiErrors.forbidden(`Permission denied: ${permission}`)
  }

  return null
}

/**
 * API route helper: Require minimum role
 * Returns error response if user doesn't have required role, null otherwise
 */
export async function requireRole(
  minimumRole: UserRole
): Promise<import('next/server').NextResponse | null> {
  const { auth } = await import('@/lib/core/auth')
  const { ApiErrors } = await import('@/lib/utils/api-utils')

  const session = await auth()

  if (!session?.user) {
    return ApiErrors.unauthorized('Authentication required')
  }

  const userRole = session.user.role as UserRole | undefined

  if (!hasRoleOrHigher(userRole, minimumRole)) {
    return ApiErrors.forbidden(`Role '${minimumRole}' or higher required`)
  }

  return null
}

/**
 * Get user role from session (server-side)
 */
export async function getUserRole(): Promise<UserRole | null> {
  const { auth } = await import('@/lib/core/auth')
  const session = await auth()
  return (session?.user?.role as UserRole) || null
}

/**
 * Check if the current user is an admin (server-side)
 */
export async function isAdmin(): Promise<boolean> {
  const role = await getUserRole()
  return role === 'admin'
}
