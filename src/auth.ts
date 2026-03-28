import { Env, Device, Session } from './types';
import { generateId, getSessionToken } from './utils';

const SESSION_DURATION = 30 * 24 * 60 * 60; // 30 days
const TOKEN_DURATION = 15 * 60; // 15 minutes

export async function getAuthenticatedDevice(request: Request, env: Env): Promise<Device | null> {
  const sessionToken = getSessionToken(request);
  if (!sessionToken) return null;

  const now = Math.floor(Date.now() / 1000);
  const session = await env.DB.prepare(
    'SELECT * FROM sessions WHERE token = ? AND expires_at > ?'
  ).bind(sessionToken, now).first<Session>();

  if (!session) return null;

  const device = await env.DB.prepare(
    'SELECT * FROM devices WHERE id = ?'
  ).bind(session.device_id).first<Device>();

  if (device) {
    await env.DB.prepare(
      'UPDATE devices SET last_seen_at = ? WHERE id = ?'
    ).bind(now, device.id).run();
  }

  return device;
}

export async function createAuthToken(email: string, env: Env): Promise<string> {
  const token = generateId(32);
  const expiresAt = Math.floor(Date.now() / 1000) + TOKEN_DURATION;

  await env.DB.prepare(
    'INSERT INTO auth_tokens (token, email, expires_at) VALUES (?, ?, ?)'
  ).bind(token, email, expiresAt).run();

  return token;
}

export async function verifyAuthToken(token: string, deviceName: string, env: Env): Promise<{ session: string; deviceId: string } | null> {
  const now = Math.floor(Date.now() / 1000);

  const authToken = await env.DB.prepare(
    'SELECT * FROM auth_tokens WHERE token = ? AND expires_at > ? AND used = 0'
  ).bind(token, now).first<{ token: string; email: string; expires_at: number; used: number }>();

  if (!authToken) return null;

  await env.DB.prepare('UPDATE auth_tokens SET used = 1 WHERE token = ?').bind(token).run();

  const deviceId = generateId(16);
  const sessionToken = generateId(64);
  const sessionExpires = now + SESSION_DURATION;

  await env.DB.prepare(
    'INSERT INTO devices (id, name) VALUES (?, ?)'
  ).bind(deviceId, deviceName).run();

  await env.DB.prepare(
    'INSERT INTO sessions (token, device_id, expires_at) VALUES (?, ?, ?)'
  ).bind(sessionToken, deviceId, sessionExpires).run();

  return { session: sessionToken, deviceId };
}

export async function createInviteToken(deviceId: string, env: Env): Promise<string> {
  const token = generateId(16);
  const expiresAt = Math.floor(Date.now() / 1000) + 5 * 60; // 5 minutes

  await env.DB.prepare(
    'INSERT INTO invite_tokens (token, created_by_device_id, expires_at) VALUES (?, ?, ?)'
  ).bind(token, deviceId, expiresAt).run();

  return token;
}

export async function verifyInviteToken(token: string, deviceName: string, env: Env): Promise<{ session: string; deviceId: string } | null> {
  const now = Math.floor(Date.now() / 1000);

  const inviteToken = await env.DB.prepare(
    'SELECT * FROM invite_tokens WHERE token = ? AND expires_at > ? AND used = 0'
  ).bind(token, now).first<{ token: string; created_by_device_id: string; expires_at: number; used: number }>();

  if (!inviteToken) return null;

  await env.DB.prepare('UPDATE invite_tokens SET used = 1 WHERE token = ?').bind(token).run();

  const deviceId = generateId(16);
  const sessionToken = generateId(64);
  const sessionExpires = now + SESSION_DURATION;

  await env.DB.prepare(
    'INSERT INTO devices (id, name) VALUES (?, ?)'
  ).bind(deviceId, deviceName).run();

  await env.DB.prepare(
    'INSERT INTO sessions (token, device_id, expires_at) VALUES (?, ?, ?)'
  ).bind(sessionToken, deviceId, sessionExpires).run();

  return { session: sessionToken, deviceId };
}

export async function logout(request: Request, env: Env): Promise<void> {
  const sessionToken = getSessionToken(request);
  if (sessionToken) {
    await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(sessionToken).run();
  }
}
