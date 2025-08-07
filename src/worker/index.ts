import { GoogleOAuth } from "../auth/google-oauth";
import config from "../frontend/public-config.json";
import { getScriptMetrics, refreshAccessToken } from "../utils/gas/api";
import { generateId } from "../utils/generate-id";
import { sendNotification } from "../utils/webhook/api";

// Type definitions
interface MonitorConfig {
  id: string;
  user_id: string;
  script_id: string;
  webhook_url: string;
  is_active: number;
  created_at: string;
  updated_at: string;
  refresh_token?: string;
}

interface SessionUser {
  id: string;
  email: string;
  name: string;
}

interface UserSession {
  user: SessionUser;
}

interface CreateConfigRequest {
  script_id: string;
  webhook_url: string;
}

export interface Env {
  DB: D1Database;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  AUTH_SECRET: string;
}

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS headers
    const corsHeaders = {
      "Access-Control-Allow-Origin": config.site,
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, Cookie",
      "Access-Control-Allow-Credentials": "true",
    };

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // Health check endpoint
    if (path === "/health") {
      return new Response(JSON.stringify({ status: "ok", timestamp: new Date().toISOString() }), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Custom Google OAuth routes
    if (path === "/auth/signin") {
      const oauth = new GoogleOAuth(env);
      const authUrl = oauth.getAuthUrl();
      return Response.redirect(authUrl);
    }

    if (path === "/auth/callback") {
      const url = new URL(request.url);
      const code = url.searchParams.get("code");

      if (!code) {
        return new Response("Authorization code not found", { status: 400 });
      }

      try {
        const oauth = new GoogleOAuth(env);
        const tokens = await oauth.exchangeCodeForTokens(code);
        const user = await oauth.getUserInfo(tokens.access_token);

        const sessionId = await oauth.createSession(
          user,
          tokens.access_token,
          tokens.expires_in,
          tokens.refresh_token
        );

        // Set session cookie and redirect
        const headers = new Headers();
        const sessionMaxAge = 30 * 24 * 60 * 60; // 30日間
        headers.set(
          "Set-Cookie",
          `session=${sessionId}; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=${sessionMaxAge}`
        );
        headers.set("Location", config.site);

        return new Response(null, {
          status: 302,
          headers: headers,
        });
      } catch (error) {
        return new Response(`Authentication failed: ${error}`, { status: 500 });
      }
    }

    // API routes (protected)
    if (path.startsWith("/api/")) {
      return handleAPI(request, env, path);
    }

    // Default response (API server information)
    return new Response("Gas Metrics API Server", {
      headers: { "Content-Type": "text/plain", ...corsHeaders },
    });
  },

  // Cron trigger for monitoring
  async scheduled(
    _controller: ScheduledController,
    env: Env,
    _ctx: ExecutionContext
  ): Promise<void> {
    console.log("Running scheduled monitoring task...");
    await runMonitoringTask(env);
  },
};

