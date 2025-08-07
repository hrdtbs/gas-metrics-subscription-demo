-- Monitoring system tables

-- 監視設定テーブル
CREATE TABLE monitor_configs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    script_id TEXT NOT NULL,
    webhook_url TEXT NOT NULL,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

-- 監視ログテーブル（エラー検知履歴）
CREATE TABLE monitor_logs (
    id TEXT PRIMARY KEY,
    config_id TEXT NOT NULL,
    check_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    error_count INTEGER DEFAULT 0,
    notification_sent INTEGER DEFAULT 0,
    error_details TEXT,
    FOREIGN KEY (config_id) REFERENCES monitor_configs (id) ON DELETE CASCADE
);

-- Indexes for monitoring tables
CREATE INDEX idx_monitor_configs_user_id ON monitor_configs(user_id);
CREATE INDEX idx_monitor_configs_active ON monitor_configs(is_active);
CREATE INDEX idx_monitor_logs_config_id ON monitor_logs(config_id);
CREATE INDEX idx_monitor_logs_check_time ON monitor_logs(check_time);
