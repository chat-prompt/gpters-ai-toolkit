/**
 * Tests for session tracker utilities
 *
 * Covers mapToolToAction, extractSkillId, extractSearchQuery mapping functions
 * and input validation for the session tracking system.
 */

import { describe, it, expect } from 'vitest'
import {
  mapToolToAction,
  extractSkillId,
  extractSearchQuery,
} from '@gpters/lib/analytics'

describe('mapToolToAction', () => {
  it('maps semantic_search to search', () => {
    expect(mapToolToAction('semantic_search')).toBe('search')
  })

  it('maps search_plugins to search', () => {
    expect(mapToolToAction('search_plugins')).toBe('search')
  })

  it('maps get_plugin_content to view', () => {
    expect(mapToolToAction('get_plugin_content')).toBe('view')
  })

  it('maps deploy_skill to deploy', () => {
    expect(mapToolToAction('deploy_skill')).toBe('deploy')
  })

  it('maps unknown tools to other', () => {
    expect(mapToolToAction('list_plugins')).toBe('other')
    expect(mapToolToAction('check_updates')).toBe('other')
    expect(mapToolToAction('add_files')).toBe('other')
  })

  it('maps undefined to other', () => {
    expect(mapToolToAction(undefined)).toBe('other')
  })
})

describe('extractSkillId', () => {
  it('extracts pluginId from get_plugin_content', () => {
    const body = {
      params: {
        arguments: { pluginId: 'code-reviewer' },
      },
    }
    expect(extractSkillId(body, 'get_plugin_content')).toBe('code-reviewer')
  })

  it('extracts id from deploy_skill', () => {
    const body = {
      params: {
        arguments: { id: 'my-skill', type: 'skill', name: 'My Skill' },
      },
    }
    expect(extractSkillId(body, 'deploy_skill')).toBe('my-skill')
  })

  it('falls back to name for deploy_skill without id', () => {
    const body = {
      params: {
        arguments: { type: 'skill', name: 'New Skill' },
      },
    }
    expect(extractSkillId(body, 'deploy_skill')).toBe('New Skill')
  })

  it('returns undefined for unknown tools', () => {
    const body = {
      params: {
        arguments: { query: 'test' },
      },
    }
    expect(extractSkillId(body, 'semantic_search')).toBeUndefined()
  })

  it('returns undefined for null body', () => {
    expect(extractSkillId(null, 'get_plugin_content')).toBeUndefined()
  })

  it('returns undefined when no tool specified', () => {
    expect(extractSkillId({}, undefined)).toBeUndefined()
  })

  it('returns undefined when params.arguments is missing', () => {
    const body = { params: {} }
    expect(extractSkillId(body, 'get_plugin_content')).toBeUndefined()
  })
})

describe('extractSearchQuery', () => {
  it('extracts query from semantic_search', () => {
    const body = {
      params: {
        arguments: { query: 'database helper' },
      },
    }
    expect(extractSearchQuery(body, 'semantic_search')).toBe('database helper')
  })

  it('extracts query from search_plugins', () => {
    const body = {
      params: {
        arguments: { query: 'code review' },
      },
    }
    expect(extractSearchQuery(body, 'search_plugins')).toBe('code review')
  })

  it('returns undefined for non-search tools', () => {
    const body = {
      params: {
        arguments: { pluginId: 'test' },
      },
    }
    expect(extractSearchQuery(body, 'get_plugin_content')).toBeUndefined()
  })

  it('returns undefined for null body', () => {
    expect(extractSearchQuery(null, 'semantic_search')).toBeUndefined()
  })

  it('returns undefined when no tool specified', () => {
    expect(extractSearchQuery({}, undefined)).toBeUndefined()
  })
})
