/**
 * Hook Security Validation API
 *
 * Provides security analysis for hook commands
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  validateHookSecurity,
  validateHookItemSecurity,
  getSecurityRules,
  generateSecurityReport,
  type SecurityValidationResult,
} from '@/lib/plugin/hook-security'
import { getCatalogItem } from '@/lib/core/catalog'

interface SecurityRequest {
  command?: string
  hookId?: string
  includeReport?: boolean
}

interface BatchSecurityRequest {
  commands: string[]
  includeReport?: boolean
}

export async function POST(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const action = url.searchParams.get('action') || 'validate'

    switch (action) {
      case 'validate':
        return handleValidate(request)
      case 'batch':
        return handleBatch(request)
      case 'rules':
        return handleRules()
      default:
        return NextResponse.json(
          { error: 'Invalid action', validActions: ['validate', 'batch', 'rules'] },
          { status: 400 }
        )
    }
  } catch (error) {
    console.error('Hook security API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const action = url.searchParams.get('action')

  if (action === 'rules') {
    return handleRules()
  }

  return NextResponse.json(
    {
      message: 'Hook Security Validation API',
      endpoints: {
        'POST ?action=validate': 'Validate a single command or hook item',
        'POST ?action=batch': 'Validate multiple commands',
        'GET ?action=rules': 'Get all security rules',
      },
      example: {
        validate: { command: 'echo "Hello"' },
        validateHook: { hookId: 'my-hook' },
        batch: { commands: ['echo "a"', 'rm -rf /'] },
      },
    },
    { status: 200 }
  )
}

async function handleValidate(request: NextRequest): Promise<NextResponse> {
  const body: SecurityRequest = await request.json()

  if (!body.command && !body.hookId) {
    return NextResponse.json(
      { error: 'Either command or hookId is required' },
      { status: 400 }
    )
  }

  let result: SecurityValidationResult

  if (body.hookId) {
    const item = await getCatalogItem(body.hookId)
    if (!item) {
      return NextResponse.json(
        { error: `Hook not found: ${body.hookId}` },
        { status: 404 }
      )
    }
    if (item.type !== 'hook') {
      return NextResponse.json(
        { error: `Item is not a hook: ${item.type}` },
        { status: 400 }
      )
    }
    result = validateHookItemSecurity(item)
  } else {
    result = validateHookSecurity(body.command!)
  }

  const response: Record<string, unknown> = {
    ...result,
    timestamp: new Date().toISOString(),
  }

  if (body.includeReport) {
    response.report = generateSecurityReport(result)
  }

  return NextResponse.json(response)
}

async function handleBatch(request: NextRequest): Promise<NextResponse> {
  const body: BatchSecurityRequest = await request.json()

  if (!body.commands || !Array.isArray(body.commands)) {
    return NextResponse.json(
      { error: 'commands array is required' },
      { status: 400 }
    )
  }

  if (body.commands.length > 100) {
    return NextResponse.json(
      { error: 'Maximum 100 commands allowed per batch' },
      { status: 400 }
    )
  }

  const results = body.commands.map((command) => {
    const result = validateHookSecurity(command)
    return {
      command,
      ...result,
      report: body.includeReport ? generateSecurityReport(result) : undefined,
    }
  })

  const summary = {
    total: results.length,
    safe: results.filter((r) => r.safe).length,
    unsafe: results.filter((r) => !r.safe).length,
    bySeverity: {
      critical: results.filter((r) => r.risks.some((risk) => risk.severity === 'critical')).length,
      high: results.filter((r) => r.risks.some((risk) => risk.severity === 'high')).length,
      medium: results.filter((r) => r.risks.some((risk) => risk.severity === 'medium')).length,
      low: results.filter((r) => r.risks.some((risk) => risk.severity === 'low')).length,
    },
    averageScore: results.length > 0
      ? Math.round(results.reduce((sum, r) => sum + r.score, 0) / results.length)
      : 100,
  }

  return NextResponse.json({
    results,
    summary,
    timestamp: new Date().toISOString(),
  })
}

function handleRules(): NextResponse {
  const rules = getSecurityRules()

  const byCategory: Record<string, typeof rules> = {}
  const bySeverity: Record<string, typeof rules> = {}

  for (const rule of rules) {
    if (!byCategory[rule.category]) {
      byCategory[rule.category] = []
    }
    byCategory[rule.category].push(rule)

    if (!bySeverity[rule.severity]) {
      bySeverity[rule.severity] = []
    }
    bySeverity[rule.severity].push(rule)
  }

  return NextResponse.json({
    rules,
    total: rules.length,
    byCategory,
    bySeverity,
    categories: Object.keys(byCategory),
    severities: ['critical', 'high', 'medium', 'low', 'info'],
  })
}
