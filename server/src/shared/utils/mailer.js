import { env } from "../config/env.js";
import { logError } from "./logger.js";

// Talks to Resend's REST API directly via fetch rather than pulling in the
// "resend" npm package -- Node 22 has fetch built in, and this is a single
// simple POST, so a whole SDK dependency isn't worth adding for it.
//
// When RESEND_API_KEY isn't configured (e.g. local dev, or before the user
// has set one up), this logs the email to the server console instead of
// sending it. That keeps forgot-password fully functional for
// development/testing without ever silently failing or throwing, while
// still exercising the exact same token-generation/expiry/single-use
// security logic that runs in production.
export async function sendEmail({ to, subject, html, text }) {
  if (!env.RESEND_API_KEY) {
    logError("RESEND_API_KEY not configured -- logging email instead of sending", {
      to,
      subject,
      preview: text || html,
    });
    return { delivered: false, reason: "no_api_key" };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.RESEND_FROM_EMAIL,
      to: [to],
      subject,
      html,
      text,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    logError("Resend API request failed", { status: res.status, body });
    return { delivered: false, reason: "provider_error" };
  }

  return { delivered: true };
}
