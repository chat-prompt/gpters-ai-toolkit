import { NextResponse } from 'next/server'

// Serve the MCP proxy script for stdio transport
// This script converts HTTP MCP to stdio for Claude Code compatibility

const PROXY_SCRIPT = `#!/usr/bin/env node
import { createInterface } from 'readline';

const MCP_URL = process.env.MCP_URL || 'https://company-ai-toolkit.vercel.app/api/mcp';
const MCP_TOKEN = process.env.MCP_TOKEN || '';

if (!MCP_TOKEN) {
  console.error(JSON.stringify({
    jsonrpc: '2.0',
    id: null,
    error: {
      code: -32001,
      message: 'MCP_TOKEN environment variable is required. Get your token at https://company-ai-toolkit.vercel.app/getting-started'
    }
  }));
  process.exit(1);
}

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
});

async function sendRequest(jsonRpcRequest) {
  try {
    const response = await fetch(MCP_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': \`Bearer \${MCP_TOKEN}\`,
      },
      body: JSON.stringify(jsonRpcRequest),
    });

    if (!response.ok) {
      const error = await response.text();
      return {
        jsonrpc: '2.0',
        id: jsonRpcRequest.id,
        error: {
          code: -32000,
          message: \`HTTP \${response.status}: \${error}\`,
        },
      };
    }

    return await response.json();
  } catch (error) {
    return {
      jsonrpc: '2.0',
      id: jsonRpcRequest.id,
      error: {
        code: -32000,
        message: error.message,
      },
    };
  }
}

function writeResponse(response) {
  process.stdout.write(JSON.stringify(response) + '\\n');
}

rl.on('line', async (line) => {
  if (!line.trim()) return;

  try {
    const request = JSON.parse(line);
    const response = await sendRequest(request);
    writeResponse(response);
  } catch (error) {
    writeResponse({
      jsonrpc: '2.0',
      id: null,
      error: {
        code: -32700,
        message: 'Parse error',
      },
    });
  }
});

rl.on('close', () => process.exit(0));
process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));
`

export async function GET() {
  return new NextResponse(PROXY_SCRIPT, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
