import { brand } from "@/lib/config";

export interface Email {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** RFC 8058 one-click unsubscribe URL. */
  unsubscribeUrl?: string;
}

/**
 * Sends through Resend when RESEND_API_KEY is set; otherwise logs the email
 * (with links) to the server console so every flow works locally.
 */
export async function sendEmail(email: Email): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log(
      `\n──── email (RESEND_API_KEY not set, not sent) ────\nTo: ${email.to}\nSubject: ${email.subject}\n\n${email.text}\n──────────────────────────────────────────────\n`,
    );
    return;
  }
  const { Resend } = await import("resend");
  const resend = new Resend(key);
  const { error } = await resend.emails.send({
    from: process.env.EMAIL_FROM ?? `${brand.name} <onboarding@resend.dev>`,
    to: email.to,
    subject: email.subject,
    html: email.html,
    text: email.text,
    headers: email.unsubscribeUrl
      ? { "List-Unsubscribe": `<${email.unsubscribeUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" }
      : undefined,
  });
  if (error) throw new Error(`Email send failed: ${error.message}`);
}
