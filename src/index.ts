import { Env, Device, PushSubscription } from './types';
import {
  getAuthenticatedDevice,
  createAuthToken,
  verifyAuthToken,
  createInviteToken,
  verifyInviteToken,
  logout
} from './auth';
import { getDevices, getDevice, updateDeviceName, updatePushSubscription, deleteDevice } from './devices';
import { createTransfer, getTransfer, getPendingTransfers, downloadTransfer, getSentTransfers } from './transfers';
import { getRelay, RelayDurableObject } from './relay';
import { generateQRDataUrl } from './qr';
import {
  loginPage,
  emailSentPage,
  verifyPage,
  invitePage,
  dashboardPage,
  transfersPage,
  settingsPage,
  sharePage,
  manifest,
  SharedData
} from './ui';
import { generateId } from './utils';

export { RelayDurableObject };

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // Static assets
    if (path === '/manifest.json') {
      return new Response(manifest(), {
        headers: { 'Content-Type': 'application/manifest+json' }
      });
    }

    if (path === '/icon-192.png' || path === '/icon-512.png') {
      return generateIcon(path.includes('512') ? 512 : 192);
    }

    // Auth routes (no auth required)
    if (path === '/auth/email' && method === 'POST') {
      return handleEmailAuth(request, env);
    }

    if (path === '/auth/verify' && method === 'GET') {
      const token = url.searchParams.get('token');
      if (!token) return redirect('/');
      return html(verifyPage(token));
    }

    if (path === '/auth/verify' && method === 'POST') {
      return handleVerify(request, env);
    }

    if (path === '/auth/invite' && method === 'GET') {
      const token = url.searchParams.get('token');
      if (!token) return redirect('/');
      return html(invitePage(token));
    }

    if (path === '/auth/invite' && method === 'POST') {
      return handleInviteVerify(request, env);
    }

    if (path === '/auth/logout' && method === 'POST') {
      await logout(request, env);
      return redirect('/', { 'Set-Cookie': 'session=; Path=/; Max-Age=0' });
    }

    // Check authentication for protected routes
    const device = await getAuthenticatedDevice(request, env);

    // Login page
    if (!device && (path === '/' || path === '/login')) {
      return html(loginPage());
    }

    if (!device) {
      return redirect('/');
    }

    // Protected routes
    const devices = await getDevices(env);

    if (path === '/') {
      const pending = await getPendingTransfers(device.id, env);
      return html(dashboardPage(device, devices, pending));
    }

    if (path === '/transfers') {
      const sent = await getSentTransfers(device.id, env);
      const received = await env.DB.prepare(
        'SELECT * FROM transfers WHERE to_device_id = ? ORDER BY created_at DESC LIMIT 50'
      ).bind(device.id).all<any>();
      return html(transfersPage(device, sent, received.results, devices));
    }

    if (path === '/settings') {
      return html(settingsPage(device, devices));
    }

    if (path === '/settings/device' && method === 'POST') {
      const form = await request.formData();
      const name = form.get('name') as string;
      if (name) {
        await updateDeviceName(device.id, name, env);
      }
      return redirect('/settings');
    }

    if (path.startsWith('/settings/device/') && path.endsWith('/delete') && method === 'POST') {
      const targetId = path.split('/')[3];
      if (targetId !== device.id) {
        await deleteDevice(targetId, env);
      }
      return redirect('/settings');
    }

    // Share target (Web Share Target API)
    // POST: Receives files/text from Web Share Target API
    // GET: Fallback for text-only sharing (legacy)
    if (path === '/share' && method === 'POST') {
      const form = await request.formData();
      const title = form.get('title') as string || '';
      const text = form.get('text') as string || '';
      const shareUrl = form.get('url') as string || '';
      const files = form.getAll('files') as unknown as File[];

      const sharedData: SharedData = { title, text, url: shareUrl };

      // Store shared files temporarily in KV
      if (files.length > 0 && files[0] instanceof File) {
        sharedData.files = [];
        for (const file of files) {
          const fileKey = `share:${generateId(16)}`;
          const arrayBuffer = await file.arrayBuffer();
          await env.FILES.put(fileKey, arrayBuffer, {
            expirationTtl: 300, // 5 minutes
            metadata: { name: file.name, type: file.type, size: file.size }
          });
          sharedData.files.push({
            name: file.name,
            size: file.size,
            type: file.type,
            key: fileKey
          });
        }
      }

      return html(sharePage(device, devices, sharedData));
    }

    if (path === '/share' && method === 'GET') {
      // Fallback for GET-based sharing (text/URL only)
      const title = url.searchParams.get('title') || '';
      const text = url.searchParams.get('text') || '';
      const shareUrl = url.searchParams.get('url') || '';
      const sharedData: SharedData = { title, text, url: shareUrl };
      return html(sharePage(device, devices, sharedData));
    }

    if (path === '/share/send' && method === 'POST') {
      const form = await request.formData();
      const targetDevice = form.get('targetDevice') as string;
      const title = form.get('title') as string;
      const text = form.get('text') as string;
      const shareUrl = form.get('url') as string;
      const fileKeys = (form.get('fileKeys') as string || '').split(',').filter(Boolean);

      if (!targetDevice) {
        return redirect('/');
      }

      // Send files from temporary storage
      if (fileKeys.length > 0) {
        for (const fileKey of fileKeys) {
          const fileData = await env.FILES.getWithMetadata(fileKey, 'arrayBuffer');
          if (fileData.value && fileData.metadata) {
            const meta = fileData.metadata as { name: string; type: string; size: number };
            const file = new File([fileData.value as ArrayBuffer], meta.name, { type: meta.type });
            await createTransfer(device.id, targetDevice, file, env);
            await env.FILES.delete(fileKey); // Clean up temporary file
          }
        }
      } else if (title || text || shareUrl) {
        // Create a text file with the shared content
        const content = [title, text, shareUrl].filter(Boolean).join('\n\n');
        const blob = new Blob([content], { type: 'text/plain' });
        const fileName = title ? `${title.substring(0, 50)}.txt` : 'shared.txt';
        const file = new File([blob], fileName, { type: 'text/plain' });
        await createTransfer(device.id, targetDevice, file, env);
      }

      // Notify via WebSocket
      try {
        const relay = getRelay(env);
        await relay.fetch(new Request('http://internal/notify', {
          method: 'POST',
          body: JSON.stringify({
            targetDeviceId: targetDevice,
            message: { type: 'transfer', from: device.name }
          })
        }));
      } catch (e) {
        console.error('WebSocket notification failed:', e);
      }

      return redirect('/');
    }

    // API routes
    if (path === '/api/send' && method === 'POST') {
      const form = await request.formData();
      const targetDevice = form.get('targetDevice') as string;
      const files = form.getAll('file') as unknown as File[];

      if (!targetDevice || files.length === 0 || !(files[0] instanceof File)) {
        return json({ error: 'Missing target device or file' }, 400);
      }

      for (const file of files) {
        const result = await createTransfer(device.id, targetDevice, file as File, env);
        if ('error' in result) {
          return json({ error: result.error }, 400);
        }
      }

      // Notify via WebSocket
      try {
        const relay = getRelay(env);
        await relay.fetch(new Request('http://internal/notify', {
          method: 'POST',
          body: JSON.stringify({
            targetDeviceId: targetDevice,
            message: { type: 'transfer', from: device.name }
          })
        }));
      } catch (e) {
        console.error('WebSocket notification failed:', e);
      }

      return json({ success: true });
    }

    if (path === '/api/invite' && method === 'GET') {
      const token = await createInviteToken(device.id, env);
      const inviteUrl = `${url.origin}/auth/invite?token=${token}`;
      const qrDataUrl = generateQRDataUrl(inviteUrl);
      return json({ token, inviteUrl, qrDataUrl });
    }

    if (path === '/api/push/subscribe' && method === 'POST') {
      const subscription = await request.json() as PushSubscription;
      await updatePushSubscription(device.id, subscription, env);
      return json({ success: true });
    }

    if (path === '/api/push/unsubscribe' && method === 'POST') {
      await updatePushSubscription(device.id, null, env);
      return json({ success: true });
    }

    if (path === '/api/devices') {
      return json(devices.map(d => ({ id: d.id, name: d.name, isMe: d.id === device.id })));
    }

    if (path === '/api/transfers/pending') {
      const pending = await getPendingTransfers(device.id, env);
      return json(pending);
    }

    // Download
    if (path.startsWith('/download/')) {
      const transferId = path.split('/')[2];
      const response = await downloadTransfer(transferId, device.id, env);
      if (!response) {
        return new Response('Not found', { status: 404 });
      }
      return response;
    }

    // WebSocket for real-time updates
    if (path === '/ws') {
      const relay = getRelay(env);
      const wsUrl = new URL(url);
      wsUrl.pathname = '/websocket';
      wsUrl.searchParams.set('deviceId', device.id);

      return relay.fetch(new Request(wsUrl.toString(), {
        headers: request.headers
      }));
    }

    return new Response('Not found', { status: 404 });
  },

  async email(message: ForwardableEmailMessage, env: Env, ctx: ExecutionContext): Promise<void> {
    // Handle incoming email for authentication
    // This is triggered by Cloudflare Email Routing
    const from = message.from.toLowerCase();
    const to = message.to.toLowerCase();

    const authorizedEmail = env.AUTHORIZED_EMAIL;
    if (!authorizedEmail) {
      message.setReject('FlareDrop not configured');
      return;
    }

    // Check if sender is authorized
    if (!from.includes(authorizedEmail.toLowerCase())) {
      message.setReject('Unauthorized sender');
      return;
    }

    // Extract token from recipient address (e.g., verify-{token}@yourdomain.com)
    const match = to.match(/^verify-([a-zA-Z0-9]+)@/);
    if (match) {
      const token = match[1];
      // Mark the auth token as email-verified
      await env.DB.prepare(
        'UPDATE auth_tokens SET email = ? WHERE token = ?'
      ).bind(from, token).run();
    }
  }
};

