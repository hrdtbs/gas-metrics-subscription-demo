import type { Result } from "../result";
import {
  assertGasScriptMetricsResponse,
  assertOAuthTokenResponse,
  type GasScriptMetricsResponse,
  type OAuthTokenResponse,
} from "./types";

export async function getScriptMetrics(
  scriptId: string,
  accessToken: string
): Promise<Result<GasScriptMetricsResponse>> {
  try {
    const url = new URL(`https://script.googleapis.com/v1/projects/${scriptId}/metrics`);
    url.searchParams.set("metricsGranularity", "DAILY");

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorData = await response.json();
      return {
        error: new Error(
          `API request failed with status ${response.status}: ${JSON.stringify(errorData)}`
        ),
      };
    }
    const metricsData = await response.json();
    assertGasScriptMetricsResponse(metricsData);
    return {
      data: metricsData,
    };
  } catch (error) {
    return {
      error: new Error(`Failed to fetch metrics: ${JSON.stringify(error)}`),
    };
  }
}

export async function refreshAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string
): Promise<Result<OAuthTokenResponse>> {
  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      return {
        error: new Error(`Token refresh failed: ${JSON.stringify(error)}`),
      };
    }

    const tokenData = await response.json();
    assertOAuthTokenResponse(tokenData);

    return {
      data: tokenData,
    };
  } catch (error) {
    return {
      error: new Error(`Failed to refresh access token: ${JSON.stringify(error)}`),
    };
  }
}
