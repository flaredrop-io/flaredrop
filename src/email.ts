import { Env } from './types';
import { createAuthToken } from './auth';

interface EmailMessage {
  from: string;
  to: string;
  headers: Headers;
  raw: ReadableStream;
  rawSize: number;
  setReject(reason: string): void;
  forward(to: string): Promise<void>;
  reply(message: EmailMessage): Promise<void>;
}

export async function handleEmail(message: EmailMessage, env: Env): Promise<void> {
  const authorizedEmail = env.AUTHORIZED_EMAIL;

  if (!authorizedEmail) {
    message.setReject('FlareDrop not configured');
    return;
  }

  const fromEmail = message.from.toLowerCase();

  // Check if the email is from the authorized user
  if (!fromEmail.includes(authorizedEmail.toLowerCase())) {
    message.setReject('Unauthorized');
    return;
  }

  // Generate auth token
  const token = await createAuthToken(authorizedEmail, env);

  // The user needs to click the link in the email
  // Since we can't send emails directly from Workers, we'll rely on
  // the user visiting a URL. The auth flow will be:
  // 1. User requests login via web form
  // 2. System generates token and shows "check email" page
  // 3. For Email Routing, we'd intercept incoming emails TO our domain
  //    and use them to verify identity

  console.log(`Auth token generated for ${authorizedEmail}: ${token}`);
}

// Email handler for Cloudflare Email Routing
// This handles emails SENT TO your FlareDrop domain
export async function handleIncomingEmail(message: EmailMessage, env: Env): Promise<void> {
  const toAddress = message.to.toLowerCase();
  const fromAddress = message.from.toLowerCase();

  // Check if this is an auth request email
  // Format: auth-{token}@yourdomain.com
  const authMatch = toAddress.match(/^auth-([a-zA-Z0-9]+)@/);

  if (authMatch) {
    const token = authMatch[1];

    // Verify the token exists and matches the sender
    const authToken = await env.DB.prepare(
      'SELECT * FROM auth_tokens WHERE token = ? AND used = 0'
    ).bind(token).first<{ token: string; email: string }>();

    if (authToken && authToken.email.toLowerCase() === fromAddress) {
      // Mark as verified - the user can now complete setup
      // We don't mark as used yet - that happens when they submit the device name
      console.log(`Email verified for ${fromAddress}`);
    }
  }
}

// Generate the email address for auth verification
export function getAuthEmailAddress(token: string, domain: string): string {
  return `auth-${token}@${domain}`;
}
