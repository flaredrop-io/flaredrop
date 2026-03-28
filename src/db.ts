import { Env } from './types';

const SCHEMA_VERSION = 1;

const SCHEMA = `
-- Devices registered to this FlareDrop instance
CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  push_subscription TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  last_seen_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Auth tokens (email verification)
CREATE TABLE IF NOT EXISTS auth_tokens (
  token TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  device_id TEXT,
  expires_at INTEGER NOT NULL,
  used INTEGER NOT NULL DEFAULT 0
);

-- Invite tokens (QR code based)
CREATE TABLE IF NOT EXISTS invite_tokens (
  token TEXT PRIMARY KEY,
  created_by_device_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (created_by_device_id) REFERENCES devices(id)
);

-- Pending file transfers
CREATE TABLE IF NOT EXISTS transfers (
  id TEXT PRIMARY KEY,
  from_device_id TEXT NOT NULL,
  to_device_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  mime_type TEXT NOT NULL,
  file_key TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  downloaded INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (from_device_id) REFERENCES devices(id),
  FOREIGN KEY (to_device_id) REFERENCES devices(id)
);

-- Session tokens for device auth
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  FOREIGN KEY (device_id) REFERENCES devices(id)
);

-- Schema version tracking
CREATE TABLE IF NOT EXISTS _flaredrop_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

// Check if database is initialized
async function isDatabaseInitialized(env: Env): Promise<boolean> {
  try {
    const result = await env.DB.prepare(
      "SELECT value FROM _flaredrop_meta WHERE key = 'schema_version'"
    ).first<{ value: string }>();
    return result !== null;
  } catch {
    // Table doesn't exist
    return false;
  }
}

// Initialize database schema
export async function initializeDatabase(env: Env): Promise<void> {
  const initialized = await isDatabaseInitialized(env);

  if (initialized) {
    // Check for schema upgrades in the future
    const result = await env.DB.prepare(
      "SELECT value FROM _flaredrop_meta WHERE key = 'schema_version'"
    ).first<{ value: string }>();

    const currentVersion = parseInt(result?.value || '0', 10);

    if (currentVersion < SCHEMA_VERSION) {
      // Run migrations here in the future
      await runMigrations(env, currentVersion, SCHEMA_VERSION);
    }
    return;
  }

  // Create all tables
  const statements = SCHEMA
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));

  for (const statement of statements) {
    await env.DB.prepare(statement).run();
  }

  // Record schema version
  await env.DB.prepare(
    "INSERT OR REPLACE INTO _flaredrop_meta (key, value) VALUES ('schema_version', ?)"
  ).bind(SCHEMA_VERSION.toString()).run();
}

// Run database migrations
async function runMigrations(env: Env, fromVersion: number, toVersion: number): Promise<void> {
  // Future migrations go here
  // Example:
  // if (fromVersion < 2 && toVersion >= 2) {
  //   await env.DB.prepare('ALTER TABLE devices ADD COLUMN new_field TEXT').run();
  // }

  // Update version after migrations
  await env.DB.prepare(
    "UPDATE _flaredrop_meta SET value = ? WHERE key = 'schema_version'"
  ).bind(toVersion.toString()).run();
}

// Cleanup expired data (call periodically)
export async function cleanupExpiredData(env: Env): Promise<void> {
  const now = Math.floor(Date.now() / 1000);

  // Clean up expired auth tokens
  await env.DB.prepare('DELETE FROM auth_tokens WHERE expires_at < ?').bind(now).run();

  // Clean up expired invite tokens
  await env.DB.prepare('DELETE FROM invite_tokens WHERE expires_at < ?').bind(now).run();

  // Clean up expired sessions
  await env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now).run();

  // Clean up old downloaded transfers (older than 7 days)
  const weekAgo = now - (7 * 24 * 60 * 60);
  const oldTransfers = await env.DB.prepare(
    'SELECT file_key FROM transfers WHERE downloaded = 1 AND created_at < ?'
  ).bind(weekAgo).all<{ file_key: string }>();

  for (const transfer of oldTransfers.results) {
    await env.FILES.delete(transfer.file_key);
  }

  await env.DB.prepare(
    'DELETE FROM transfers WHERE downloaded = 1 AND created_at < ?'
  ).bind(weekAgo).run();
}
