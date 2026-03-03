import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
  hasRoleOrHigher,
  getPermissionsForRole,
  getMinimumRoleForPermission,
  canCreate,
  canEdit,
  canDelete,
  canManageUsers,
  isValidRole,
  getAllRoles,
  Permissions,
  ROLE_LABELS,
  type UserRole,
  hasOrgPermission,
  hasOrgRoleOrHigher,
  isValidOrgRole,
  getAllOrgRoles,
  ORG_ROLE_LABELS,
  isSuperAdmin,
  type OrgRole,
} from '@/lib/security/rbac'

// Mock auth module for server-side function tests
vi.mock('@/lib/core/auth', () => ({
  auth: vi.fn(),
}))

// Mock api-utils module for server-side function tests
vi.mock('@/lib/utils/api-utils', () => ({
  ApiErrors: {
    unauthorized: (message: string) => ({
      type: 'unauthorized',
      status: 401,
      message,
    }),
    forbidden: (message: string) => ({
      type: 'forbidden',
      status: 403,
      message,
    }),
  },
}))

describe('RBAC Utilities', () => {
  describe('hasPermission', () => {
    it('returns true when admin has CATALOG_DELETE permission', () => {
      expect(hasPermission('admin', Permissions.CATALOG_DELETE)).toBe(true)
    })

    it('returns false when editor has CATALOG_DELETE permission', () => {
      expect(hasPermission('editor', Permissions.CATALOG_DELETE)).toBe(false)
    })

    it('returns true when editor has CATALOG_CREATE permission', () => {
      expect(hasPermission('editor', Permissions.CATALOG_CREATE)).toBe(true)
    })

    it('returns true when viewer has CATALOG_VIEW permission', () => {
      expect(hasPermission('viewer', Permissions.CATALOG_VIEW)).toBe(true)
    })

    it('returns false when viewer has CATALOG_CREATE permission', () => {
      expect(hasPermission('viewer', Permissions.CATALOG_CREATE)).toBe(false)
    })

    it('returns false for undefined role', () => {
      expect(hasPermission(undefined, Permissions.CATALOG_VIEW)).toBe(false)
    })

    it('returns false for null role', () => {
      expect(hasPermission(null, Permissions.CATALOG_VIEW)).toBe(false)
    })
  })

  describe('hasAnyPermission', () => {
    it('returns true when role has at least one of the permissions', () => {
      expect(hasAnyPermission('editor', [Permissions.CATALOG_DELETE, Permissions.CATALOG_CREATE])).toBe(true)
    })

    it('returns false when role has none of the permissions', () => {
      expect(hasAnyPermission('viewer', [Permissions.CATALOG_DELETE, Permissions.CATALOG_CREATE])).toBe(false)
    })

    it('returns false for undefined role', () => {
      expect(hasAnyPermission(undefined, [Permissions.CATALOG_VIEW])).toBe(false)
    })
  })

  describe('hasAllPermissions', () => {
    it('returns true when role has all permissions', () => {
      expect(hasAllPermissions('admin', [Permissions.CATALOG_VIEW, Permissions.CATALOG_DELETE])).toBe(true)
    })

    it('returns false when role is missing one permission', () => {
      expect(hasAllPermissions('editor', [Permissions.CATALOG_VIEW, Permissions.CATALOG_DELETE])).toBe(false)
    })

    it('returns false for undefined role', () => {
      expect(hasAllPermissions(undefined, [Permissions.CATALOG_VIEW])).toBe(false)
    })
  })

  describe('hasRoleOrHigher', () => {
    it('admin has higher or equal role than viewer', () => {
      expect(hasRoleOrHigher('admin', 'viewer')).toBe(true)
    })

    it('admin has higher or equal role than editor', () => {
      expect(hasRoleOrHigher('admin', 'editor')).toBe(true)
    })

    it('admin has higher or equal role than admin', () => {
      expect(hasRoleOrHigher('admin', 'admin')).toBe(true)
    })

    it('editor has higher or equal role than viewer', () => {
      expect(hasRoleOrHigher('editor', 'viewer')).toBe(true)
    })

    it('editor does not have higher role than admin', () => {
      expect(hasRoleOrHigher('editor', 'admin')).toBe(false)
    })

    it('viewer does not have higher role than editor', () => {
      expect(hasRoleOrHigher('viewer', 'editor')).toBe(false)
    })

    it('viewer has equal role to viewer', () => {
      expect(hasRoleOrHigher('viewer', 'viewer')).toBe(true)
    })

    it('returns false for undefined role', () => {
      expect(hasRoleOrHigher(undefined, 'viewer')).toBe(false)
    })

    it('returns false for null role', () => {
      expect(hasRoleOrHigher(null, 'viewer')).toBe(false)
    })
  })

  describe('getPermissionsForRole', () => {
    it('returns permissions for admin role', () => {
      const permissions = getPermissionsForRole('admin')
      expect(permissions).toContain(Permissions.CATALOG_DELETE)
      expect(permissions).toContain(Permissions.USERS_MANAGE)
      expect(permissions).toContain(Permissions.ADMIN_SETTINGS)
    })

    it('returns permissions for editor role', () => {
      const permissions = getPermissionsForRole('editor')
      expect(permissions).toContain(Permissions.CATALOG_CREATE)
      expect(permissions).toContain(Permissions.CATALOG_EDIT)
      expect(permissions).not.toContain(Permissions.CATALOG_DELETE)
      expect(permissions).not.toContain(Permissions.USERS_MANAGE)
    })

    it('returns permissions for viewer role', () => {
      const permissions = getPermissionsForRole('viewer')
      expect(permissions).toContain(Permissions.CATALOG_VIEW)
      expect(permissions).not.toContain(Permissions.ADMIN_VIEW)
      expect(permissions).not.toContain(Permissions.CATALOG_CREATE)
      expect(permissions).not.toContain(Permissions.CATALOG_EDIT)
    })
  })

  describe('getMinimumRoleForPermission', () => {
    it('returns viewer for CATALOG_VIEW permission', () => {
      expect(getMinimumRoleForPermission(Permissions.CATALOG_VIEW)).toBe('viewer')
    })

    it('returns editor for CATALOG_CREATE permission', () => {
      expect(getMinimumRoleForPermission(Permissions.CATALOG_CREATE)).toBe('editor')
    })

    it('returns admin for CATALOG_DELETE permission', () => {
      expect(getMinimumRoleForPermission(Permissions.CATALOG_DELETE)).toBe('admin')
    })

    it('returns admin for USERS_MANAGE permission', () => {
      expect(getMinimumRoleForPermission(Permissions.USERS_MANAGE)).toBe('admin')
    })
  })

  describe('convenience functions', () => {
    describe('canCreate', () => {
      it('returns true for admin', () => {
        expect(canCreate('admin')).toBe(true)
      })

      it('returns true for editor', () => {
        expect(canCreate('editor')).toBe(true)
      })

      it('returns false for viewer', () => {
        expect(canCreate('viewer')).toBe(false)
      })

      it('returns false for undefined', () => {
        expect(canCreate(undefined)).toBe(false)
      })
    })

    describe('canEdit', () => {
      it('returns true for admin', () => {
        expect(canEdit('admin')).toBe(true)
      })

      it('returns true for editor', () => {
        expect(canEdit('editor')).toBe(true)
      })

      it('returns false for viewer', () => {
        expect(canEdit('viewer')).toBe(false)
      })
    })

    describe('canDelete', () => {
      it('returns true for admin', () => {
        expect(canDelete('admin')).toBe(true)
      })

      it('returns false for editor', () => {
        expect(canDelete('editor')).toBe(false)
      })

      it('returns false for viewer', () => {
        expect(canDelete('viewer')).toBe(false)
      })
    })

    describe('canManageUsers', () => {
      it('returns true for admin', () => {
        expect(canManageUsers('admin')).toBe(true)
      })

      it('returns false for editor', () => {
        expect(canManageUsers('editor')).toBe(false)
      })

      it('returns false for viewer', () => {
        expect(canManageUsers('viewer')).toBe(false)
      })
    })
  })

  describe('isValidRole', () => {
    it('returns true for valid roles', () => {
      expect(isValidRole('admin')).toBe(true)
      expect(isValidRole('editor')).toBe(true)
      expect(isValidRole('viewer')).toBe(true)
    })

    it('returns false for invalid roles', () => {
      expect(isValidRole('superadmin')).toBe(false)
      expect(isValidRole('')).toBe(false)
      expect(isValidRole(null)).toBe(false)
      expect(isValidRole(undefined)).toBe(false)
      expect(isValidRole(123)).toBe(false)
    })
  })

  describe('getAllRoles', () => {
    it('returns all four roles including super_admin', () => {
      const roles = getAllRoles()
      expect(roles).toHaveLength(4)
      expect(roles).toContain('super_admin')
      expect(roles).toContain('admin')
      expect(roles).toContain('editor')
      expect(roles).toContain('viewer')
    })

    it('returns roles in hierarchy order (lowest to highest)', () => {
      const roles = getAllRoles()
      expect(roles[0]).toBe('viewer')
      expect(roles[1]).toBe('editor')
      expect(roles[2]).toBe('admin')
      expect(roles[3]).toBe('super_admin')
    })
  })

  describe('ROLE_LABELS', () => {
    it('has labels for all roles', () => {
      expect(ROLE_LABELS.admin).toBeDefined()
      expect(ROLE_LABELS.editor).toBeDefined()
      expect(ROLE_LABELS.viewer).toBeDefined()
    })

    it('each role has label, description, and color', () => {
      const roles: UserRole[] = ['admin', 'editor', 'viewer']
      roles.forEach(role => {
        expect(ROLE_LABELS[role].label).toBeDefined()
        expect(ROLE_LABELS[role].description).toBeDefined()
        expect(ROLE_LABELS[role].color).toBeDefined()
      })
    })
  })

  describe('Permissions constant', () => {
    it('has all expected permission types', () => {
      expect(Permissions.CATALOG_VIEW).toBe('catalog:view')
      expect(Permissions.CATALOG_CREATE).toBe('catalog:create')
      expect(Permissions.CATALOG_EDIT).toBe('catalog:edit')
      expect(Permissions.CATALOG_DELETE).toBe('catalog:delete')
      expect(Permissions.USERS_VIEW).toBe('users:view')
      expect(Permissions.USERS_MANAGE).toBe('users:manage')
      expect(Permissions.ADMIN_VIEW).toBe('admin:view')
      expect(Permissions.ADMIN_SETTINGS).toBe('admin:settings')
      expect(Permissions.METADATA_VIEW).toBe('metadata:view')
      expect(Permissions.METADATA_MANAGE).toBe('metadata:manage')
    })
  })

  describe('Role permission matrix', () => {
    it('viewer has only catalog view permission', () => {
      const viewerPermissions = getPermissionsForRole('viewer')
      // Should have catalog view only
      expect(viewerPermissions).toContain(Permissions.CATALOG_VIEW)
      // Should NOT have admin or write permissions
      expect(viewerPermissions).not.toContain(Permissions.ADMIN_VIEW)
      expect(viewerPermissions).not.toContain(Permissions.USERS_VIEW)
      expect(viewerPermissions).not.toContain(Permissions.METADATA_VIEW)
      expect(viewerPermissions).not.toContain(Permissions.CATALOG_CREATE)
      expect(viewerPermissions).not.toContain(Permissions.CATALOG_EDIT)
      expect(viewerPermissions).not.toContain(Permissions.CATALOG_DELETE)
      expect(viewerPermissions).not.toContain(Permissions.USERS_MANAGE)
      expect(viewerPermissions).not.toContain(Permissions.ADMIN_SETTINGS)
    })

    it('editor can create and edit but not delete', () => {
      const editorPermissions = getPermissionsForRole('editor')
      // Should have create/edit permissions
      expect(editorPermissions).toContain(Permissions.CATALOG_CREATE)
      expect(editorPermissions).toContain(Permissions.CATALOG_EDIT)
      expect(editorPermissions).toContain(Permissions.METADATA_MANAGE)
      // Should NOT have delete or user management
      expect(editorPermissions).not.toContain(Permissions.CATALOG_DELETE)
      expect(editorPermissions).not.toContain(Permissions.USERS_MANAGE)
      expect(editorPermissions).not.toContain(Permissions.ADMIN_SETTINGS)
    })

    it('admin has all non-super_admin permissions', () => {
      const adminPermissions = getPermissionsForRole('admin')
      // Admin should have all standard permissions
      expect(adminPermissions).toContain(Permissions.CATALOG_VIEW)
      expect(adminPermissions).toContain(Permissions.CATALOG_CREATE)
      expect(adminPermissions).toContain(Permissions.CATALOG_EDIT)
      expect(adminPermissions).toContain(Permissions.CATALOG_DELETE)
      expect(adminPermissions).toContain(Permissions.USERS_VIEW)
      expect(adminPermissions).toContain(Permissions.USERS_MANAGE)
      expect(adminPermissions).toContain(Permissions.ADMIN_VIEW)
      expect(adminPermissions).toContain(Permissions.ADMIN_SETTINGS)
      expect(adminPermissions).toContain(Permissions.METADATA_VIEW)
      expect(adminPermissions).toContain(Permissions.METADATA_MANAGE)
      // Admin should NOT have super_admin-only permissions
      expect(adminPermissions).not.toContain(Permissions.ORGS_VIEW)
      expect(adminPermissions).not.toContain(Permissions.ORGS_MANAGE)
      expect(adminPermissions).not.toContain(Permissions.ORGS_CREATE)
      expect(adminPermissions).not.toContain(Permissions.SUPER_ADMIN_ACCESS)
    })
  })
})

