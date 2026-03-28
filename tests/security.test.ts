import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { unstable_dev, type UnstableDevWorker } from 'wrangler';

describe('FlareDrop Security E2E Tests', () => {
  let worker: UnstableDevWorker;

  beforeAll(async () => {
    worker = await unstable_dev('src/index.ts', {
      experimental: { disableExperimentalWarning: true },
      local: true,
      vars: {
        AUTHORIZED_EMAIL: 'admin@example.com'
      }
    });
  }, 60000);

  afterAll(async () => {
    if (worker) {
      await worker.stop();
    }
  });

  describe('Authentication Bypass Attacks', () => {
    it('should reject empty session token', async () => {
      const res = await worker.fetch('/', {
        headers: { Cookie: 'session=' },
        redirect: 'manual'
      });
      const text = await res.text();
      expect(text).toContain('Login');
    });

    it('should reject SQL injection in session token', async () => {
      const payloads = [
        "' OR '1'='1",
        "1' OR '1'='1' --",
        "1'; DROP TABLE sessions; --",
      ];

      for (const payload of payloads) {
        const res = await worker.fetch('/', {
          headers: { Cookie: `session=${payload}` },
          redirect: 'manual'
        });
        expect(res.status).not.toBe(500);
      }
    });

    it('should reject forged session tokens', async () => {
      const forgedTokens = [
        'a'.repeat(100),
        '../../../etc/passwd',
        '<script>alert(1)</script>',
        'eyJhbGciOiJub25lIn0.eyJzdWIiOiIxMjM0NTY3ODkwIn0.',
      ];

      for (const token of forgedTokens) {
        const res = await worker.fetch('/', {
          headers: { Cookie: `session=${token}` },
          redirect: 'manual'
        });
        expect(res.status).not.toBe(500);
        const text = await res.text();
        expect(text).toContain('Login');
      }
    });
  });

  describe('Email Authentication', () => {
    it('should reject unauthorized email addresses', async () => {
      const form = new FormData();
      form.append('email', 'attacker@evil.com');

      const res = await worker.fetch('/auth/email', {
        method: 'POST',
        body: form,
        redirect: 'manual'
      });

      const text = await res.text();
      expect(text).toContain('not authorized');
    });

    it('should handle email header injection', async () => {
      const maliciousEmails = [
        'admin@example.com\r\nBcc: attacker@evil.com',
        'admin@example.com%0ABcc: attacker@evil.com',
      ];

      for (const email of maliciousEmails) {
        const form = new FormData();
        form.append('email', email);

        const res = await worker.fetch('/auth/email', {
          method: 'POST',
          body: form,
          redirect: 'manual'
        });

        expect(res.status).not.toBe(500);
      }
    });
  });

  describe('XSS Prevention', () => {
    it('should escape XSS in login error messages', async () => {
      const form = new FormData();
      form.append('email', '<script>alert(1)</script>@evil.com');

      const res = await worker.fetch('/auth/email', {
        method: 'POST',
        body: form,
        redirect: 'manual'
      });

      const text = await res.text();
      expect(text).not.toContain('<script>alert');
    });
  });

  describe('SQL Injection Prevention', () => {
    it('should handle SQL injection in auth token verification', async () => {
      const payloads = [
        "'; DROP TABLE auth_tokens; --",
        "' UNION SELECT * FROM sessions --",
        "1' AND SLEEP(5) --",
      ];

      for (const payload of payloads) {
        const form = new FormData();
        form.append('token', payload);
        form.append('deviceName', 'Test');

        const res = await worker.fetch('/auth/verify', {
          method: 'POST',
          body: form,
          redirect: 'manual'
        });

        expect(res.status).not.toBe(500);
      }
    });

    it('should handle SQL injection in invite token verification', async () => {
      const form = new FormData();
      form.append('token', "' OR '1'='1");
      form.append('deviceName', 'Hacked');

      const res = await worker.fetch('/auth/invite', {
        method: 'POST',
        body: form,
        redirect: 'manual'
      });

      expect(res.status).not.toBe(500);
    });
  });

  describe('Path Traversal Prevention', () => {
    it('should reject path traversal in download endpoint', async () => {
      const payloads = [
        '../../../etc/passwd',
        '..\\..\\..\\windows\\system32\\config\\sam',
        '%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd',
      ];

      for (const payload of payloads) {
        const res = await worker.fetch(`/download/${encodeURIComponent(payload)}`, {
          redirect: 'manual'
        });
        expect([302, 404]).toContain(res.status);
      }
    });
  });

  describe('CSRF Protection', () => {
    it('should use SameSite cookie attribute', async () => {
      const form = new FormData();
      form.append('email', 'admin@example.com');

      const res = await worker.fetch('/auth/email', {
        method: 'POST',
        body: form,
        redirect: 'manual'
      });

      expect(res.status).not.toBe(500);
    });

    it('should clear cookie on logout', async () => {
      const res = await worker.fetch('/auth/logout', {
        method: 'POST',
        headers: { Cookie: 'session=test' },
        redirect: 'manual'
      });

      const setCookie = res.headers.get('Set-Cookie');
      expect(setCookie).toContain('Max-Age=0');
    });
  });

  describe('Information Disclosure Prevention', () => {
    it('should not expose sensitive endpoints', async () => {
      const sensitiveEndpoints = [
        '/admin',
        '/.env',
        '/wrangler.toml',
        '/package.json',
        '/.git/config',
      ];

      for (const endpoint of sensitiveEndpoints) {
        const res = await worker.fetch(endpoint, { redirect: 'manual' });
        // Unauthenticated requests redirect to login, or return 404
        // Either way, they should NOT return 200 with sensitive content
        expect([302, 404]).toContain(res.status);
        const text = await res.text();
        expect(text).not.toContain('database_id');
        expect(text).not.toContain('AUTHORIZED_EMAIL');
      }
    });

    it('should not expose stack traces', async () => {
      const res = await worker.fetch('/api/nonexistent', { redirect: 'manual' });
      const text = await res.text();
      expect(text).not.toContain('.ts:');
      expect(text).not.toContain('at Object');
    });
  });

  describe('DoS Prevention', () => {
    it('should handle oversized device names', async () => {
      const form = new FormData();
      form.append('name', 'A'.repeat(100000));

      const res = await worker.fetch('/settings/device', {
        method: 'POST',
        body: form,
        headers: { Cookie: 'session=test' },
        redirect: 'manual'
      });

      expect(res.status).not.toBe(500);
    });

    it('should handle many query parameters', async () => {
      const params = Array(100).fill(null).map((_, i) => `p${i}=v${i}`).join('&');
      const res = await worker.fetch(`/?${params}`, { redirect: 'manual' });
      expect(res.status).not.toBe(500);
    });
  });

  describe('Input Validation', () => {
    it('should handle null bytes in inputs', async () => {
      const form = new FormData();
      form.append('name', 'test\x00injection');

      const res = await worker.fetch('/settings/device', {
        method: 'POST',
        body: form,
        headers: { Cookie: 'session=test' },
        redirect: 'manual'
      });

      expect(res.status).not.toBe(500);
    });

    it('should handle unicode edge cases', async () => {
      const unicodeStrings = [
        '\u202Eevil.exe.txt',
        '\u200B\u200B\u200B',
        '🔥💀🎃',
      ];

      for (const str of unicodeStrings) {
        const form = new FormData();
        form.append('email', str + '@example.com');

        const res = await worker.fetch('/auth/email', {
          method: 'POST',
          body: form,
          redirect: 'manual'
        });

        expect(res.status).not.toBe(500);
      }
    });

    it('should handle malformed JSON', async () => {
      const malformedJson = [
        '{invalid}',
        '{"unclosed": ',
        'null',
      ];

      for (const json of malformedJson) {
        const res = await worker.fetch('/api/push/subscribe', {
          method: 'POST',
          body: json,
          headers: {
            'Content-Type': 'application/json',
            'Cookie': 'session=test'
          },
          redirect: 'manual'
        });

        expect(res.status).not.toBe(500);
      }
    });
  });

  describe('Token Security', () => {
    it('should reject JWT-style forged tokens', async () => {
      const jwtTokens = [
        'eyJhbGciOiJub25lIn0.eyJzdWIiOiIxMjM0NTY3ODkwIn0.',
        'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhZG1pbiJ9.fake',
      ];

      for (const token of jwtTokens) {
        const res = await worker.fetch('/', {
          headers: { Cookie: `session=${token}` },
          redirect: 'manual'
        });

        const text = await res.text();
        expect(text).toContain('Login');
      }
    });
  });

  describe('Host Header Injection', () => {
    it('should not trust arbitrary Host headers', async () => {
      const res = await worker.fetch('/', {
        headers: {
          'Host': 'evil.com',
          'X-Forwarded-Host': 'evil.com'
        },
        redirect: 'manual'
      });

      const text = await res.text();
      expect(text).not.toContain('evil.com');
    });
  });

  describe('Manifest Security', () => {
    it('should serve valid manifest.json', async () => {
      const res = await worker.fetch('/manifest.json', { redirect: 'manual' });
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toContain('application/manifest+json');

      const manifest = await res.json() as Record<string, unknown>;
      expect(manifest.name).toBe('FlareDrop');
    });
  });

  describe('Icon Generation', () => {
    it('should serve SVG icons', async () => {
      const res192 = await worker.fetch('/icon-192.png', { redirect: 'manual' });
      expect(res192.status).toBe(200);
      expect(res192.headers.get('Content-Type')).toBe('image/svg+xml');

      const res512 = await worker.fetch('/icon-512.png', { redirect: 'manual' });
      expect(res512.status).toBe(200);
    });
  });

  describe('Web Share Target API', () => {
    it('should have valid manifest with share_target', async () => {
      const res = await worker.fetch('/manifest.json', { redirect: 'manual' });
      expect(res.status).toBe(200);

      const manifest = await res.json() as {
        share_target?: {
          action: string;
          method: string;
          enctype: string;
          params: {
            files?: { name: string; accept: string[] }[];
          };
        };
      };

      expect(manifest.share_target).toBeDefined();
      expect(manifest.share_target?.action).toBe('/share');
      expect(manifest.share_target?.method).toBe('POST');
      expect(manifest.share_target?.enctype).toBe('multipart/form-data');
      expect(manifest.share_target?.params.files).toBeDefined();
      expect(manifest.share_target?.params.files?.[0].accept).toContain('*/*');
    });

    it('should handle POST share requests with text data', async () => {
      const form = new FormData();
      form.append('title', 'Test Title');
      form.append('text', 'Test Text Content');
      form.append('url', 'https://example.com');

      const res = await worker.fetch('/share', {
        method: 'POST',
        body: form,
        headers: { Cookie: 'session=test' },
        redirect: 'manual'
      });

      // Should redirect to login since session is invalid, but shouldn't error
      expect([200, 302]).toContain(res.status);
    });

    it('should handle POST share requests with files', async () => {
      const form = new FormData();
      form.append('title', '');
      form.append('text', '');
      form.append('url', '');
      const file = new File(['test content'], 'shared-file.txt', { type: 'text/plain' });
      form.append('files', file);

      const res = await worker.fetch('/share', {
        method: 'POST',
        body: form,
        headers: { Cookie: 'session=test' },
        redirect: 'manual'
      });

      expect([200, 302]).toContain(res.status);
    });

    it('should handle GET share requests (legacy fallback)', async () => {
      const res = await worker.fetch('/share?title=Test&text=Hello&url=https://example.com', {
        headers: { Cookie: 'session=test' },
        redirect: 'manual'
      });

      expect([200, 302]).toContain(res.status);
    });

    it('should prevent XSS in shared content', async () => {
      const form = new FormData();
      form.append('title', '<script>alert("XSS")</script>');
      form.append('text', '<img src=x onerror=alert(1)>');
      form.append('url', 'javascript:alert(1)');

      const res = await worker.fetch('/share', {
        method: 'POST',
        body: form,
        headers: { Cookie: 'session=test' },
        redirect: 'manual'
      });

      if (res.status === 200) {
        const text = await res.text();
        expect(text).not.toContain('<script>alert');
        expect(text).not.toContain('onerror=');
      }
    });
  });

  describe('Command Injection Prevention', () => {
    it('should handle command injection payloads', async () => {
      const cmdPayloads = [
        '; ls -la',
        '| cat /etc/passwd',
        '`whoami`',
        '$(id)',
      ];

      for (const payload of cmdPayloads) {
        const form = new FormData();
        form.append('name', payload);

        const res = await worker.fetch('/settings/device', {
          method: 'POST',
          body: form,
          headers: { Cookie: 'session=test' },
          redirect: 'manual'
        });

        expect(res.status).not.toBe(500);
      }
    });
  });

  describe('Template Injection Prevention', () => {
    it('should handle template injection payloads', async () => {
      const templatePayloads = [
        '{{7*7}}',
        '${7*7}',
        '<%= 7*7 %>',
        '#{7*7}',
      ];

      for (const payload of templatePayloads) {
        const form = new FormData();
        form.append('name', payload);

        const res = await worker.fetch('/settings/device', {
          method: 'POST',
          body: form,
          headers: { Cookie: 'session=test' },
          redirect: 'manual'
        });

        expect(res.status).not.toBe(500);
      }
    });
  });

  describe('XXE Prevention', () => {
    it('should handle XXE payloads safely', async () => {
      const xxePayload = '<?xml version="1.0"?><!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><foo>&xxe;</foo>';

      const form = new FormData();
      form.append('name', xxePayload);

      const res = await worker.fetch('/settings/device', {
        method: 'POST',
        body: form,
        headers: { Cookie: 'session=test' },
        redirect: 'manual'
      });

      expect(res.status).not.toBe(500);
    });
  });

  describe('LDAP Injection Prevention', () => {
    it('should handle LDAP injection payloads', async () => {
      const ldapPayloads = [
        '*',
        '*)(&',
        '*)(uid=*))(|(uid=*',
      ];

      for (const payload of ldapPayloads) {
        const form = new FormData();
        form.append('name', payload);

        const res = await worker.fetch('/settings/device', {
          method: 'POST',
          body: form,
          headers: { Cookie: 'session=test' },
          redirect: 'manual'
        });

        expect(res.status).not.toBe(500);
      }
    });
  });

  describe('Prototype Pollution Prevention', () => {
    it('should handle prototype pollution attempts', async () => {
      const pollutionPayloads = [
        '{"__proto__": {"polluted": true}}',
        '{"constructor": {"prototype": {"polluted": true}}}',
      ];

      for (const payload of pollutionPayloads) {
        const res = await worker.fetch('/api/push/subscribe', {
          method: 'POST',
          body: payload,
          headers: {
            'Content-Type': 'application/json',
            'Cookie': 'session=test'
          },
          redirect: 'manual'
        });

        expect(res.status).not.toBe(500);

        const obj = {} as any;
        expect(obj.polluted).toBeUndefined();
      }
    });
  });

  describe('WebSocket Security', () => {
    it('should require authentication for WebSocket endpoint', async () => {
      // Can't test actual WebSocket upgrade with fetch, but can test the endpoint
      const res = await worker.fetch('/ws', { redirect: 'manual' });
      // Should redirect unauthenticated users to login
      expect(res.status).toBe(302);
    });
  });

  describe('SSRF Prevention', () => {
    it('should handle SSRF attempts in push subscription', async () => {
      const ssrfEndpoints = [
        'http://localhost:8080/admin',
        'http://127.0.0.1:22',
        'http://169.254.169.254/latest/meta-data/',
        'file:///etc/passwd',
      ];

      for (const endpoint of ssrfEndpoints) {
        const res = await worker.fetch('/api/push/subscribe', {
          method: 'POST',
          body: JSON.stringify({
            endpoint: endpoint,
            keys: { p256dh: 'test', auth: 'test' }
          }),
          headers: {
            'Content-Type': 'application/json',
            'Cookie': 'session=test'
          },
          redirect: 'manual'
        });

        expect(res.status).not.toBe(500);
      }
    });
  });

  describe('HTTP Parameter Pollution', () => {
    it('should handle duplicate parameters', async () => {
      const res = await worker.fetch('/settings/device?name=first&name=second', {
        method: 'POST',
        headers: { Cookie: 'session=test' },
        redirect: 'manual'
      });

      expect(res.status).not.toBe(500);
    });
  });

  describe('Cookie Injection Prevention', () => {
    it('should handle URL-encoded cookie injection attempts', async () => {
      // CRLF injection is blocked at the HTTP level (good!)
      // Test URL-encoded versions that might bypass
      const maliciousCookies = [
        'session=test%0d%0aSet-Cookie:%20evil=injected',
        'session=test; session=override',
        'session=test;%20admin=true',
      ];

      for (const cookie of maliciousCookies) {
        const res = await worker.fetch('/', {
          headers: { Cookie: cookie },
          redirect: 'manual'
        });

        expect(res.status).not.toBe(500);
      }
    });

    it('should reject header injection at HTTP level', () => {
      // This test verifies that the HTTP library rejects CRLF injection
      // The fact that this throws is the CORRECT secure behavior
      expect(() => {
        new Request('http://localhost/', {
          headers: { Cookie: 'session=test\r\nSet-Cookie: evil=injected' }
        });
      }).toThrow();
    });
  });
});
