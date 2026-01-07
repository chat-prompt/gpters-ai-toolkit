/**
 * MCP Server Status Endpoint
 *
 * Returns the current status and health of the MCP server.
 * Used by the MCPStatus component to display connection status in the header.
 *
 * GET /api/mcp/status
 * Returns: { status, serverInfo, lastRequest, timestamp }
 */

import { NextRequest, NextResponse } from 'next/server'
import { SERVER_INFO, MCP_TOOLS } from '@/lib/mcp'
import { db } from '@/lib/db'
import { sql } from 'drizzle-orm'

// Store last successful request timestamp in memory
// In production, this could be stored in Redis or database
let lastSuccessfulRequest: string | null = null
let requestCount = 0

export function recordSuccessfulRequest() {
  lastSuccessfulRequest = new Date().toISOString()
  requestCount++
}

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders,
  })
}

export async function GET(_request: NextRequest) {
  const startTime = Date.now()

  try {
    // Check database connectivity as part of health check
    let dbStatus: 'healthy' | 'degraded' | 'error' = 'healthy'
    let dbLatency: number | null = null

    try {
      const dbStart = Date.now()
      await db.execute(sql`SELECT 1`)
      dbLatency = Date.now() - dbStart
      if (dbLatency > 500) {
        dbStatus = 'degraded'
      }
    } catch {
      dbStatus = 'error'
    }

    // Determine overall status
    let status: 'connected' | 'degraded' | 'error' = 'connected'
    if (dbStatus === 'error') {
      status = 'error'
    } else if (dbStatus === 'degraded') {
      status = 'degraded'
    }

    const responseTime = Date.now() - startTime

    // Record this as a successful request
    recordSuccessfulRequest()

    return NextResponse.json(
      {
        status,
        serverInfo: {
          name: SERVER_INFO.name,
          version: SERVER_INFO.version,
          description: SERVER_INFO.description,
          toolsCount: MCP_TOOLS.length,
        },
        health: {
          database: dbStatus,
          dbLatency,
          responseTime,
        },
        lastRequest: lastSuccessfulRequest,
        requestCount,
        timestamp: new Date().toISOString(),
      },
      { headers: corsHeaders }
    )
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    return NextResponse.json(
      {
        status: 'error',
        error: errorMessage,
        serverInfo: {
          name: SERVER_INFO.name,
          version: SERVER_INFO.version,
        },
        timestamp: new Date().toISOString(),
      },
      {
        status: 500,
        headers: corsHeaders,
      }
    )
  }
}
