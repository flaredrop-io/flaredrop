import { Env, Transfer, Device, PushSubscription } from './types';
import { generateId } from './utils';
import { sendPushNotification } from './push';

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
const FILE_EXPIRY = 24 * 60 * 60; // 24 hours

export async function createTransfer(
  fromDeviceId: string,
  toDeviceId: string,
  file: File,
  env: Env
): Promise<{ transferId: string } | { error: string }> {
  if (file.size > MAX_FILE_SIZE) {
    return { error: 'File too large (max 100MB)' };
  }

  const transferId = generateId(16);
  const fileKey = `file:${transferId}`;

  const arrayBuffer = await file.arrayBuffer();
  await env.FILES.put(fileKey, arrayBuffer, {
    expirationTtl: FILE_EXPIRY,
    metadata: {
      name: file.name,
      type: file.type,
      size: file.size
    }
  });

  await env.DB.prepare(`
    INSERT INTO transfers (id, from_device_id, to_device_id, file_name, file_size, mime_type, file_key)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(transferId, fromDeviceId, toDeviceId, file.name, file.size, file.type || 'application/octet-stream', fileKey).run();

  const toDevice = await env.DB.prepare('SELECT * FROM devices WHERE id = ?').bind(toDeviceId).first<Device>();
  const fromDevice = await env.DB.prepare('SELECT * FROM devices WHERE id = ?').bind(fromDeviceId).first<Device>();

  if (toDevice?.push_subscription) {
    try {
      const subscription: PushSubscription = JSON.parse(toDevice.push_subscription);
      await sendPushNotification(subscription, {
        title: 'FlareDrop',
        body: `${fromDevice?.name || 'Someone'} sent you "${file.name}"`,
        data: { transferId, action: 'download' }
      }, env);
    } catch (e) {
      console.error('Push notification failed:', e);
    }
  }

  return { transferId };
}

export async function getTransfer(transferId: string, env: Env): Promise<Transfer | null> {
  return await env.DB.prepare('SELECT * FROM transfers WHERE id = ?').bind(transferId).first<Transfer>();
}

export async function getPendingTransfers(deviceId: string, env: Env): Promise<Transfer[]> {
  const result = await env.DB.prepare(
    'SELECT * FROM transfers WHERE to_device_id = ? AND downloaded = 0 ORDER BY created_at DESC'
  ).bind(deviceId).all<Transfer>();
  return result.results;
}

export async function downloadTransfer(transferId: string, deviceId: string, env: Env): Promise<Response | null> {
  const transfer = await env.DB.prepare(
    'SELECT * FROM transfers WHERE id = ? AND to_device_id = ?'
  ).bind(transferId, deviceId).first<Transfer>();

  if (!transfer) return null;

  const fileData = await env.FILES.get(transfer.file_key, 'arrayBuffer');
  if (!fileData) return null;

  await env.DB.prepare('UPDATE transfers SET downloaded = 1 WHERE id = ?').bind(transferId).run();

  return new Response(fileData, {
    headers: {
      'Content-Type': transfer.mime_type,
      'Content-Disposition': `attachment; filename="${encodeURIComponent(transfer.file_name)}"`,
      'Content-Length': transfer.file_size.toString()
    }
  });
}

export async function getSentTransfers(deviceId: string, env: Env): Promise<Transfer[]> {
  const result = await env.DB.prepare(
    'SELECT * FROM transfers WHERE from_device_id = ? ORDER BY created_at DESC LIMIT 50'
  ).bind(deviceId).all<Transfer>();
  return result.results;
}
