/**
 * OAuth 2.1 Token Endpoint
 *
 * Exchanges authorization codes for access tokens with PKCE verification.
 * Supports the authorization_code grant type only per OAuth 2.1 spec.
 *
 * @see https://datatracker.ietf.org/doc/html/draft-ietf-oauth-v2-1-07#section-4.1.3
 */
import { NextRequest, NextResponse } from "next/server";
import {
  getAuthCode,
  consumeAuthCode,
  verifyPkce,
  getClient,
  verifyClientSecret,
} from "@/lib/security/oauth";
import { createAccessToken } from "@/lib/security/oauth-tokens";
import { createLogger } from "@/lib/core/logger";

const log = createLogger("oauth-token");

/** CORS headers for cross-origin MCP SDK access */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

/**
 * Handle CORS preflight requests
 *
 * @returns 204 response with CORS headers
 */
export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

// OAuth 2.1 Token Endpoint
// https://datatracker.ietf.org/doc/html/draft-ietf-oauth-v2-1-07#section-4.1.3

export async function POST(request: NextRequest) {
  try {
    // Parse request body - support both form data and JSON
    let grantType: string | null = null;
    let code: string | null = null;
    let redirectUri: string | null = null;
    let clientId: string | null = null;
    let clientSecret: string | null = null;
    let codeVerifier: string | null = null;

    const contentType = request.headers.get("content-type") || "";
    log.info("Token request received", {
      contentType,
      method: request.method,
    });

    if (contentType.includes("application/json")) {
      const json = await request.json();
      grantType = json.grant_type ?? null;
      code = json.code ?? null;
      redirectUri = json.redirect_uri ?? null;
      clientId = json.client_id ?? null;
      clientSecret = json.client_secret ?? null;
      codeVerifier = json.code_verifier ?? null;
    } else {
      // Try to parse as form data; fall back to reading raw text for edge cases
      try {
        const cloned = request.clone();
        const formData = await cloned.formData();
        grantType = formData.get("grant_type") as string | null;
        code = formData.get("code") as string | null;
        redirectUri = formData.get("redirect_uri") as string | null;
        clientId = formData.get("client_id") as string | null;
        clientSecret = formData.get("client_secret") as string | null;
        codeVerifier = formData.get("code_verifier") as string | null;
      } catch {
        // If formData parsing fails, try JSON as fallback
        const text = await request.text();
        log.info("formData parse failed, trying JSON fallback", {
          bodyPreview: text.substring(0, 200),
        });
        try {
          const json = JSON.parse(text);
          grantType = json.grant_type ?? null;
          code = json.code ?? null;
          redirectUri = json.redirect_uri ?? null;
          clientId = json.client_id ?? null;
          clientSecret = json.client_secret ?? null;
          codeVerifier = json.code_verifier ?? null;
        } catch {
          // Try URL-encoded parsing manually
          const params = new URLSearchParams(text);
          grantType = params.get("grant_type");
          code = params.get("code");
          redirectUri = params.get("redirect_uri");
          clientId = params.get("client_id");
          clientSecret = params.get("client_secret");
          codeVerifier = params.get("code_verifier");
        }
      }
    }

    log.info("Parsed token request params", {
      hasGrantType: !!grantType,
      hasCode: !!code,
      hasClientId: !!clientId,
      hasCodeVerifier: !!codeVerifier,
      hasRedirectUri: !!redirectUri,
    });

    // Validate grant_type
    if (grantType !== "authorization_code") {
      return tokenError(
        "unsupported_grant_type",
        "Only grant_type=authorization_code is supported",
      );
    }

    // Validate required parameters
    if (!code) {
      return tokenError("invalid_request", "code is required");
    }

    if (!clientId) {
      return tokenError("invalid_request", "client_id is required");
    }

    if (!codeVerifier) {
      return tokenError("invalid_request", "code_verifier is required (PKCE)");
    }

    // Get the authorization code
    const authCode = await getAuthCode(code);
    if (!authCode) {
      log.warn("Invalid or expired authorization code", {
        code: code.substring(0, 8) + "...",
      });
      return tokenError(
        "invalid_grant",
        "Invalid or expired authorization code",
      );
    }

    // Verify client_id matches
    if (authCode.clientId !== clientId) {
      log.warn("Client ID mismatch", {
        expected: authCode.clientId,
        received: clientId,
      });
      return tokenError("invalid_grant", "client_id does not match");
    }

    // Verify redirect_uri matches (if provided)
    if (redirectUri) {
      const isLocalhost = (host: string) =>
        host === "localhost" || host === "127.0.0.1";
      let redirectUriValid = authCode.redirectUri === redirectUri;

      if (!redirectUriValid) {
        try {
          const stored = new URL(authCode.redirectUri);
          const received = new URL(redirectUri);
          if (isLocalhost(stored.hostname) && isLocalhost(received.hostname)) {
            redirectUriValid =
              stored.protocol === received.protocol &&
              stored.pathname === received.pathname;
          }
        } catch {
          redirectUriValid = false;
        }
      }

      if (!redirectUriValid) {
        log.warn("Redirect URI mismatch", {
          expected: authCode.redirectUri,
          received: redirectUri,
        });
        return tokenError("invalid_grant", "redirect_uri does not match");
      }
    }

    // Verify client secret if provided (for confidential clients)
    if (clientSecret) {
      const client = await getClient(clientId);
      if (client?.secretHash) {
        const secretValid = await verifyClientSecret(clientId, clientSecret);
        if (!secretValid) {
          log.warn("Invalid client secret", { clientId });
          return tokenError("invalid_client", "Invalid client credentials");
        }
      }
    }

    // Verify PKCE
    const pkceValid = await verifyPkce(
      codeVerifier,
      authCode.codeChallenge,
      authCode.codeChallengeMethod,
    );

    if (!pkceValid) {
      log.warn("PKCE verification failed", {
        clientId,
        method: authCode.codeChallengeMethod,
      });
      return tokenError("invalid_grant", "PKCE verification failed");
    }

    // Consume the authorization code (single use)
    await consumeAuthCode(code);

    // Create OAuth access token
    const tokenResult = await createAccessToken({
      clientId,
      userId: authCode.userId,
      scope: authCode.scope || undefined,
    });

    log.info("Access token issued via OAuth", {
      clientId,
      userId: authCode.userId,
      tokenId: tokenResult.id,
    });

    // Return the access token
    return NextResponse.json(
      {
        access_token: tokenResult.token,
        token_type: "Bearer",
        // Set very long expiration (10 years in seconds)
        // Claude Code requires expires_in to be set
        expires_in: 315360000,
        scope: authCode.scope || undefined,
      },
      {
        headers: {
          "Cache-Control": "no-store",
          Pragma: "no-cache",
          ...corsHeaders,
        },
      },
    );
  } catch (error) {
    log.error("Token exchange failed", error);
    return tokenError("server_error", "Failed to exchange token");
  }
}

/**
 * Return token error response with CORS and cache headers
 *
 * @param error - OAuth error code
 * @param description - Human-readable error description
 * @returns JSON error response
 */
function tokenError(error: string, description: string): NextResponse {
  return NextResponse.json(
    {
      error,
      error_description: description,
    },
    {
      status: 400,
      headers: {
        "Cache-Control": "no-store",
        Pragma: "no-cache",
        ...corsHeaders,
      },
    },
  );
}
