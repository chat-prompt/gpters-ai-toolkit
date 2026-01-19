import type { Plugin, AuthHook, AuthOuathResult } from "@opencode-ai/plugin"

const PREFIX = "*Working with GPTers AI Toolkit*\n\n"

const OAUTH_CONFIG = {
  baseUrl: process.env.GPTERS_OAUTH_URL || "https://ai-toolkit.gpters.org",
  provider: "gpters-ai-toolkit",
}

function generateRandomString(length: number): string {
  const randomBytes = crypto.getRandomValues(new Uint8Array(length))
  return Array.from(randomBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

function generateCodeVerifier(): string {
  return generateRandomString(32)
}

// PKCE S256: code_challenge = BASE64URL(SHA256(code_verifier))
async function generateCodeChallenge(codeVerifier: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(codeVerifier)
  const hashBuffer = await crypto.subtle.digest("SHA-256", data)

  const base64 = btoa(String.fromCharCode(...new Uint8Array(hashBuffer)))
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function createAuthHook(): AuthHook {
  return {
    provider: OAUTH_CONFIG.provider,

    loader: async (auth, _provider) => {
      try {
        const authData = await auth()
        if (authData && "access" in authData && authData.access) {
          return {
            Authorization: `Bearer ${authData.access}`,
          }
        }
      } catch {
      }
      return {}
    },

    methods: [
      {
        type: "oauth",
        label: "GPTers Google 계정으로 로그인",

        async authorize(): Promise<AuthOuathResult> {
          const codeVerifier = generateCodeVerifier()
          const codeChallenge = await generateCodeChallenge(codeVerifier)
          const state = generateRandomString(16)

          const port = 19823 + Math.floor(Math.random() * 100)
          const redirectUri = `http://127.0.0.1:${port}/callback`

          const registerResponse = await fetch(
            `${OAUTH_CONFIG.baseUrl}/oauth/register`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                client_name: "OpenCode Plugin",
                redirect_uris: [redirectUri],
              }),
            }
          )

          if (!registerResponse.ok) {
            throw new Error(
              `Client registration failed: ${registerResponse.status}`
            )
          }

          const clientInfo = (await registerResponse.json()) as {
            client_id: string
            client_secret: string
          }

          const authUrl = new URL(`${OAUTH_CONFIG.baseUrl}/oauth/authorize`)
          authUrl.searchParams.set("client_id", clientInfo.client_id)
          authUrl.searchParams.set("redirect_uri", redirectUri)
          authUrl.searchParams.set("response_type", "code")
          authUrl.searchParams.set("code_challenge", codeChallenge)
          authUrl.searchParams.set("code_challenge_method", "S256")
          authUrl.searchParams.set("state", state)
          authUrl.searchParams.set("scope", "read write")

          return {
            url: authUrl.toString(),
            instructions:
              "브라우저에서 GPTers Google 계정으로 로그인하세요. (@gpters.org 도메인만 허용)",
            method: "auto",

            async callback(): Promise<
              | {
                type: "success"
                provider?: string
                refresh: string
                access: string
                expires: number
                accountId?: string
              }
              | { type: "success"; provider?: string; key: string }
              | { type: "failed" }
            > {
              return new Promise((resolve) => {
                const server = Bun.serve({
                  port,
                  async fetch(req) {
                    const url = new URL(req.url)

                    if (url.pathname === "/callback") {
                      const code = url.searchParams.get("code")
                      const returnedState = url.searchParams.get("state")
                      const error = url.searchParams.get("error")

                      setTimeout(() => server.stop(), 100)

                      if (error) {
                        console.error("[GPTers Auth] OAuth error:", error)
                        resolve({ type: "failed" })
                        return new Response(
                          htmlResponse("인증 실패", `오류: ${error}`),
                          { headers: { "Content-Type": "text/html" } }
                        )
                      }

                      if (!code || returnedState !== state) {
                        console.error("[GPTers Auth] Invalid callback params")
                        resolve({ type: "failed" })
                        return new Response(
                          htmlResponse("인증 실패", "잘못된 인증 응답"),
                          { headers: { "Content-Type": "text/html" } }
                        )
                      }

                      try {
                        const tokenResponse = await fetch(
                          `${OAUTH_CONFIG.baseUrl}/oauth/token`,
                          {
                            method: "POST",
                            headers: {
                              "Content-Type": "application/x-www-form-urlencoded",
                            },
                            body: new URLSearchParams({
                              grant_type: "authorization_code",
                              code,
                              client_id: clientInfo.client_id,
                              client_secret: clientInfo.client_secret,
                              code_verifier: codeVerifier,
                              redirect_uri: redirectUri,
                            }),
                          }
                        )

                        if (!tokenResponse.ok) {
                          const errorData = await tokenResponse.text()
                          console.error(
                            "[GPTers Auth] Token exchange failed:",
                            errorData
                          )
                          resolve({ type: "failed" })
                          return new Response(
                            htmlResponse("인증 실패", "토큰 교환 실패"),
                            { headers: { "Content-Type": "text/html" } }
                          )
                        }

                        const tokenData = (await tokenResponse.json()) as {
                          access_token: string
                          expires_in: number
                          token_type: string
                        }

                        console.log("[GPTers Auth] Successfully authenticated")

                        resolve({
                          type: "success",
                          provider: OAUTH_CONFIG.provider,
                          access: tokenData.access_token,
                          refresh: "",
                          expires: Date.now() + tokenData.expires_in * 1000,
                        })

                        return new Response(
                          htmlResponse(
                            "인증 성공!",
                            "GPTers AI Toolkit에 연결되었습니다. 이 창을 닫아도 됩니다."
                          ),
                          { headers: { "Content-Type": "text/html" } }
                        )
                      } catch (err) {
                        console.error("[GPTers Auth] Token exchange error:", err)
                        resolve({ type: "failed" })
                        return new Response(
                          htmlResponse("인증 실패", "토큰 교환 중 오류"),
                          { headers: { "Content-Type": "text/html" } }
                        )
                      }
                    }

                    return new Response("Not Found", { status: 404 })
                  },
                })

                console.log(
                  `[GPTers Auth] Callback server listening on port ${port}`
                )

                setTimeout(() => {
                  server.stop()
                  resolve({ type: "failed" })
                }, 5 * 60 * 1000)
              })
            },
          }
        },
      },
    ],
  }
}