async function handleAPI(request: Request, env: Env, path: string): Promise<Response> {
  const corsHeaders = {
    "Access-Control-Allow-Origin": config.site,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Cookie",
    "Access-Control-Allow-Credentials": "true",
  };

  try {
    // セッション認証チェック（GET /api/session は除外）
    if (path !== "/api/session") {
      const session = await getSession(request, env);
      if (!session) {
        return new Response(JSON.stringify({ error: "Authentication required" }), {
          status: 401,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
    }

    // GET /api/session - セッション情報取得
    if (path === "/api/session" && request.method === "GET") {
      try {
        // クッキーからセッションIDを取得
        const cookie = request.headers.get("cookie");
        console.log("Cookie for session:", cookie);

        if (!cookie) {
          console.log("No cookie found");
          return new Response(JSON.stringify({ session: null }), {
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }

        const sessionMatch = cookie.match(/session=([^;]+)/);
        if (!sessionMatch) {
          console.log("No session cookie found in:", cookie);
          return new Response(JSON.stringify({ session: null }), {
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }

        const sessionId = sessionMatch[1];
        if (!sessionId) {
          console.log("Empty session ID");
          return new Response(JSON.stringify({ session: null }), {
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }
        console.log("Found session ID:", sessionId);

        // セッションからユーザー情報を取得
        const oauth = new GoogleOAuth(env);
        const user = await oauth.getSessionUser(sessionId);

        if (!user) {
          return new Response(JSON.stringify({ session: null }), {
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }

        const sessionData = {
          session: {
            user: {
              id: user.id,
              email: user.email,
              name: user.name,
              image: user.picture,
            },
          },
        };

        console.log("Session data:", sessionData);
        return new Response(JSON.stringify(sessionData), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      } catch (error) {
        console.error("Session API error:", error);
        return new Response(JSON.stringify({ session: null }), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
    }
    // GET /api/configs - 監視設定一覧取得（ユーザー固有）
    if (path === "/api/configs" && request.method === "GET") {
      const user = await getUserFromSession(request, env);

      if (!user) {
        return new Response(JSON.stringify({ error: "User not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      const configs = await env.DB.prepare(
        "SELECT * FROM monitor_configs WHERE user_id = ? AND is_active = 1"
      )
        .bind(user.id)
        .all();

      return new Response(JSON.stringify({ configs: configs.results }), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // POST /api/configs - 監視設定作成
    if (path === "/api/configs" && request.method === "POST") {
      const user = await getUserFromSession(request, env);
      if (!user) {
        return new Response(JSON.stringify({ error: "User not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      const body = (await request.json()) as CreateConfigRequest;
      const { script_id, webhook_url } = body;

      if (!script_id || !webhook_url) {
        return new Response(
          JSON.stringify({
            error: "Missing required fields: script_id, webhook_url",
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          }
        );
      }

      const configId = generateId();
      await env.DB.prepare(
        `
        INSERT INTO monitor_configs (id, user_id, script_id, webhook_url) 
        VALUES (?, ?, ?, ?)
      `
      )
        .bind(configId, user.id, script_id, webhook_url)
        .run();

      return new Response(
        JSON.stringify({
          success: true,
          config_id: configId,
        }),
        {
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    // POST /api/configs/{id}/test - 監視設定のテスト実行
    if (path.match(/^\/api\/configs\/([^/]+)\/test$/) && request.method === "POST") {
      const user = await getUserFromSession(request, env);
      if (!user) {
        return new Response(JSON.stringify({ error: "User not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      try {
        const configId = path.split("/")[3];

        // 設定を取得（リフレッシュトークンも含む）
        const config = await env.DB.prepare(
          `
          SELECT mc.*, a.refresh_token 
          FROM monitor_configs mc 
          JOIN accounts a ON mc.user_id = a.userId 
          WHERE mc.id = ? AND mc.user_id = ? AND a.provider = 'google'
        `
        )
          .bind(configId, user.id)
          .first();

        if (!config) {
          return new Response(JSON.stringify({ error: "Config not found" }), {
            status: 404,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }

        console.log(`Testing config: ${configId}`);
        await checkScriptMetrics(config as unknown as MonitorConfig, env);

        return new Response(JSON.stringify({ message: "Test completed" }), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      } catch (error) {
        console.error("Test execution error:", error);
        return new Response(JSON.stringify({ error: "Failed to execute test" }), {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
    }

    // GET /api/logs - 監視ログ取得（ユーザー固有）
    if (path === "/api/logs" && request.method === "GET") {
      const user = await getUserFromSession(request, env);
      if (!user) {
        return new Response(JSON.stringify({ error: "User not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      const url = new URL(request.url);
      const limit = parseInt(url.searchParams.get("limit") || "50");
      const offset = parseInt(url.searchParams.get("offset") || "0");

      const logs = await env.DB.prepare(
        `
        SELECT ml.*, mc.script_id, mc.webhook_url
        FROM monitor_logs ml
        JOIN monitor_configs mc ON ml.config_id = mc.id
        WHERE mc.user_id = ?
        ORDER BY ml.check_time DESC
        LIMIT ? OFFSET ?
      `
      )
        .bind(user.id, limit, offset)
        .all();

      return new Response(
        JSON.stringify({
          logs: logs.results,
          pagination: {
            limit,
            offset,
            total: logs.results.length,
          },
        }),
        {
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    return new Response(JSON.stringify({ error: "Route not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error) {
    console.error("API Error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
}

async function runMonitoringTask(env: Env): Promise<void> {
  try {
    // アクティブな監視設定を取得
    console.log("Starting monitoring task...");

    // 直接SQLでリフレッシュトークンを取得
    const configs = await env.DB.prepare(
      `
      SELECT 
        mc.id,
        mc.user_id,
        mc.script_id,
        mc.webhook_url,
        mc.is_active,
        mc.created_at,
        mc.updated_at,
        a.refresh_token
      FROM monitor_configs mc 
      JOIN accounts a ON mc.user_id = a.userId 
      WHERE mc.is_active = 1 AND a.provider = 'google'
    `
    ).all();

    console.log(`Found ${configs.results.length} active monitoring configs`);

    for (const config of configs.results) {
      await checkScriptMetrics(config as unknown as MonitorConfig, env);
    }
  } catch (error) {
    console.error("Monitoring task error:", error);
  }
}

async function checkScriptMetrics(config: MonitorConfig, env: Env): Promise<void> {
  try {
    console.log(`Checking script ${config.script_id} for user ${config.user_id}`);

    // リフレッシュトークンが無い場合はスキップ
    if (!config.refresh_token) {
      console.log(`No refresh token for user ${config.user_id}, skipping`);
      return;
    }

    // リフレッシュトークンを直接使用
    const refreshToken = config.refresh_token;

    // アクセストークンを取得
    const tokenResult = await refreshAccessToken(
      refreshToken,
      env.GOOGLE_CLIENT_ID,
      env.GOOGLE_CLIENT_SECRET
    );

    if (tokenResult.error) {
      throw tokenResult.error;
    }

    const metricsResult = await getScriptMetrics(config.script_id, tokenResult.data.access_token);
    if (metricsResult.error) {
      throw metricsResult.error;
    }

    // 正常系の場合のみWebhookに通知
    await sendNotification(config.webhook_url, {
      scriptId: config.script_id,
      data: metricsResult.data,
    });

    await env.DB.prepare(
      `
      INSERT INTO monitor_logs (id, config_id, error_count, notification_sent, error_details)
      VALUES (?, ?, ?, ?, ?)
    `
    )
      .bind(generateId(), config.id, 0, 0, JSON.stringify(metricsResult as Record<string, unknown>))
      .run();
  } catch (error) {
    await env.DB.prepare(
      `
      INSERT INTO monitor_logs (id, config_id, error_count, notification_sent, error_details)
      VALUES (?, ?, ?, ?, ?)
    `
    )
      .bind(generateId(), config.id, 0, 0, `Monitoring error: ${error}`)
      .run();
  }
}

async function getSession(request: Request, env: Env): Promise<UserSession | null> {
  try {
    const cookie = request.headers.get("cookie");
    if (!cookie) {
      return null;
    }

    const sessionMatch = cookie.match(/session=([^;]+)/);
    if (!sessionMatch || !sessionMatch[1]) {
      return null;
    }

    const sessionId = sessionMatch[1];
    const oauth = new GoogleOAuth(env);
    const user = await oauth.getSessionUser(sessionId);

    if (!user) {
      return null;
    }

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    };
  } catch (error) {
    console.error("Session validation error:", error);
    return null;
  }
}

async function getUserFromSession(request: Request, env: Env): Promise<SessionUser | null> {
  const session = await getSession(request, env);
  if (!session?.user) {
    return null;
  }
  return session.user;
}
