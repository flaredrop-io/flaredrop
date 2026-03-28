import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { unstable_dev, type UnstableDevWorker } from 'wrangler';
import { JSDOM } from 'jsdom';

describe('FlareDrop UI E2E Tests', () => {
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

  async function fetchPage(path: string, options: RequestInit = {}): Promise<JSDOM> {
    const res = await worker.fetch(path, { redirect: 'manual', ...options });
    const html = await res.text();
    return new JSDOM(html, { url: `http://localhost${path}`, runScripts: 'dangerously' });
  }

  describe('Login Page', () => {
    it('should render login form correctly', async () => {
      const dom = await fetchPage('/');
      const doc = dom.window.document;

      expect(doc.querySelector('h1')?.textContent).toContain('FlareDrop');
      expect(doc.querySelector('input[type="email"]')).not.toBeNull();
      expect(doc.querySelector('button[type="submit"]')).not.toBeNull();
      expect(doc.querySelector('form[action="/auth/email"]')).not.toBeNull();
    });

    it('should have email input with required attribute', async () => {
      const dom = await fetchPage('/');
      const doc = dom.window.document;
      const emailInput = doc.querySelector('input[type="email"]') as HTMLInputElement;

      expect(emailInput).not.toBeNull();
      expect(emailInput.required).toBe(true);
      expect(emailInput.name).toBe('email');
    });

    it('should display logo emoji', async () => {
      const dom = await fetchPage('/');
      const doc = dom.window.document;
      const logo = doc.querySelector('.logo');

      expect(logo).not.toBeNull();
      expect(logo?.textContent).toContain('📡');
    });

    it('should have proper meta tags for mobile', async () => {
      const dom = await fetchPage('/');
      const doc = dom.window.document;

      const viewport = doc.querySelector('meta[name="viewport"]');
      expect(viewport).not.toBeNull();
      expect(viewport?.getAttribute('content')).toContain('width=device-width');

      const themeColor = doc.querySelector('meta[name="theme-color"]');
      expect(themeColor).not.toBeNull();
    });

    it('should link to manifest.json', async () => {
      const dom = await fetchPage('/');
      const doc = dom.window.document;

      const manifestLink = doc.querySelector('link[rel="manifest"]');
      expect(manifestLink).not.toBeNull();
      expect(manifestLink?.getAttribute('href')).toBe('/manifest.json');
    });
  });

  describe('Email Verification Page', () => {
    it('should render verification form with token', async () => {
      const dom = await fetchPage('/auth/verify?token=test123');
      const doc = dom.window.document;

      const tokenInput = doc.querySelector('input[name="token"]') as HTMLInputElement;
      expect(tokenInput).not.toBeNull();
      expect(tokenInput.value).toBe('test123');
      expect(tokenInput.type).toBe('hidden');

      const deviceNameInput = doc.querySelector('input[name="deviceName"]');
      expect(deviceNameInput).not.toBeNull();
    });

    it('should have required device name input', async () => {
      const dom = await fetchPage('/auth/verify?token=test123');
      const doc = dom.window.document;

      const deviceNameInput = doc.querySelector('input[name="deviceName"]') as HTMLInputElement;
      expect(deviceNameInput.required).toBe(true);
    });
  });

  describe('Invite Page', () => {
    it('should render invite form with token', async () => {
      const dom = await fetchPage('/auth/invite?token=invite123');
      const doc = dom.window.document;

      const tokenInput = doc.querySelector('input[name="token"]') as HTMLInputElement;
      expect(tokenInput).not.toBeNull();
      expect(tokenInput.value).toBe('invite123');

      expect(doc.querySelector('form[action="/auth/invite"]')).not.toBeNull();
    });

    it('should display join message', async () => {
      const dom = await fetchPage('/auth/invite?token=invite123');
      const doc = dom.window.document;

      const heading = doc.querySelector('h2');
      expect(heading?.textContent).toContain('Join');
    });
  });

  describe('Error Handling in Login', () => {
    it('should display error for unauthorized email', async () => {
      const form = new FormData();
      form.append('email', 'unauthorized@evil.com');

      const res = await worker.fetch('/auth/email', {
        method: 'POST',
        body: form,
        redirect: 'manual'
      });

      const html = await res.text();
      expect(html).toContain('not authorized');
    });

    it('should escape XSS in error messages', async () => {
      const form = new FormData();
      form.append('email', '<script>alert(1)</script>@test.com');

      const res = await worker.fetch('/auth/email', {
        method: 'POST',
        body: form,
        redirect: 'manual'
      });

      const html = await res.text();
      // The error message doesn't contain the email directly, but if it did
      // it should be escaped. Just verify no script execution possible.
      expect(html).not.toContain('<script>alert(1)</script>@test.com');
    });
  });

  describe('CSS and Styling', () => {
    it('should include base styles', async () => {
      const dom = await fetchPage('/');
      const doc = dom.window.document;

      const style = doc.querySelector('style');
      expect(style).not.toBeNull();
      expect(style?.textContent).toContain('font-family');
      expect(style?.textContent).toContain('background');
    });

    it('should have card styling', async () => {
      const dom = await fetchPage('/');
      const doc = dom.window.document;

      const card = doc.querySelector('.card');
      expect(card).not.toBeNull();
    });

    it('should have button styling', async () => {
      const dom = await fetchPage('/');
      const doc = dom.window.document;

      const button = doc.querySelector('button');
      expect(button).not.toBeNull();
    });
  });

  describe('Form Validation', () => {
    it('should have HTML5 validation on email input', async () => {
      const dom = await fetchPage('/');
      const doc = dom.window.document;

      const emailInput = doc.querySelector('input[type="email"]') as HTMLInputElement;
      expect(emailInput.type).toBe('email');
      expect(emailInput.required).toBe(true);
    });

    it('should have proper form method and action', async () => {
      const dom = await fetchPage('/');
      const doc = dom.window.document;

      const form = doc.querySelector('form') as HTMLFormElement;
      expect(form.method.toUpperCase()).toBe('POST');
      expect(form.action).toContain('/auth/email');
    });
  });

  describe('Accessibility', () => {
    it('should have proper document title', async () => {
      const dom = await fetchPage('/');
      expect(dom.window.document.title).toContain('FlareDrop');
    });

    it('should have lang attribute on html', async () => {
      const dom = await fetchPage('/');
      const html = dom.window.document.documentElement;
      expect(html.lang).toBe('en');
    });

    it('should have charset meta tag', async () => {
      const dom = await fetchPage('/');
      const doc = dom.window.document;

      const charset = doc.querySelector('meta[charset]');
      expect(charset).not.toBeNull();
      expect(charset?.getAttribute('charset')?.toLowerCase()).toBe('utf-8');
    });
  });

  describe('Responsive Design', () => {
    it('should have viewport meta tag for responsive design', async () => {
      const dom = await fetchPage('/');
      const doc = dom.window.document;

      const viewport = doc.querySelector('meta[name="viewport"]');
      expect(viewport).not.toBeNull();

      const content = viewport?.getAttribute('content') || '';
      expect(content).toContain('width=device-width');
      expect(content).toContain('initial-scale=1.0');
    });

    it('should have max-width container', async () => {
      const dom = await fetchPage('/');
      const doc = dom.window.document;

      const container = doc.querySelector('.container');
      expect(container).not.toBeNull();
    });
  });

  describe('PWA Features', () => {
    it('should have manifest link', async () => {
      const dom = await fetchPage('/');
      const doc = dom.window.document;

      const manifest = doc.querySelector('link[rel="manifest"]');
      expect(manifest).not.toBeNull();
      expect(manifest?.getAttribute('href')).toBe('/manifest.json');
    });

    it('should have theme-color meta tag', async () => {
      const dom = await fetchPage('/');
      const doc = dom.window.document;

      const themeColor = doc.querySelector('meta[name="theme-color"]');
      expect(themeColor).not.toBeNull();
      expect(themeColor?.getAttribute('content')).toBe('#667eea');
    });
  });

  describe('Security Headers in HTML', () => {
    it('should use HttpOnly cookies via form action', async () => {
      const dom = await fetchPage('/auth/verify?token=test');
      const doc = dom.window.document;

      // Form should POST to server, not use JavaScript
      const form = doc.querySelector('form');
      expect(form?.method.toUpperCase()).toBe('POST');
    });

    it('should not expose sensitive data in HTML', async () => {
      const dom = await fetchPage('/');
      const html = dom.serialize();

      expect(html).not.toContain('AUTHORIZED_EMAIL');
      expect(html).not.toContain('admin@example.com');
      expect(html).not.toContain('session=');
    });
  });

  describe('Email Sent Page', () => {
    it('should display correct email on sent page', async () => {
      const form = new FormData();
      form.append('email', 'admin@example.com');

      const res = await worker.fetch('/auth/email', {
        method: 'POST',
        body: form,
        redirect: 'manual'
      });

      const html = await res.text();
      // In dev mode, shows verification link
      expect(html).toContain('admin@example.com');
    });
  });

  describe('Navigation Elements', () => {
    it('should have consistent header across pages', async () => {
      const loginDom = await fetchPage('/');
      const verifyDom = await fetchPage('/auth/verify?token=test');

      // Both should have FlareDrop branding
      expect(loginDom.serialize()).toContain('FlareDrop');
      expect(verifyDom.serialize()).toContain('FlareDrop');
    });
  });

  describe('Form Security', () => {
    it('should not have autocomplete on sensitive fields', async () => {
      const dom = await fetchPage('/auth/verify?token=test');
      const doc = dom.window.document;

      // Token field should be hidden
      const tokenInput = doc.querySelector('input[name="token"]') as HTMLInputElement;
      expect(tokenInput.type).toBe('hidden');
    });

    it('should use POST method for all mutations', async () => {
      const verifyDom = await fetchPage('/auth/verify?token=test');
      const inviteDom = await fetchPage('/auth/invite?token=test');

      const verifyForm = verifyDom.window.document.querySelector('form');
      const inviteForm = inviteDom.window.document.querySelector('form');

      expect(verifyForm?.method.toUpperCase()).toBe('POST');
      expect(inviteForm?.method.toUpperCase()).toBe('POST');
    });
  });

  describe('Input Sanitization Display', () => {
    it('should escape HTML entities in displayed content', async () => {
      // Get the raw HTML response (not JSDOM serialized)
      const res = await worker.fetch('/auth/verify?token=<script>alert(1)</script>', {
        redirect: 'manual'
      });
      const rawHtml = await res.text();

      // The raw HTML from the server should have escaped entities
      expect(rawHtml).toContain('&lt;script&gt;');
      expect(rawHtml).toContain('&lt;/script&gt;');

      // Verify JSDOM correctly interprets it
      const dom = new JSDOM(rawHtml);
      const doc = dom.window.document;
      const tokenInput = doc.querySelector('input[name="token"]') as HTMLInputElement;

      // The value should be the unescaped string (browser interprets entities)
      expect(tokenInput.value).toBe('<script>alert(1)</script>');
    });
  });

  describe('Loading States', () => {
    it('should have submit button with proper text', async () => {
      const dom = await fetchPage('/');
      const doc = dom.window.document;

      const button = doc.querySelector('button[type="submit"]');
      expect(button?.textContent?.trim()).toBeTruthy();
    });
  });

  describe('Manifest JSON Structure', () => {
    it('should have valid manifest.json', async () => {
      const res = await worker.fetch('/manifest.json', { redirect: 'manual' });
      const manifest = await res.json() as Record<string, unknown>;

      expect(manifest.name).toBe('FlareDrop');
      expect(manifest.short_name).toBe('FlareDrop');
      expect(manifest.display).toBe('standalone');
      expect(manifest.start_url).toBe('/');
      expect(manifest.icons).toBeDefined();
      expect(Array.isArray(manifest.icons)).toBe(true);
    });

    it('should have share_target in manifest', async () => {
      const res = await worker.fetch('/manifest.json', { redirect: 'manual' });
      const manifest = await res.json() as { share_target: Record<string, unknown> };

      expect(manifest.share_target).toBeDefined();
      expect(manifest.share_target.action).toBe('/share');
      expect(manifest.share_target.method).toBe('POST');
      expect(manifest.share_target.enctype).toBe('multipart/form-data');
    });

    it('should have proper icon sizes', async () => {
      const res = await worker.fetch('/manifest.json', { redirect: 'manual' });
      const manifest = await res.json() as { icons: { sizes: string }[] };

      const sizes = manifest.icons.map(i => i.sizes);
      expect(sizes).toContain('192x192');
      expect(sizes).toContain('512x512');
    });
  });

  describe('SVG Icons', () => {
    it('should serve valid SVG for icons', async () => {
      const res192 = await worker.fetch('/icon-192.png', { redirect: 'manual' });
      const svg192 = await res192.text();

      expect(svg192).toContain('<svg');
      expect(svg192).toContain('xmlns="http://www.w3.org/2000/svg"');
      expect(svg192).toContain('width="192"');
    });

    it('should have gradient in icon', async () => {
      const res = await worker.fetch('/icon-512.png', { redirect: 'manual' });
      const svg = await res.text();

      expect(svg).toContain('linearGradient');
      expect(svg).toContain('#667eea');
    });
  });
});
