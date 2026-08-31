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

  it('extracts pluginId from sessionless REST get body', () => {
    expect(extractSkillId({ pluginId: 'eli5-visual' }, 'get_plugin_content')).toBe('eli5-visual')
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

  it('extracts id from sessionless REST deploy body', () => {
    expect(extractSkillId({ id: 'eli5-visual', name: 'ELI5' }, 'deploy_skill')).toBe('eli5-visual')
  })

  it('extracts skillId from an outcome report', () => {
    const body = { params: { arguments: { skillId: 'eli5-visual', applied: true } } }
    expect(extractSkillId(body, 'report_skill_outcome')).toBe('eli5-visual')
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

  it('extracts query from sessionless REST search body', () => {
    expect(extractSearchQuery({ query: '쉽게 설명' }, 'search_plugins')).toBe('쉽게 설명')
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
