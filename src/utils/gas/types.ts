export interface GasScriptMetricsResponse {
  activeUsers: {
    startTime: string;
    endTime: string;
  }[];
  totalExecutions: {
    value: string;
    startTime: string;
    endTime: string;
  }[];
  failedExecutions: {
    value?: string;
    startTime: string;
    endTime: string;
  }[];
}

export function assertGasScriptMetricsResponse(
  obj: unknown
): asserts obj is GasScriptMetricsResponse {
  if (
    typeof obj === "object" &&
    obj !== null &&
    "activeUsers" in obj &&
    "totalExecutions" in obj &&
    "failedExecutions" in obj
  ) {
    return;
  }
  throw new Error(
    `Invalid response format from Google Apps Script Metrics API: ${JSON.stringify(obj)}`
  );
}

export interface OAuthTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
}

export function assertOAuthTokenResponse(obj: unknown): asserts obj is OAuthTokenResponse {
  if (
    typeof obj === "object" &&
    obj !== null &&
    "access_token" in obj &&
    typeof (obj as Record<string, unknown>).access_token === "string"
  ) {
    return;
  }
  throw new Error(`Invalid response format from OAuth API: ${JSON.stringify(obj)}`);
}
