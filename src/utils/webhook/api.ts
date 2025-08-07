import type { WebhookNotificationPayload } from "./types";

export async function sendNotification(
  webhookUrl: string,
  payload: WebhookNotificationPayload
): Promise<void> {
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      console.error(`Webhook notification failed: ${response.status}`);
    } else {
      console.log("Notification sent successfully");
    }
  } catch (error) {
    console.error("Error sending notification:", error);
  }
}
