export interface Env {
  DB: D1Database;
  FILES: KVNamespace;
  RELAY: DurableObjectNamespace;
  AUTHORIZED_EMAIL?: string;
}

export interface Device {
  id: string;
  name: string;
  push_subscription: string | null;
  created_at: number;
  last_seen_at: number;
}

export interface AuthToken {
  token: string;
  email: string;
  device_id: string | null;
  expires_at: number;
  used: number;
}

export interface InviteToken {
  token: string;
  created_by_device_id: string;
  expires_at: number;
  used: number;
}

export interface Transfer {
  id: string;
  from_device_id: string;
  to_device_id: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  file_key: string;
  created_at: number;
  downloaded: number;
}

export interface Session {
  token: string;
  device_id: string;
  expires_at: number;
}

export interface PushSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}
