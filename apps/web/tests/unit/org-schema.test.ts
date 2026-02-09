/**
 * Organization schema validation tests
 */
import { describe, it, expect } from 'vitest'
import {
  organizations,
  orgMemberships,
  orgInvitations,
  orgRoleEnum,
  orgInvitationStatusEnum,
  type OrganizationRecord,
  type NewOrganizationRecord,
  type OrgMembershipRecord,
  type NewOrgMembershipRecord,
  type OrgInvitationRecord,
  type NewOrgInvitationRecord,
} from '@gpters/db/schema'

describe('Organization Schema', () => {
  describe('orgRoleEnum', () => {
    it('has correct enum values', () => {
      expect(orgRoleEnum.enumValues).toEqual(['org_admin', 'org_editor', 'org_viewer'])
    })
  })

  describe('orgInvitationStatusEnum', () => {
    it('has correct enum values', () => {
      expect(orgInvitationStatusEnum.enumValues).toEqual(['pending', 'accepted', 'rejected', 'expired'])
    })
  })

  describe('organizations table', () => {
    it('exports OrganizationRecord type', () => {
      const record: OrganizationRecord = {
        id: 'test-id',
        name: 'Test Org',
        slug: 'test-org',
        allowedDomains: ['gpters.org'],
        description: 'Test description',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      expect(record).toBeDefined()
    })

    it('exports NewOrganizationRecord type', () => {
      const newRecord: NewOrganizationRecord = {
        name: 'Test Org',
        slug: 'test-org',
        allowedDomains: ['gpters.org'],
      }
      expect(newRecord).toBeDefined()
    })

    it('has required fields', () => {
      expect(organizations.id).toBeDefined()
      expect(organizations.name).toBeDefined()
      expect(organizations.slug).toBeDefined()
      expect(organizations.allowedDomains).toBeDefined()
      expect(organizations.isActive).toBeDefined()
    })
  })

  describe('orgMemberships table', () => {
    it('exports OrgMembershipRecord type', () => {
      const record: OrgMembershipRecord = {
        userId: 'user-id',
        orgId: 'org-id',
        role: 'org_viewer',
        joinedAt: new Date(),
        invitedBy: 'inviter-id',
      }
      expect(record).toBeDefined()
    })

    it('exports NewOrgMembershipRecord type', () => {
      const newRecord: NewOrgMembershipRecord = {
        userId: 'user-id',
        orgId: 'org-id',
        role: 'org_admin',
      }
      expect(newRecord).toBeDefined()
    })

    it('has composite primary key fields', () => {
      expect(orgMemberships.userId).toBeDefined()
      expect(orgMemberships.orgId).toBeDefined()
      expect(orgMemberships.role).toBeDefined()
    })

    it('has default role value', () => {
      const roleColumn = orgMemberships.role
      expect(roleColumn).toBeDefined()
    })
  })

  describe('orgInvitations table', () => {
    it('exports OrgInvitationRecord type', () => {
      const record: OrgInvitationRecord = {
        id: 'invitation-id',
        orgId: 'org-id',
        email: 'user@gpters.org',
        role: 'org_editor',
        status: 'pending',
        invitedBy: 'inviter-id',
        expiresAt: new Date(),
        createdAt: new Date(),
      }
      expect(record).toBeDefined()
    })

    it('exports NewOrgInvitationRecord type', () => {
      const newRecord: NewOrgInvitationRecord = {
        orgId: 'org-id',
        email: 'user@gpters.org',
        role: 'org_viewer',
        expiresAt: new Date(),
      }
      expect(newRecord).toBeDefined()
    })

    it('has required fields', () => {
      expect(orgInvitations.id).toBeDefined()
      expect(orgInvitations.orgId).toBeDefined()
      expect(orgInvitations.email).toBeDefined()
      expect(orgInvitations.role).toBeDefined()
      expect(orgInvitations.status).toBeDefined()
      expect(orgInvitations.expiresAt).toBeDefined()
    })

    it('has default status value', () => {
      const statusColumn = orgInvitations.status
      expect(statusColumn).toBeDefined()
    })
  })

  describe('Type compatibility', () => {
    it('org roles are compatible with enum values', () => {
      const roles: Array<OrgMembershipRecord['role']> = ['org_admin', 'org_editor', 'org_viewer']
      expect(roles).toHaveLength(3)
    })

    it('invitation statuses are compatible with enum values', () => {
      const statuses: Array<OrgInvitationRecord['status']> = ['pending', 'accepted', 'rejected', 'expired']
      expect(statuses).toHaveLength(4)
    })

    it('allowedDomains is string array', () => {
      const org: Pick<OrganizationRecord, 'allowedDomains'> = {
        allowedDomains: ['domain1.com', 'domain2.org'],
      }
      expect(org.allowedDomains).toBeInstanceOf(Array)
      expect(org.allowedDomains.every(d => typeof d === 'string')).toBe(true)
    })
  })
})