function htmlResponse(title: string, message: string): string {
  const isSuccess = title.includes("성공")
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${title} - GPTers AI Toolkit</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      margin: 0;
      background: ${isSuccess ? "linear-gradient(135deg, #667eea 0%, #764ba2 100%)" : "#f5f5f5"};
    }
    .card {
      background: white;
      padding: 3rem;
      border-radius: 16px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.2);
      text-align: center;
      max-width: 400px;
    }
    h1 { color: ${isSuccess ? "#667eea" : "#e74c3c"}; margin-bottom: 1rem; }
    p { color: #666; line-height: 1.6; }
    .icon { font-size: 4rem; margin-bottom: 1rem; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${isSuccess ? "✅" : "❌"}</div>
    <h1>${title}</h1>
    <p>${message}</p>
  </div>
</body>
</html>`
}

export const GPTersPlugin: Plugin = async ({ directory }) => {
  console.log("[GPTers Plugin] Loaded:", directory)
  console.log("[GPTers Plugin] Auth provider:", OAUTH_CONFIG.provider)

  const processedMessages = new Set<string>()
  const authHook = createAuthHook()
  console.log("[GPTers Plugin] Auth hook created:", authHook.provider, authHook.methods.length, "methods")

  return {
    event: async () => { },
    auth: authHook,
    "experimental.text.complete": async (input, output) => {
      const key = `${input.sessionID}-${input.messageID}`
      if (processedMessages.has(key)) return

      processedMessages.add(key)
      output.text = PREFIX + output.text
    },
  }
}

export default GPTersPlugin
