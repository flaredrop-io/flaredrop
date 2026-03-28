import { PushSubscription, Env } from './types';

interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

// VAPID keys should be generated and stored as secrets
// For now, we'll use a simple implementation that works without VAPID
// In production, set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY as secrets

export async function sendPushNotification(
  subscription: PushSubscription,
  payload: PushPayload,
  _env: Env
): Promise<boolean> {
  try {
    // Simple fetch-based push (works for testing, but production should use proper VAPID signing)
    const response = await fetch(subscription.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'TTL': '86400'
      },
      body: JSON.stringify(payload)
    });

    return response.ok;
  } catch (error) {
    console.error('Push notification error:', error);
    return false;
  }
}

// Generate VAPID keys (run once and save as secrets)
export async function generateVAPIDKeys(): Promise<{ publicKey: string; privateKey: string }> {
  const keyPair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify']
  ) as CryptoKeyPair;

  const publicKeyBuffer = await crypto.subtle.exportKey('raw', keyPair.publicKey) as ArrayBuffer;
  const privateKeyBuffer = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey) as ArrayBuffer;

  return {
    publicKey: btoa(String.fromCharCode(...new Uint8Array(publicKeyBuffer))),
    privateKey: btoa(String.fromCharCode(...new Uint8Array(privateKeyBuffer)))
  };
}