// Server-side function tests with mocking
describe('Server-side RBAC Functions', () => {
  let mockAuth: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    vi.clearAllMocks()
    const authModule = await import('@/lib/core/auth')
    mockAuth = vi.mocked(authModule.auth)
  })

  describe('requirePermission', () => {
    it('should return unauthorized error when user is not authenticated', async () => {
      mockAuth.mockResolvedValue(null)

      const { requirePermission } = await import('@/lib/security/rbac')
      const result = await requirePermission(Permissions.CATALOG_VIEW)

      expect(result).not.toBeNull()
      expect(result?.type).toBe('unauthorized')
      expect(result?.status).toBe(401)
    })

    it('should return unauthorized error when session has no user', async () => {
      mockAuth.mockResolvedValue({ user: null })

      const { requirePermission } = await import('@/lib/security/rbac')
      const result = await requirePermission(Permissions.CATALOG_VIEW)

      expect(result).not.toBeNull()
      expect(result?.type).toBe('unauthorized')
    })

    it('should return forbidden error when user lacks permission', async () => {
      mockAuth.mockResolvedValue({ user: { role: 'viewer' } })

      const { requirePermission } = await import('@/lib/security/rbac')
      const result = await requirePermission(Permissions.CATALOG_DELETE)

      expect(result).not.toBeNull()
      expect(result?.type).toBe('forbidden')
      expect(result?.status).toBe(403)
    })

    it('should return null when user has required permission', async () => {
      mockAuth.mockResolvedValue({ user: { role: 'admin' } })

      const { requirePermission } = await import('@/lib/security/rbac')
      const result = await requirePermission(Permissions.CATALOG_DELETE)

      expect(result).toBeNull()
    })

    it('should return null when editor has CATALOG_EDIT permission', async () => {
      mockAuth.mockResolvedValue({ user: { role: 'editor' } })

      const { requirePermission } = await import('@/lib/security/rbac')
      const result = await requirePermission(Permissions.CATALOG_EDIT)

      expect(result).toBeNull()
    })

    it('should return null when viewer has CATALOG_VIEW permission', async () => {
      mockAuth.mockResolvedValue({ user: { role: 'viewer' } })

      const { requirePermission } = await import('@/lib/security/rbac')
      const result = await requirePermission(Permissions.CATALOG_VIEW)

      expect(result).toBeNull()
    })
  })

  describe('requireRole', () => {
    it('should return unauthorized error when user is not authenticated', async () => {
      mockAuth.mockResolvedValue(null)

      const { requireRole } = await import('@/lib/security/rbac')
      const result = await requireRole('viewer')

      expect(result).not.toBeNull()
      expect(result?.type).toBe('unauthorized')
      expect(result?.status).toBe(401)
    })

    it('should return forbidden error when user role is lower than required', async () => {
      mockAuth.mockResolvedValue({ user: { role: 'viewer' } })

      const { requireRole } = await import('@/lib/security/rbac')
      const result = await requireRole('admin')

      expect(result).not.toBeNull()
      expect(result?.type).toBe('forbidden')
    })

    it('should return null when user role equals required role', async () => {
      mockAuth.mockResolvedValue({ user: { role: 'editor' } })

      const { requireRole } = await import('@/lib/security/rbac')
      const result = await requireRole('editor')

      expect(result).toBeNull()
    })

    it('should return null when user role is higher than required', async () => {
      mockAuth.mockResolvedValue({ user: { role: 'admin' } })

      const { requireRole } = await import('@/lib/security/rbac')
      const result = await requireRole('viewer')

      expect(result).toBeNull()
    })

    it('should handle editor requiring viewer role', async () => {
      mockAuth.mockResolvedValue({ user: { role: 'editor' } })

      const { requireRole } = await import('@/lib/security/rbac')
      const result = await requireRole('viewer')

      expect(result).toBeNull()
    })
  })

  describe('getUserRole', () => {
    it('should return null when not authenticated', async () => {
      mockAuth.mockResolvedValue(null)

      const { getUserRole } = await import('@/lib/security/rbac')
      const result = await getUserRole()

      expect(result).toBeNull()
    })

    it('should return null when session has no user', async () => {
      mockAuth.mockResolvedValue({})

      const { getUserRole } = await import('@/lib/security/rbac')
      const result = await getUserRole()

      expect(result).toBeNull()
    })

    it('should return user role when authenticated', async () => {
      mockAuth.mockResolvedValue({ user: { role: 'editor' } })

      const { getUserRole } = await import('@/lib/security/rbac')
      const result = await getUserRole()

      expect(result).toBe('editor')
    })

    it('should return admin role correctly', async () => {
      mockAuth.mockResolvedValue({ user: { role: 'admin' } })

      const { getUserRole } = await import('@/lib/security/rbac')
      const result = await getUserRole()

      expect(result).toBe('admin')
    })

    it('should return viewer role correctly', async () => {
      mockAuth.mockResolvedValue({ user: { role: 'viewer' } })

      const { getUserRole } = await import('@/lib/security/rbac')
      const result = await getUserRole()

      expect(result).toBe('viewer')
    })
  })

  describe('isAdmin', () => {
    it('should return false when not authenticated', async () => {
      mockAuth.mockResolvedValue(null)

      const { isAdmin } = await import('@/lib/security/rbac')
      const result = await isAdmin()

      expect(result).toBe(false)
    })

    it('should return false for viewer role', async () => {
      mockAuth.mockResolvedValue({ user: { role: 'viewer' } })

      const { isAdmin } = await import('@/lib/security/rbac')
      const result = await isAdmin()

      expect(result).toBe(false)
    })

    it('should return false for editor role', async () => {
      mockAuth.mockResolvedValue({ user: { role: 'editor' } })

      const { isAdmin } = await import('@/lib/security/rbac')
      const result = await isAdmin()

      expect(result).toBe(false)
    })

    it('should return true for admin role', async () => {
      mockAuth.mockResolvedValue({ user: { role: 'admin' } })

      const { isAdmin } = await import('@/lib/security/rbac')
      const result = await isAdmin()

      expect(result).toBe(true)
    })
  })

  describe('Edge cases', () => {
    it('should handle undefined user role in session', async () => {
      mockAuth.mockResolvedValue({ user: {} })

      const { getUserRole } = await import('@/lib/security/rbac')
      const result = await getUserRole()

      expect(result).toBeNull()
    })

    it('should handle undefined role for requirePermission', async () => {
      mockAuth.mockResolvedValue({ user: {} })

      const { requirePermission } = await import('@/lib/security/rbac')
      const result = await requirePermission(Permissions.CATALOG_VIEW)

      expect(result).not.toBeNull()
      expect(result?.type).toBe('forbidden')
    })

    it('should handle undefined role for requireRole', async () => {
      mockAuth.mockResolvedValue({ user: {} })

      const { requireRole } = await import('@/lib/security/rbac')
      const result = await requireRole('viewer')

      expect(result).not.toBeNull()
      expect(result?.type).toBe('forbidden')
    })
  })

  describe('requireSuperAdmin', () => {
    it('should return unauthorized error when user is not authenticated', async () => {
      mockAuth.mockResolvedValue(null)

      const { requireSuperAdmin } = await import('@/lib/security/rbac')
      const result = await requireSuperAdmin()

      expect(result).not.toBeNull()
      expect(result?.type).toBe('unauthorized')
      expect(result?.status).toBe(401)
    })

    it('should return forbidden error when user is not super_admin', async () => {
      mockAuth.mockResolvedValue({ user: { role: 'admin' } })

      const { requireSuperAdmin } = await import('@/lib/security/rbac')
      const result = await requireSuperAdmin()

      expect(result).not.toBeNull()
      expect(result?.type).toBe('forbidden')
    })

    it('should return null when user is super_admin', async () => {
      mockAuth.mockResolvedValue({ user: { role: 'super_admin' } })

      const { requireSuperAdmin } = await import('@/lib/security/rbac')
      const result = await requireSuperAdmin()

      expect(result).toBeNull()
    })
  })
})