async function handleEmailAuth(request: Request, env: Env): Promise<Response> {
  const form = await request.formData();
  const email = (form.get('email') as string || '').toLowerCase().trim();

  const authorizedEmail = env.AUTHORIZED_EMAIL;

  if (!authorizedEmail) {
    return html(loginPage('FlareDrop is not configured. Set AUTHORIZED_EMAIL in wrangler.toml'));
  }

  if (email !== authorizedEmail.toLowerCase()) {
    return html(loginPage('This email is not authorized'));
  }

  // Generate token
  const token = await createAuthToken(email, env);

  // In a real deployment with Email Routing:
  // The user would send an email to verify-{token}@yourdomain.com
  // For now, we'll show the verification link directly (for development)
  const url = new URL(request.url);

  // For development: show direct link
  if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
    const verifyUrl = `${url.origin}/auth/verify?token=${token}`;
    return html(`
      <!DOCTYPE html>
      <html>
      <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Dev Login</title>
      <style>body{font-family:sans-serif;padding:20px;}</style>
      </head>
      <body>
        <h2>Development Mode</h2>
        <p>Click to verify: <a href="${verifyUrl}">${verifyUrl}</a></p>
        <p>In production, you would send an email to verify-${token}@yourdomain.com</p>
      </body>
      </html>
    `);
  }

  return html(emailSentPage(email));
}

