import { describe, it, expect } from 'vitest'
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
} from '@/lib/security/rbac'

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
      expect(permissions).toContain(Permissions.ADMIN_VIEW)
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
    it('returns all three roles', () => {
      const roles = getAllRoles()
      expect(roles).toHaveLength(3)
      expect(roles).toContain('admin')
      expect(roles).toContain('editor')
      expect(roles).toContain('viewer')
    })

    it('returns roles in hierarchy order (lowest to highest)', () => {
      const roles = getAllRoles()
      expect(roles[0]).toBe('viewer')
      expect(roles[1]).toBe('editor')
      expect(roles[2]).toBe('admin')
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
    it('viewer has only view permissions', () => {
      const viewerPermissions = getPermissionsForRole('viewer')
      // Should have view permissions
      expect(viewerPermissions).toContain(Permissions.ADMIN_VIEW)
      expect(viewerPermissions).toContain(Permissions.CATALOG_VIEW)
      expect(viewerPermissions).toContain(Permissions.USERS_VIEW)
      expect(viewerPermissions).toContain(Permissions.METADATA_VIEW)
      // Should NOT have write permissions
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

    it('admin has all permissions', () => {
      const adminPermissions = getPermissionsForRole('admin')
      // Should have ALL permissions
      Object.values(Permissions).forEach(permission => {
        expect(adminPermissions).toContain(permission)
      })
    })
  })
})