// New tests for super_admin and organization roles
describe('Super Admin Role', () => {
  describe('super_admin permissions', () => {
    it('has all admin permissions', () => {
      const superAdminPerms = getPermissionsForRole('super_admin')
      const adminPerms = getPermissionsForRole('admin')
      
      adminPerms.forEach(perm => {
        expect(superAdminPerms).toContain(perm)
      })
    })

    it('has organization management permissions', () => {
      expect(hasPermission('super_admin', Permissions.ORGS_VIEW)).toBe(true)
      expect(hasPermission('super_admin', Permissions.ORGS_MANAGE)).toBe(true)
      expect(hasPermission('super_admin', Permissions.ORGS_CREATE)).toBe(true)
      expect(hasPermission('super_admin', Permissions.SUPER_ADMIN_ACCESS)).toBe(true)
    })

    it('admin does not have super admin permissions', () => {
      expect(hasPermission('admin', Permissions.ORGS_VIEW)).toBe(false)
      expect(hasPermission('admin', Permissions.ORGS_MANAGE)).toBe(false)
      expect(hasPermission('admin', Permissions.ORGS_CREATE)).toBe(false)
      expect(hasPermission('admin', Permissions.SUPER_ADMIN_ACCESS)).toBe(false)
    })
  })

  describe('super_admin hierarchy', () => {
    it('super_admin is higher than admin', () => {
      expect(hasRoleOrHigher('super_admin', 'admin')).toBe(true)
    })

    it('super_admin is higher than editor', () => {
      expect(hasRoleOrHigher('super_admin', 'editor')).toBe(true)
    })

    it('super_admin is higher than viewer', () => {
      expect(hasRoleOrHigher('super_admin', 'viewer')).toBe(true)
    })

    it('admin is not higher than super_admin', () => {
      expect(hasRoleOrHigher('admin', 'super_admin')).toBe(false)
    })
  })

  describe('isSuperAdmin helper', () => {
    it('returns true for super_admin role', () => {
      expect(isSuperAdmin('super_admin')).toBe(true)
    })

    it('returns false for admin role', () => {
      expect(isSuperAdmin('admin')).toBe(false)
    })

    it('returns false for editor role', () => {
      expect(isSuperAdmin('editor')).toBe(false)
    })

    it('returns false for viewer role', () => {
      expect(isSuperAdmin('viewer')).toBe(false)
    })

    it('returns false for undefined', () => {
      expect(isSuperAdmin(undefined)).toBe(false)
    })

    it('returns false for null', () => {
      expect(isSuperAdmin(null)).toBe(false)
    })
  })

  describe('getAllRoles with super_admin', () => {
    it('returns all four roles including super_admin', () => {
      const roles = getAllRoles()
      expect(roles).toHaveLength(4)
      expect(roles).toContain('super_admin')
      expect(roles).toContain('admin')
      expect(roles).toContain('editor')
      expect(roles).toContain('viewer')
    })

    it('returns roles in hierarchy order', () => {
      const roles = getAllRoles()
      expect(roles[0]).toBe('viewer')
      expect(roles[1]).toBe('editor')
      expect(roles[2]).toBe('admin')
      expect(roles[3]).toBe('super_admin')
    })
  })

  describe('isValidRole with super_admin', () => {
    it('returns true for super_admin', () => {
      expect(isValidRole('super_admin')).toBe(true)
    })
  })

  describe('ROLE_LABELS with super_admin', () => {
    it('has label for super_admin', () => {
      expect(ROLE_LABELS.super_admin).toBeDefined()
      expect(ROLE_LABELS.super_admin.label).toBe('Super Admin')
      expect(ROLE_LABELS.super_admin.description).toBeDefined()
      expect(ROLE_LABELS.super_admin.color).toBeDefined()
    })
  })
})