async function handleVerify(request: Request, env: Env): Promise<Response> {
  const form = await request.formData();
  const token = form.get('token') as string;
  const deviceName = form.get('deviceName') as string;

  if (!token || !deviceName) {
    return redirect('/');
  }

  const result = await verifyAuthToken(token, deviceName.trim(), env);

  if (!result) {
    return html(loginPage('Invalid or expired token'));
  }

  return redirect('/', {
    'Set-Cookie': `session=${result.session}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${30 * 24 * 60 * 60}`
  });
}

async function handleInviteVerify(request: Request, env: Env): Promise<Response> {
  const form = await request.formData();
  const token = form.get('token') as string;
  const deviceName = form.get('deviceName') as string;

  if (!token || !deviceName) {
    return redirect('/');
  }

  const result = await verifyInviteToken(token, deviceName.trim(), env);

  if (!result) {
    return html(loginPage('Invalid or expired invite'));
  }

  return redirect('/', {
    'Set-Cookie': `session=${result.session}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${30 * 24 * 60 * 60}`
  });
}

function html(content: string, status = 200): Response {
  return new Response(content, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function redirect(location: string, headers: Record<string, string> = {}): Response {
  return new Response(null, {
    status: 302,
    headers: { Location: location, ...headers }
  });
}

function generateIcon(size: number): Response {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:#667eea"/>
        <stop offset="100%" style="stop-color:#764ba2"/>
      </linearGradient>
    </defs>
    <rect width="100" height="100" rx="20" fill="url(#bg)"/>
    <circle cx="50" cy="40" r="8" fill="white"/>
    <path d="M30 60 Q50 80 70 60" stroke="white" stroke-width="6" fill="none" stroke-linecap="round"/>
    <path d="M25 72 Q50 95 75 72" stroke="white" stroke-width="6" fill="none" stroke-linecap="round" opacity="0.6"/>
  </svg>`;

  return new Response(svg, {
    headers: { 'Content-Type': 'image/svg+xml' }
  });
}

interface ForwardableEmailMessage {
  from: string;
  to: string;
  setReject(reason: string): void;
}
