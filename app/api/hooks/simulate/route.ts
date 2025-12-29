/**
 * Hook Simulation API
 *
 * POST /api/hooks/simulate - Simulate hook event execution
 */

import { NextRequest, NextResponse } from 'next/server'
import { withRateLimit, RateLimitPresets } from '@/lib/utils/rate-limit'
import { createLogger } from '@/lib/core/logger'
import { db } from '@/lib/db'
import { catalogItems } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import {
  simulateHookEvent,
  simulateHookFromItem,
  getEventContext,
  getAllEventContexts,
  generateSampleEnvironment,
  testHookScenarios,
  generateSimulationReport,
  type HookSimulationInput,
  type SimulatedEnvironment,
} from '@/lib/plugin/hook-simulator'
import type { CatalogItem, HookEvent } from '@/lib/core/types'

const log = createLogger('api:hooks:simulate')

/**
 * POST - Simulate hook event execution
 *
 * Body options:
 *
 * 1. Simulate by hook ID:
 *    { "hookId": "my-hook", "env": { ... } }
 *
 * 2. Simulate with inline definition:
 *    {
 *      "event": "PreToolUse",
 *      "command": "echo $CLAUDE_TOOL_NAME",
 *      "env": { "CLAUDE_TOOL_NAME": "Read" }
 *    }
 *
 * 3. Test multiple scenarios:
 *    { "hookId": "my-hook", "testScenarios": true }
 *
 * 4. Get event context info:
 *    { "getEventContext": "PreToolUse" }
 *
 * 5. Get all event contexts:
 *    { "getAllEventContexts": true }
 *
 * 6. Get sample environment:
 *    { "getSampleEnvironment": "PreToolUse" }
 */
export async function POST(request: NextRequest) {
  const rateLimitError = withRateLimit(request, RateLimitPresets.standard)
  if (rateLimitError) return rateLimitError

  try {
    const body = await request.json()

    // Option 5: Return all event contexts
    if (body.getAllEventContexts) {
      return NextResponse.json({
        success: true,
        data: {
          events: getAllEventContexts(),
        },
      })
    }

    // Option 4: Return specific event context
    if (body.getEventContext) {
      const event = body.getEventContext as HookEvent
      try {
        const context = getEventContext(event)
        return NextResponse.json({
          success: true,
          data: {
            event,
            context,
          },
        })
      } catch (error) {
        return NextResponse.json(
          {
            success: false,
            error: `Invalid event type: ${event}`,
          },
          { status: 400 }
        )
      }
    }

    // Option 6: Return sample environment
    if (body.getSampleEnvironment) {
      const event = body.getSampleEnvironment as HookEvent
      try {
        const environment = generateSampleEnvironment(event)
        return NextResponse.json({
          success: true,
          data: {
            event,
            environment,
          },
        })
      } catch (error) {
        return NextResponse.json(
          {
            success: false,
            error: `Invalid event type: ${event}`,
          },
          { status: 400 }
        )
      }
    }

    // Option 1: Simulate by hook ID
    if (body.hookId) {
      const [item] = await db
        .select()
        .from(catalogItems)
        .where(eq(catalogItems.id, body.hookId))
        .limit(1)

      if (!item) {
        return NextResponse.json(
          { success: false, error: `Hook not found: ${body.hookId}` },
          { status: 404 }
        )
      }

      if (item.type !== 'hook') {
        return NextResponse.json(
          { success: false, error: `Item is not a hook: ${body.hookId}` },
          { status: 400 }
        )
      }

      const env: Partial<SimulatedEnvironment> = body.env || {}

      // Option 3: Test multiple scenarios
      if (body.testScenarios) {
        const input: HookSimulationInput = {
          event: item.hookEvent as HookEvent,
          command: item.hookCommand || '',
          timeout: item.hookTimeout || undefined,
          env,
        }

        const scenarioResults = testHookScenarios(input)

        log.info('Hook scenarios tested', {
          hookId: body.hookId,
          scenarioCount: scenarioResults.scenarios.length,
          passed: scenarioResults.summary.passed,
        })

        return NextResponse.json({
          success: true,
          data: {
            hookId: body.hookId,
            hookName: item.name,
            ...scenarioResults,
          },
        })
      }

      // Standard simulation
      const result = simulateHookFromItem(item as unknown as CatalogItem, env)

      // Return as report format
      if (body.format === 'report') {
        const report = generateSimulationReport(result)
        return new NextResponse(report, {
          headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
        })
      }

      log.info('Hook simulated', {
        hookId: body.hookId,
        event: result.event,
        success: result.success,
      })

      return NextResponse.json({
        success: true,
        data: result,
      })
    }

    // Option 2: Simulate with inline definition
    if (body.event && body.command) {
      const input: HookSimulationInput = {
        event: body.event as HookEvent,
        command: body.command,
        timeout: body.timeout,
        env: body.env || {},
      }

      // Test multiple scenarios if requested
      if (body.testScenarios) {
        const scenarioResults = testHookScenarios(input)

        log.info('Inline hook scenarios tested', {
          event: body.event,
          scenarioCount: scenarioResults.scenarios.length,
          passed: scenarioResults.summary.passed,
        })

        return NextResponse.json({
          success: true,
          data: scenarioResults,
        })
      }

      const result = simulateHookEvent(input)

      // Return as report format
      if (body.format === 'report') {
        const report = generateSimulationReport(result)
        return new NextResponse(report, {
          headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
        })
      }

      log.info('Inline hook simulated', {
        event: body.event,
        success: result.success,
      })

      return NextResponse.json({
        success: true,
        data: result,
      })
    }

    return NextResponse.json(
      {
        success: false,
        error:
          'Missing required parameters. Provide hookId, or event+command, or getEventContext, or getAllEventContexts, or getSampleEnvironment',
      },
      { status: 400 }
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    log.error('Hook simulation failed', { error: message })

    return NextResponse.json(
      { success: false, error: 'Failed to simulate hook' },
      { status: 500 }
    )
  }
}
