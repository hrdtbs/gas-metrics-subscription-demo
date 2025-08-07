import config from "./public-config.json" with { type: "json" };

const API_BASE_URL = config.worker;

// DOM要素
const loginBtn = document.getElementById("login-btn");
const logoutBtn = document.getElementById("logout-btn");
const userInfo = document.getElementById("user-info");
const userEmail = document.getElementById("user-email");
const configSection = document.getElementById("config-section");
const configForm = document.getElementById("config-form");
const statusDiv = document.getElementById("status");
const configsContainer = document.getElementById("configs-container");
const logsContainer = document.getElementById("logs-container");
const loadMoreLogsBtn = document.getElementById("load-more-logs");

// 状態管理
let currentUser = null;
let currentLogsOffset = 0;
const LOGS_LIMIT = 20;

// 初期化
document.addEventListener("DOMContentLoaded", () => {
  checkAuthStatus();
  setupEventListeners();
});

function setupEventListeners() {
  loginBtn.addEventListener("click", login);
  logoutBtn.addEventListener("click", logout);
  configForm.addEventListener("submit", handleConfigSubmit);
  loadMoreLogsBtn.addEventListener("click", loadMoreLogs);
}

async function checkAuthStatus() {
  try {
    // Auth.jsのセッションAPIから認証状態を確認
    const response = await fetch(`${API_BASE_URL}/api/session`, {
      credentials: "include",
    });

    if (response.ok) {
      const data = await response.json();
      if (data.session?.user) {
        currentUser = {
          id: data.session.user.id || data.session.user.email,
          email: data.session.user.email,
          name: data.session.user.name,
        };

        // ローカルストレージにも保存（オフライン時の表示用）
        localStorage.setItem("user_session", JSON.stringify(currentUser));

        showAuthenticatedUI();
        loadConfigs();
        loadLogs();
        return;
      }
    }

    // セッションが無効な場合はローカルストレージもクリア
    localStorage.removeItem("user_session");
    showUnauthenticatedUI();
  } catch (error) {
    console.error("Auth status check error:", error);

    // APIが利用できない場合はローカルストレージから復元を試行
    const userSession = localStorage.getItem("user_session");
    if (userSession) {
      try {
        currentUser = JSON.parse(userSession);
        showAuthenticatedUI();
        loadConfigs();
        loadLogs();
      } catch (parseError) {
        console.error("Invalid session data:", parseError);
        localStorage.removeItem("user_session");
        showUnauthenticatedUI();
      }
    } else {
      showUnauthenticatedUI();
    }
  }
}

function login() {
  // Auth.jsのサインインページにリダイレクト
  window.location.href = `${API_BASE_URL}/auth/signin`;
}

async function logout() {
  try {
    // Auth.jsのサインアウトエンドポイントを呼び出し
    await fetch(`${API_BASE_URL}/auth/signout`, {
      method: "POST",
      credentials: "include",
    });

    // ローカルの状態をクリア
    localStorage.removeItem("user_session");
    currentUser = null;
    showUnauthenticatedUI();
    showStatus("ログアウトしました", "success");
  } catch (error) {
    console.error("Logout error:", error);
    showStatus("ログアウトに失敗しました", "error");
  }
}

function showAuthenticatedUI() {
  loginBtn.classList.add("hidden");
  userInfo.classList.remove("hidden");
  configSection.style.display = "block";
  userEmail.textContent = currentUser.email;
}

function showUnauthenticatedUI() {
  loginBtn.classList.remove("hidden");
  userInfo.classList.add("hidden");
  configSection.style.display = "none";
}

async function handleConfigSubmit(event) {
  event.preventDefault();

  const scriptId = document.getElementById("script-id").value.trim();
  const webhookUrl = document.getElementById("webhook-url").value.trim();

  if (!scriptId || !webhookUrl) {
    showStatus("すべてのフィールドを入力してください", "error");
    return;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/configs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({
        script_id: scriptId,
        webhook_url: webhookUrl,
      }),
    });

    if (response.ok) {
      const _result = await response.json();
      showStatus("監視設定を追加しました", "success");
      configForm.reset();
      loadConfigs(); // 設定リストを再読み込み
      loadLogs(); // ログも再読み込み
    } else {
      const error = await response.json();
      showStatus(`エラー: ${error.error || "Unknown error"}`, "error");
    }
  } catch (error) {
    console.error("Config submission error:", error);
    showStatus("設定の追加に失敗しました", "error");
  }
}

