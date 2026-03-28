import { Device, Transfer } from './types';
import { formatBytes } from './utils';

const baseStyles = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    min-height: 100vh;
    color: #333;
  }
  .container {
    max-width: 480px;
    margin: 0 auto;
    padding: 20px;
    min-height: 100vh;
  }
  .card {
    background: white;
    border-radius: 16px;
    padding: 24px;
    margin-bottom: 16px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.15);
  }
  h1 { font-size: 28px; margin-bottom: 8px; }
  h2 { font-size: 20px; margin-bottom: 16px; color: #555; }
  h3 { font-size: 16px; margin-bottom: 12px; }
  .logo { font-size: 48px; text-align: center; margin-bottom: 16px; }
  input, select {
    width: 100%;
    padding: 14px;
    border: 2px solid #e0e0e0;
    border-radius: 12px;
    font-size: 16px;
    margin-bottom: 12px;
    transition: border-color 0.2s;
  }
  input:focus, select:focus {
    outline: none;
    border-color: #667eea;
  }
  button, .btn {
    display: inline-block;
    width: 100%;
    padding: 14px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border: none;
    border-radius: 12px;
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
    text-align: center;
    text-decoration: none;
    transition: transform 0.2s, box-shadow 0.2s;
  }
  button:hover, .btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
  }
  button:active, .btn:active { transform: translateY(0); }
  .btn-secondary {
    background: #f0f0f0;
    color: #333;
  }
  .btn-secondary:hover {
    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  }
  .device-list { list-style: none; }
  .device-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px;
    background: #f8f9fa;
    border-radius: 12px;
    margin-bottom: 8px;
    cursor: pointer;
    transition: background 0.2s;
  }
  .device-item:hover { background: #e9ecef; }
  .device-item.selected { background: #667eea; color: white; }
  .device-icon { font-size: 24px; margin-right: 12px; }
  .device-name { flex: 1; font-weight: 500; }
  .transfer-item {
    padding: 16px;
    background: #f8f9fa;
    border-radius: 12px;
    margin-bottom: 8px;
  }
  .transfer-name { font-weight: 600; margin-bottom: 4px; }
  .transfer-meta { font-size: 14px; color: #666; }
  .qr-container { text-align: center; padding: 20px; }
  .qr-container img, .qr-container svg { max-width: 200px; margin: 0 auto; }
  .file-drop {
    border: 3px dashed #ccc;
    border-radius: 16px;
    padding: 40px;
    text-align: center;
    transition: all 0.2s;
    cursor: pointer;
  }
  .file-drop.dragover {
    border-color: #667eea;
    background: rgba(102, 126, 234, 0.1);
  }
  .file-drop-icon { font-size: 48px; margin-bottom: 12px; }
  .hidden { display: none; }
  .mt-2 { margin-top: 16px; }
  .text-center { text-align: center; }
  .text-muted { color: #666; font-size: 14px; }
  .nav {
    display: flex;
    gap: 8px;
    margin-bottom: 16px;
  }
  .nav a {
    flex: 1;
    padding: 12px;
    background: rgba(255,255,255,0.2);
    color: white;
    text-decoration: none;
    text-align: center;
    border-radius: 12px;
    font-weight: 500;
  }
  .nav a.active { background: white; color: #667eea; }
  .error { color: #dc3545; margin-bottom: 12px; }
  .success { color: #28a745; margin-bottom: 12px; }
`;

function layout(content: string, title: string = 'FlareDrop'): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
  <meta name="theme-color" content="#667eea">
  <title>${title}</title>
  <link rel="manifest" href="/manifest.json">
  <style>${baseStyles}</style>
</head>
<body>
  <div class="container">
    ${content}
  </div>
</body>
</html>`;
}

export function loginPage(error?: string): string {
  return layout(`
    <div class="card">
      <div class="logo">📡</div>
      <h1 class="text-center">FlareDrop</h1>
      <p class="text-center text-muted" style="margin-bottom: 24px;">
        Secure file sharing across your devices
      </p>
      ${error ? `<p class="error">${escapeHtml(error)}</p>` : ''}
      <form method="POST" action="/auth/email">
        <input type="email" name="email" placeholder="Enter your email" required>
        <button type="submit">Send Login Link</button>
      </form>
    </div>
  `, 'Login - FlareDrop');
}

export function emailSentPage(email: string): string {
  return layout(`
    <div class="card">
      <div class="logo">📬</div>
      <h2 class="text-center">Check your email</h2>
      <p class="text-center text-muted">
        We sent a login link to<br><strong>${escapeHtml(email)}</strong>
      </p>
      <p class="text-center text-muted mt-2">
        Click the link in the email to continue.
      </p>
    </div>
  `, 'Check Email - FlareDrop');
}

export function verifyPage(token: string): string {
  return layout(`
    <div class="card">
      <div class="logo">🔐</div>
      <h2 class="text-center">Complete Setup</h2>
      <form method="POST" action="/auth/verify">
        <input type="hidden" name="token" value="${escapeHtml(token)}">
        <input type="text" name="deviceName" placeholder="Name this device (e.g. My iPhone)" required>
        <button type="submit">Complete Setup</button>
      </form>
    </div>
  `, 'Setup - FlareDrop');
}

export function invitePage(token: string): string {
  return layout(`
    <div class="card">
      <div class="logo">🎟️</div>
      <h2 class="text-center">Join FlareDrop</h2>
      <p class="text-center text-muted" style="margin-bottom: 16px;">
        You've been invited to join this FlareDrop network.
      </p>
      <form method="POST" action="/auth/invite">
        <input type="hidden" name="token" value="${escapeHtml(token)}">
        <input type="text" name="deviceName" placeholder="Name this device (e.g. My MacBook)" required>
        <button type="submit">Join Network</button>
      </form>
    </div>
  `, 'Join - FlareDrop');
}

export function dashboardPage(device: Device, devices: Device[], pendingTransfers: Transfer[]): string {
  const otherDevices = devices.filter(d => d.id !== device.id);

  return layout(`
    <nav class="nav">
      <a href="/" class="active">Send</a>
      <a href="/transfers">History</a>
      <a href="/settings">Settings</a>
    </nav>

    <div class="card">
      <h3>Send to Device</h3>
      <form id="sendForm" enctype="multipart/form-data">
        <div class="file-drop" id="fileDrop">
          <div class="file-drop-icon">📁</div>
          <p>Tap to select or drop files here</p>
          <input type="file" name="file" id="fileInput" class="hidden" required multiple>
        </div>
        <div id="selectedFile" class="text-muted mt-2"></div>

        <select name="targetDevice" id="targetDevice" class="mt-2" required>
          <option value="">Select destination device...</option>
          ${otherDevices.map(d => `<option value="${d.id}">${d.name}</option>`).join('')}
        </select>

        <button type="submit" class="mt-2" id="sendBtn" disabled>Send File</button>
      </form>
    </div>

    ${pendingTransfers.length > 0 ? `
    <div class="card">
      <h3>Incoming Files</h3>
      ${pendingTransfers.map(t => `
        <div class="transfer-item">
          <div class="transfer-name">📄 ${escapeHtml(t.file_name)}</div>
          <div class="transfer-meta">${formatBytes(t.file_size)}</div>
          <a href="/download/${t.id}" class="btn mt-2">Download</a>
        </div>
      `).join('')}
    </div>
    ` : ''}

    <div class="card">
      <h3>Add Another Device</h3>
      <button id="showQrBtn" class="btn-secondary">Show QR Code</button>
      <div id="qrContainer" class="qr-container hidden"></div>
    </div>

    <script>
      const fileDrop = document.getElementById('fileDrop');
      const fileInput = document.getElementById('fileInput');
      const selectedFile = document.getElementById('selectedFile');
      const sendBtn = document.getElementById('sendBtn');
      const sendForm = document.getElementById('sendForm');
      const targetDevice = document.getElementById('targetDevice');

      fileDrop.addEventListener('click', () => fileInput.click());

      fileDrop.addEventListener('dragover', (e) => {
        e.preventDefault();
        fileDrop.classList.add('dragover');
      });

      fileDrop.addEventListener('dragleave', () => {
        fileDrop.classList.remove('dragover');
      });

      fileDrop.addEventListener('drop', (e) => {
        e.preventDefault();
        fileDrop.classList.remove('dragover');
        fileInput.files = e.dataTransfer.files;
        updateFileDisplay();
      });

      fileInput.addEventListener('change', updateFileDisplay);

      function updateFileDisplay() {
        if (fileInput.files.length > 0) {
          const names = Array.from(fileInput.files).map(f => f.name).join(', ');
          selectedFile.textContent = names;
          checkReady();
        }
      }

      targetDevice.addEventListener('change', checkReady);

      function checkReady() {
        sendBtn.disabled = !(fileInput.files.length > 0 && targetDevice.value);
      }

      sendForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        sendBtn.disabled = true;
        sendBtn.textContent = 'Sending...';

        const formData = new FormData();
        formData.append('targetDevice', targetDevice.value);
        for (const file of fileInput.files) {
          formData.append('file', file);
        }

        try {
          const res = await fetch('/api/send', { method: 'POST', body: formData });
          if (res.ok) {
            alert('File sent successfully!');
            location.reload();
          } else {
            const data = await res.json();
            alert(data.error || 'Failed to send file');
          }
        } catch (err) {
          alert('Network error');
        }

        sendBtn.disabled = false;
        sendBtn.textContent = 'Send File';
      });

      document.getElementById('showQrBtn').addEventListener('click', async () => {
        const container = document.getElementById('qrContainer');
        if (!container.classList.contains('hidden')) {
          container.classList.add('hidden');
          return;
        }

        const res = await fetch('/api/invite');
        const data = await res.json();
        container.innerHTML = '<img src="' + data.qrDataUrl + '"><p class="text-muted mt-2">Scan with another device</p><p class="text-muted">Expires in 5 minutes</p>';
        container.classList.remove('hidden');
      });
    </script>
  `, 'FlareDrop');
}

export function transfersPage(device: Device, sent: Transfer[], received: Transfer[], devices: Device[]): string {
  const deviceMap = new Map(devices.map(d => [d.id, d.name]));

  return layout(`
    <nav class="nav">
      <a href="/">Send</a>
      <a href="/transfers" class="active">History</a>
      <a href="/settings">Settings</a>
    </nav>

    <div class="card">
      <h3>Received</h3>
      ${received.length === 0 ? '<p class="text-muted">No files received yet</p>' : ''}
      ${received.map(t => `
        <div class="transfer-item">
          <div class="transfer-name">📄 ${escapeHtml(t.file_name)}</div>
          <div class="transfer-meta">
            From: ${escapeHtml(deviceMap.get(t.from_device_id) || 'Unknown')} • ${formatBytes(t.file_size)}
            ${t.downloaded ? '• Downloaded' : ''}
          </div>
          ${!t.downloaded ? `<a href="/download/${t.id}" class="btn mt-2">Download</a>` : ''}
        </div>
      `).join('')}
    </div>

    <div class="card">
      <h3>Sent</h3>
      ${sent.length === 0 ? '<p class="text-muted">No files sent yet</p>' : ''}
      ${sent.map(t => `
        <div class="transfer-item">
          <div class="transfer-name">📄 ${escapeHtml(t.file_name)}</div>
          <div class="transfer-meta">
            To: ${escapeHtml(deviceMap.get(t.to_device_id) || 'Unknown')} • ${formatBytes(t.file_size)}
            ${t.downloaded ? '• Downloaded' : '• Pending'}
          </div>
        </div>
      `).join('')}
    </div>
  `, 'History - FlareDrop');
}

export function settingsPage(device: Device, devices: Device[]): string {
  return layout(`
    <nav class="nav">
      <a href="/">Send</a>
      <a href="/transfers">History</a>
      <a href="/settings" class="active">Settings</a>
    </nav>

    <div class="card">
      <h3>This Device</h3>
      <form method="POST" action="/settings/device">
        <input type="text" name="name" value="${escapeHtml(device.name)}" required>
        <button type="submit">Save Name</button>
      </form>

      <div class="mt-2">
        <button id="pushBtn" class="btn-secondary">
          ${device.push_subscription ? 'Disable' : 'Enable'} Notifications
        </button>
      </div>
    </div>

    <div class="card">
      <h3>All Devices</h3>
      <ul class="device-list">
        ${devices.map(d => `
          <li class="device-item">
            <span class="device-icon">${d.id === device.id ? '📱' : '💻'}</span>
            <span class="device-name">${escapeHtml(d.name)}${d.id === device.id ? ' (this device)' : ''}</span>
            ${d.id !== device.id ? `
              <form method="POST" action="/settings/device/${d.id}/delete" style="margin:0">
                <button type="submit" style="width:auto;padding:8px 12px;font-size:14px">Remove</button>
              </form>
            ` : ''}
          </li>
        `).join('')}
      </ul>
    </div>

    <div class="card">
      <h3>Account</h3>
      <form method="POST" action="/auth/logout">
        <button type="submit" class="btn-secondary">Sign Out</button>
      </form>
    </div>

    <script>
      document.getElementById('pushBtn').addEventListener('click', async () => {
        const btn = document.getElementById('pushBtn');
        const enabled = btn.textContent.includes('Disable');

        if (enabled) {
          await fetch('/api/push/unsubscribe', { method: 'POST' });
          btn.textContent = 'Enable Notifications';
        } else {
          if (!('Notification' in window)) {
            alert('Notifications not supported');
            return;
          }

          const permission = await Notification.requestPermission();
          if (permission !== 'granted') {
            alert('Permission denied');
            return;
          }

          // For full push support, you'd need a service worker here
          // iOS Safari limitation: Push requires service worker
          alert('Push notifications require additional setup. See documentation.');
        }
      });
    </script>
  `, 'Settings - FlareDrop');
}

export interface SharedData {
  title?: string;
  text?: string;
  url?: string;
  files?: { name: string; size: number; type: string; key: string }[];
}

export function sharePage(device: Device, devices: Device[], sharedData?: SharedData): string {
  const otherDevices = devices.filter(d => d.id !== device.id);
  const hasFiles = sharedData?.files && sharedData.files.length > 0;
  const hasText = sharedData?.title || sharedData?.text || sharedData?.url;

  let sharedContent = '';
  if (hasFiles) {
    sharedContent = `
      <div class="card" style="background: #f8f9fa;">
        <h3>Sharing ${sharedData!.files!.length} file(s)</h3>
        ${sharedData!.files!.map(f => `
          <div class="transfer-item">
            <div class="transfer-name">📄 ${escapeHtml(f.name)}</div>
            <div class="transfer-meta">${formatBytes(f.size)} • ${escapeHtml(f.type || 'Unknown type')}</div>
          </div>
        `).join('')}
      </div>
    `;
  } else if (hasText) {
    const textContent = [sharedData?.title, sharedData?.text, sharedData?.url].filter(Boolean).join(' - ');
    sharedContent = `
      <div class="card" style="background: #f8f9fa;">
        <h3>Sharing text</h3>
        <p class="text-muted" style="word-break: break-all;">${escapeHtml(textContent.substring(0, 200))}${textContent.length > 200 ? '...' : ''}</p>
      </div>
    `;
  }

  const fileKeys = sharedData?.files?.map(f => f.key).join(',') || '';

  return layout(`
    <div class="card">
      <div class="logo">📤</div>
      <h2 class="text-center">Share</h2>
      <p class="text-center text-muted" style="margin-bottom: 16px;">
        Select a device to share with
      </p>
    </div>

    ${sharedContent}

    <div class="card">
      <form id="shareForm" method="POST" action="/share/send">
        <input type="hidden" name="title" value="${escapeHtml(sharedData?.title || '')}">
        <input type="hidden" name="text" value="${escapeHtml(sharedData?.text || '')}">
        <input type="hidden" name="url" value="${escapeHtml(sharedData?.url || '')}">
        <input type="hidden" name="fileKeys" value="${escapeHtml(fileKeys)}">

        ${otherDevices.length === 0 ? `
          <p class="text-muted text-center">No other devices available. Add another device first.</p>
          <a href="/" class="btn mt-2">Go to Dashboard</a>
        ` : `
          <ul class="device-list" id="deviceList">
            ${otherDevices.map(d => `
              <li class="device-item" data-id="${d.id}">
                <span class="device-icon">💻</span>
                <span class="device-name">${escapeHtml(d.name)}</span>
              </li>
            `).join('')}
          </ul>

          <input type="hidden" name="targetDevice" id="targetDevice" required>
          <button type="submit" class="mt-2" id="sendBtn" disabled>Send</button>
        `}
      </form>
    </div>

    <script>
      const items = document.querySelectorAll('.device-item');
      const targetInput = document.getElementById('targetDevice');
      const sendBtn = document.getElementById('sendBtn');

      if (items.length > 0) {
        items.forEach(item => {
          item.addEventListener('click', () => {
            items.forEach(i => i.classList.remove('selected'));
            item.classList.add('selected');
            targetInput.value = item.dataset.id;
            sendBtn.disabled = false;
          });
        });
      }
    </script>
  `, 'Share - FlareDrop');
}

export function manifest(): string {
  return JSON.stringify({
    name: 'FlareDrop',
    short_name: 'FlareDrop',
    description: 'Secure file sharing across your devices',
    start_url: '/',
    display: 'standalone',
    background_color: '#667eea',
    theme_color: '#667eea',
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any maskable'
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any maskable'
      }
    ],
    share_target: {
      action: '/share',
      method: 'POST',
      enctype: 'multipart/form-data',
      params: {
        title: 'title',
        text: 'text',
        url: 'url',
        files: [
          {
            name: 'files',
            accept: ['*/*', 'image/*', 'video/*', 'audio/*', 'application/*', 'text/*']
          }
        ]
      }
    }
  }, null, 2);
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
