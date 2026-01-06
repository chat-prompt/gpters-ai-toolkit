#!/usr/bin/env node
/**
 * MCP HTTP-to-Stdio Proxy
 *
 * Converts HTTP MCP server to stdio transport for Claude Code compatibility.
 * Reads JSON-RPC from stdin, forwards to HTTP endpoint, writes response to stdout.
 */

import { createInterface } from 'readline';

const MCP_URL = process.env.MCP_URL || 'https://company-ai-toolkit.vercel.app/api/mcp';
const MCP_TOKEN = process.env.MCP_TOKEN || '';

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
});

async function sendRequest(jsonRpcRequest) {
  try {
    const headers = {
      'Content-Type': 'application/json',
    };

    if (MCP_TOKEN) {
      headers['Authorization'] = `Bearer ${MCP_TOKEN}`;
    }

    const response = await fetch(MCP_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(jsonRpcRequest),
    });

    if (!response.ok) {
      const error = await response.text();
      return {
        jsonrpc: '2.0',
        id: jsonRpcRequest.id,
        error: {
          code: -32000,
          message: `HTTP ${response.status}: ${error}`,
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
  process.stdout.write(JSON.stringify(response) + '\n');
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

rl.on('close', () => {
  process.exit(0);
});

// Handle process signals
process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));