describe('Organization Role System', () => {
  describe('hasOrgPermission', () => {
    it('returns true when org_admin has CATALOG_DELETE permission', () => {
      expect(hasOrgPermission('org_admin', Permissions.CATALOG_DELETE)).toBe(true)
    })

    it('returns false when org_editor has CATALOG_DELETE permission', () => {
      expect(hasOrgPermission('org_editor', Permissions.CATALOG_DELETE)).toBe(false)
    })

    it('returns true when org_editor has CATALOG_CREATE permission', () => {
      expect(hasOrgPermission('org_editor', Permissions.CATALOG_CREATE)).toBe(true)
    })

    it('returns true when org_viewer has CATALOG_VIEW permission', () => {
      expect(hasOrgPermission('org_viewer', Permissions.CATALOG_VIEW)).toBe(true)
    })

    it('returns false when org_viewer has CATALOG_CREATE permission', () => {
      expect(hasOrgPermission('org_viewer', Permissions.CATALOG_CREATE)).toBe(false)
    })

    it('returns false for undefined role', () => {
      expect(hasOrgPermission(undefined, Permissions.CATALOG_VIEW)).toBe(false)
    })

    it('returns false for null role', () => {
      expect(hasOrgPermission(null, Permissions.CATALOG_VIEW)).toBe(false)
    })
  })

  describe('hasOrgRoleOrHigher', () => {
    it('org_admin is higher than org_viewer', () => {
      expect(hasOrgRoleOrHigher('org_admin', 'org_viewer')).toBe(true)
    })

    it('org_admin is higher than org_editor', () => {
      expect(hasOrgRoleOrHigher('org_admin', 'org_editor')).toBe(true)
    })

    it('org_admin equals org_admin', () => {
      expect(hasOrgRoleOrHigher('org_admin', 'org_admin')).toBe(true)
    })

    it('org_editor is higher than org_viewer', () => {
      expect(hasOrgRoleOrHigher('org_editor', 'org_viewer')).toBe(true)
    })

    it('org_editor is not higher than org_admin', () => {
      expect(hasOrgRoleOrHigher('org_editor', 'org_admin')).toBe(false)
    })

    it('org_viewer is not higher than org_editor', () => {
      expect(hasOrgRoleOrHigher('org_viewer', 'org_editor')).toBe(false)
    })

    it('org_viewer equals org_viewer', () => {
      expect(hasOrgRoleOrHigher('org_viewer', 'org_viewer')).toBe(true)
    })

    it('returns false for undefined role', () => {
      expect(hasOrgRoleOrHigher(undefined, 'org_viewer')).toBe(false)
    })

    it('returns false for null role', () => {
      expect(hasOrgRoleOrHigher(null, 'org_viewer')).toBe(false)
    })
  })

  describe('isValidOrgRole', () => {
    it('returns true for valid org roles', () => {
      expect(isValidOrgRole('org_admin')).toBe(true)
      expect(isValidOrgRole('org_editor')).toBe(true)
      expect(isValidOrgRole('org_viewer')).toBe(true)
    })

    it('returns false for invalid org roles', () => {
      expect(isValidOrgRole('admin')).toBe(false)
      expect(isValidOrgRole('org_superadmin')).toBe(false)
      expect(isValidOrgRole('')).toBe(false)
      expect(isValidOrgRole(null)).toBe(false)
      expect(isValidOrgRole(undefined)).toBe(false)
      expect(isValidOrgRole(123)).toBe(false)
    })
  })

  describe('getAllOrgRoles', () => {
    it('returns all three org roles', () => {
      const roles = getAllOrgRoles()
      expect(roles).toHaveLength(3)
      expect(roles).toContain('org_admin')
      expect(roles).toContain('org_editor')
      expect(roles).toContain('org_viewer')
    })

    it('returns roles in hierarchy order (lowest to highest)', () => {
      const roles = getAllOrgRoles()
      expect(roles[0]).toBe('org_viewer')
      expect(roles[1]).toBe('org_editor')
      expect(roles[2]).toBe('org_admin')
    })
  })

  describe('ORG_ROLE_LABELS', () => {
    it('has labels for all org roles', () => {
      expect(ORG_ROLE_LABELS.org_admin).toBeDefined()
      expect(ORG_ROLE_LABELS.org_editor).toBeDefined()
      expect(ORG_ROLE_LABELS.org_viewer).toBeDefined()
    })

    it('each org role has label, description, and color', () => {
      const roles: OrgRole[] = ['org_admin', 'org_editor', 'org_viewer']
      roles.forEach(role => {
        expect(ORG_ROLE_LABELS[role].label).toBeDefined()
        expect(ORG_ROLE_LABELS[role].description).toBeDefined()
        expect(ORG_ROLE_LABELS[role].color).toBeDefined()
      })
    })
  })

  describe('Org permission matrix', () => {
    it('org_viewer has only view permissions', () => {
      expect(hasOrgPermission('org_viewer', Permissions.CATALOG_VIEW)).toBe(true)
      expect(hasOrgPermission('org_viewer', Permissions.METADATA_VIEW)).toBe(true)
      expect(hasOrgPermission('org_viewer', Permissions.CATALOG_CREATE)).toBe(false)
      expect(hasOrgPermission('org_viewer', Permissions.CATALOG_EDIT)).toBe(false)
      expect(hasOrgPermission('org_viewer', Permissions.CATALOG_DELETE)).toBe(false)
    })

    it('org_editor can create and edit but not delete', () => {
      expect(hasOrgPermission('org_editor', Permissions.CATALOG_VIEW)).toBe(true)
      expect(hasOrgPermission('org_editor', Permissions.CATALOG_CREATE)).toBe(true)
      expect(hasOrgPermission('org_editor', Permissions.CATALOG_EDIT)).toBe(true)
      expect(hasOrgPermission('org_editor', Permissions.METADATA_MANAGE)).toBe(true)
      expect(hasOrgPermission('org_editor', Permissions.CATALOG_DELETE)).toBe(false)
      expect(hasOrgPermission('org_editor', Permissions.USERS_MANAGE)).toBe(false)
    })

    it('org_admin has full org permissions', () => {
      expect(hasOrgPermission('org_admin', Permissions.CATALOG_VIEW)).toBe(true)
      expect(hasOrgPermission('org_admin', Permissions.CATALOG_CREATE)).toBe(true)
      expect(hasOrgPermission('org_admin', Permissions.CATALOG_EDIT)).toBe(true)
      expect(hasOrgPermission('org_admin', Permissions.CATALOG_DELETE)).toBe(true)
      expect(hasOrgPermission('org_admin', Permissions.USERS_VIEW)).toBe(true)
      expect(hasOrgPermission('org_admin', Permissions.USERS_MANAGE)).toBe(true)
      expect(hasOrgPermission('org_admin', Permissions.METADATA_MANAGE)).toBe(true)
    })
  })
})
