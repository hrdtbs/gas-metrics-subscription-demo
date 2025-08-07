import type { GasScriptMetricsResponse } from "../gas/types";

export interface WebhookNotificationPayload {
  scriptId: string;
  data: GasScriptMetricsResponse;
}
