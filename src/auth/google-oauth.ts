import type { Env } from "../worker/index";

export interface GoogleUser {
  id: string;
  email: string;
  name: string;
  picture: string;
}

export interface GoogleTokens {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
}

export interface SessionData {
  user: GoogleUser;
  access_token: string;
  expires_at: number;
}

interface GoogleUserInfo {
  id: string;
  email: string;
  name: string;
  picture: string;
}

export class GoogleOAuth {
  private clientId: string;
  private clientSecret: string;
  private redirectUri: string;
  private db: D1Database;

  constructor(env: Env) {
    this.clientId = env.GOOGLE_CLIENT_ID;
    this.clientSecret = env.GOOGLE_CLIENT_SECRET;
    this.redirectUri = "https://gas-metrics.harada-tsubasa-0422.workers.dev/auth/callback";
    this.db = env.DB;
  }

  // 認証URLを生成
  getAuthUrl(): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: "code",
      scope: "openid email profile https://www.googleapis.com/auth/script.metrics",
      access_type: "offline",
      prompt: "consent",
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  // 認証コードをトークンに交換
  async exchangeCodeForTokens(code: string): Promise<GoogleTokens> {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code: code,
        grant_type: "authorization_code",
        redirect_uri: this.redirectUri,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Token exchange failed: ${error}`);
    }

    return response.json();
  }

  // アクセストークンでユーザー情報を取得
  async getUserInfo(accessToken: string): Promise<GoogleUser> {
    const response = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error("Failed to get user info");
    }

    const userData = (await response.json()) as GoogleUserInfo;
    return {
      id: userData.id,
      email: userData.email,
      name: userData.name,
      picture: userData.picture,
    };
  }

  // セッションを作成
  async createSession(
    user: GoogleUser,
    accessToken: string,
    expiresIn: number,
    refreshToken?: string
  ): Promise<string> {
    const sessionId = crypto.randomUUID();

    // ユーザーを保存または更新
    await this.db
      .prepare(
        `
      INSERT OR REPLACE INTO users (id, email, name, image, created_at, updated_at)
      VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
    `
      )
      .bind(user.id, user.email, user.name, user.picture)
      .run();

    // アカウント情報を保存または更新（リフレッシュトークンを含む）
    await this.db
      .prepare(
        `
      INSERT OR REPLACE INTO accounts (userId, type, provider, providerAccountId, access_token, refresh_token, expires_at, token_type, scope, id_token, session_state)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
      )
      .bind(
        user.id,
        "oauth",
        "google",
        user.id,
        accessToken,
        refreshToken || null,
        Math.floor(Date.now() / 1000) + expiresIn,
        "Bearer",
        "openid email profile https://www.googleapis.com/auth/script.metrics",
        null,
        null
      )
      .run();

    // セッションを保存（30日間有効）
    const sessionExpiresIn = 30 * 24 * 60 * 60; // 30日間
    await this.db
      .prepare(
        `
      INSERT INTO sessions (sessionToken, userId, expires)
      VALUES (?, ?, datetime('now', '+' || ? || ' seconds'))
    `
      )
      .bind(sessionId, user.id, sessionExpiresIn)
      .run();

    return sessionId;
  }

  // セッションからユーザー情報を取得
  async getSessionUser(sessionId: string): Promise<GoogleUser | null> {
    const session = await this.db
      .prepare(
        `
      SELECT s.*, u.* FROM sessions s
      JOIN users u ON s.userId = u.id
      WHERE s.sessionToken = ? AND s.expires > datetime('now')
    `
      )
      .bind(sessionId)
      .first();

    if (!session || typeof session !== "object") {
      return null;
    }

    const sessionData = session as Record<string, unknown>;
    if (
      typeof sessionData.id === "string" &&
      typeof sessionData.email === "string" &&
      typeof sessionData.name === "string" &&
      typeof sessionData.image === "string"
    ) {
      return {
        id: sessionData.id,
        email: sessionData.email,
        name: sessionData.name,
        picture: sessionData.image,
      };
    }
    return null;
  }

  // セッションを削除
  async deleteSession(sessionId: string): Promise<void> {
    await this.db
      .prepare(
        `
      DELETE FROM sessions WHERE sessionToken = ?
    `
      )
      .bind(sessionId)
      .run();
  }
}
