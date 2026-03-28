import { Env, Device, PushSubscription } from './types';

export async function getDevices(env: Env): Promise<Device[]> {
  const result = await env.DB.prepare('SELECT * FROM devices ORDER BY name').all<Device>();
  return result.results;
}

export async function getDevice(deviceId: string, env: Env): Promise<Device | null> {
  return await env.DB.prepare('SELECT * FROM devices WHERE id = ?').bind(deviceId).first<Device>();
}

export async function updateDeviceName(deviceId: string, name: string, env: Env): Promise<void> {
  await env.DB.prepare('UPDATE devices SET name = ? WHERE id = ?').bind(name, deviceId).run();
}

export async function updatePushSubscription(deviceId: string, subscription: PushSubscription | null, env: Env): Promise<void> {
  const subJson = subscription ? JSON.stringify(subscription) : null;
  await env.DB.prepare('UPDATE devices SET push_subscription = ? WHERE id = ?').bind(subJson, deviceId).run();
}

export async function deleteDevice(deviceId: string, env: Env): Promise<void> {
  await env.DB.prepare('DELETE FROM sessions WHERE device_id = ?').bind(deviceId).run();
  await env.DB.prepare('DELETE FROM transfers WHERE from_device_id = ? OR to_device_id = ?').bind(deviceId, deviceId).run();
  await env.DB.prepare('DELETE FROM devices WHERE id = ?').bind(deviceId).run();
}
