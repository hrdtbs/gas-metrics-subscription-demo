-- Clean initial migration for Auth.js D1 adapter
-- 認証システムに必要なテーブルのみを含む

-- Users table (Auth.js compatible)
CREATE TABLE users (
    id TEXT PRIMARY KEY,
    name TEXT,
    email TEXT NOT NULL UNIQUE,
    image TEXT,
    emailVerified DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Accounts table (Auth.js required)
CREATE TABLE accounts (
    userId TEXT NOT NULL,
    type TEXT NOT NULL,
    provider TEXT NOT NULL,
    providerAccountId TEXT NOT NULL,
    refresh_token TEXT,
    access_token TEXT,
    expires_at INTEGER,
    token_type TEXT,
    scope TEXT,
    id_token TEXT,
    session_state TEXT,
    oauth_token TEXT,
    oauth_token_secret TEXT,
    oauth_verifier TEXT,
    PRIMARY KEY (userId, provider),
    FOREIGN KEY (userId) REFERENCES users (id) ON DELETE CASCADE
);

-- Sessions table (Auth.js required)
CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    sessionToken TEXT UNIQUE NOT NULL,
    userId TEXT NOT NULL,
    expires DATETIME NOT NULL,
    FOREIGN KEY (userId) REFERENCES users (id) ON DELETE CASCADE
);

-- Verification tokens table (Auth.js required for email verification)
CREATE TABLE verificationTokens (
    identifier TEXT NOT NULL,
    token TEXT UNIQUE NOT NULL,
    expires DATETIME NOT NULL,
    PRIMARY KEY (identifier, token)
);

-- Indexes for performance
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_accounts_userId ON accounts(userId);
CREATE INDEX idx_accounts_provider_providerAccountId ON accounts(provider, providerAccountId);
CREATE INDEX idx_sessions_userId ON sessions(userId);
CREATE INDEX idx_sessions_sessionToken ON sessions(sessionToken);
CREATE INDEX idx_verificationTokens_token ON verificationTokens(token);