async function loadConfigs() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/configs`, {
      credentials: "include",
    });

    if (response.ok) {
      const data = await response.json();
      displayConfigs(data.configs || []);
    } else if (response.status === 401) {
      // 認証が無効な場合
      showStatus("ログインが必要です", "error");
      showUnauthenticatedUI();
    } else {
      configsContainer.innerHTML = "<p>設定の読み込みに失敗しました</p>";
    }
  } catch (error) {
    console.error("Load configs error:", error);
    configsContainer.innerHTML = "<p>設定の読み込み中にエラーが発生しました</p>";
  }
}

function displayConfigs(configs) {
  if (configs.length === 0) {
    configsContainer.innerHTML =
      "<p>監視設定がありません。上記のフォームから設定を追加してください。</p>";
    return;
  }

  const configsHtml = configs
    .map(
      (config) => `
        <div class="config-item">
            <h4>📊 スクリプト監視</h4>
            <p><strong>スクリプトID:</strong> ${config.script_id}</p>
            <p><strong>Webhook URL:</strong> ${config.webhook_url}</p>
            <p><strong>ステータス:</strong> ${config.is_active ? "✅ アクティブ" : "❌ 無効"}</p>
            <p><strong>作成日:</strong> ${new Date(config.created_at).toLocaleString("ja-JP")}</p>
            <button onclick="testConfig('${config.id}')" class="test-btn">🧪 テスト実行</button>
        </div>
    `
    )
    .join("");

  configsContainer.innerHTML = configsHtml;
}

function showStatus(message, type) {
  statusDiv.textContent = message;
  statusDiv.className = `status ${type}`;
  statusDiv.classList.remove("hidden");

  // 3秒後に自動で非表示
  setTimeout(() => {
    statusDiv.classList.add("hidden");
  }, 3000);
}

// API接続テスト
async function testAPIConnection() {
  try {
    const response = await fetch(`${API_BASE_URL}/health`);
    if (response.ok) {
      console.log("API connection successful");
    }
  } catch (error) {
    console.warn("API connection failed:", error);
  }
}

// ログ関連の関数
async function loadLogs(reset = true) {
  try {
    if (reset) {
      currentLogsOffset = 0;
      logsContainer.innerHTML = "<p>ログを読み込み中...</p>";
    }

    const response = await fetch(
      `${API_BASE_URL}/api/logs?limit=${LOGS_LIMIT}&offset=${currentLogsOffset}`,
      {
        credentials: "include",
      }
    );

    if (response.ok) {
      const data = await response.json();

      if (reset) {
        displayLogs(data.logs || []);
      } else {
        appendLogs(data.logs || []);
      }

      // さらに読み込むボタンの表示/非表示
      if (data.logs && data.logs.length === LOGS_LIMIT) {
        loadMoreLogsBtn.style.display = "inline-block";
      } else {
        loadMoreLogsBtn.style.display = "none";
      }
    } else if (response.status === 401) {
      logsContainer.innerHTML = "<p>ログインが必要です</p>";
      showUnauthenticatedUI();
    } else {
      logsContainer.innerHTML = "<p>ログの読み込みに失敗しました</p>";
    }
  } catch (error) {
    console.error("Load logs error:", error);
    logsContainer.innerHTML = "<p>ログの読み込み中にエラーが発生しました</p>";
  }
}

async function loadMoreLogs() {
  currentLogsOffset += LOGS_LIMIT;
  await loadLogs(false);
}

// 監視設定のテスト実行
// biome-ignore lint/correctness/noUnusedVariables: Nodeの文字列として渡している
async function testConfig(configId) {
  try {
    showStatus("テスト実行中...", "info");

    const response = await fetch(`${API_BASE_URL}/api/configs/${configId}/test`, {
      method: "POST",
      credentials: "include",
    });

    if (response.ok) {
      showStatus("テスト実行が完了しました", "success");
      // ログを再読み込み
      await loadLogs();
    } else {
      const error = await response.json();
      showStatus(`テスト実行に失敗しました: ${error.error}`, "error");
    }
  } catch (error) {
    console.error("Test execution error:", error);
    showStatus("テスト実行中にエラーが発生しました", "error");
  }
}

function displayLogs(logs) {
  if (logs.length === 0) {
    logsContainer.innerHTML = "<p>監視ログがありません。</p>";
    return;
  }

  const logsHtml = logs.map((log) => createLogItem(log)).join("");
  logsContainer.innerHTML = logsHtml;
}

function appendLogs(logs) {
  const logsHtml = logs.map((log) => createLogItem(log)).join("");
  logsContainer.innerHTML += logsHtml;
}

function createLogItem(log) {
  const checkTime = new Date(log.check_time).toLocaleString("ja-JP");
  const logType = log.error_count > 0 ? "error" : log.notification_sent ? "warning" : "success";
  const statusIcon = log.error_count > 0 ? "🚨" : log.notification_sent ? "📢" : "✅";

  return `
    <div class="log-item ${logType}">
      <h4>${statusIcon} ${log.script_id}</h4>
      <p><strong>チェック時刻:</strong> ${checkTime}</p>
      ${log.error_count > 0 ? `<p><strong>エラー数:</strong> ${log.error_count}</p>` : ""}
      ${log.notification_sent ? "<p><strong>通知:</strong> 送信済み</p>" : ""}
      ${log.error_details ? `<p><strong>詳細:</strong> ${log.error_details}</p>` : ""}
    </div>
  `;
}

// ページ読み込み時にAPI接続をテスト
testAPIConnection();
