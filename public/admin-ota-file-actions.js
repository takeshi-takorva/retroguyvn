(() => {
  if (window.location.pathname !== '/admin/ota') return;

  const protectedFilePath = id => `/api/admin/ota/releases/${encodeURIComponent(id)}/file`;
  const absoluteUrl = path => new URL(path, window.location.origin).toString();
  const authHeaders = () => {
    let token = '';
    try { token = sessionStorage.getItem('rg_admin_token') || ''; } catch {}
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  function setProgress(percent, visible = true) {
    const wrap = document.querySelector('#uploadProgress');
    const bar = wrap?.querySelector('span');
    if (!wrap || !bar) return;
    wrap.classList.toggle('ota-hidden', !visible);
    bar.style.width = `${Math.max(0, Math.min(100, Number(percent) || 0))}%`;
  }

  function uploadFormData(path, formData, method = 'PUT') {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open(method, path, true);
      xhr.timeout = 180000;
      for (const [name, value] of Object.entries(authHeaders())) xhr.setRequestHeader(name, value);

      xhr.upload.onprogress = event => {
        if (!event.lengthComputable || !event.total) return;
        const percent = Math.max(2, Math.min(90, Math.round((event.loaded / event.total) * 90)));
        setProgress(percent);
        notify(`Uploading firmware… ${percent}%`);
      };
      xhr.upload.onload = () => {
        setProgress(92);
        notify('Upload complete. Validating SHA-256 and saving firmware to R2…');
      };
      xhr.onload = () => {
        const data = (() => { try { return JSON.parse(xhr.responseText || '{}'); } catch { return {}; } })();
        if (xhr.status >= 200 && xhr.status < 300) {
          setProgress(100);
          resolve(data);
          return;
        }
        reject(new Error(data.message || data.error || `HTTP ${xhr.status}`));
      };
      xhr.onerror = () => reject(new Error('Firmware upload failed because the network connection was interrupted.'));
      xhr.ontimeout = () => reject(new Error('Firmware upload timed out after 3 minutes. Retry the upload; release metadata was not changed.'));
      xhr.onabort = () => reject(new Error('Firmware upload was cancelled.'));
      setProgress(1);
      xhr.send(formData);
    });
  }

  function chooseFirmwareFile() {
    return new Promise(resolve => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.bin,application/octet-stream';
      input.style.position = 'fixed';
      input.style.left = '-9999px';
      document.body.appendChild(input);
      let settled = false;
      const finish = file => {
        if (settled) return;
        settled = true;
        input.remove();
        resolve(file || null);
      };
      input.addEventListener('change', () => finish(input.files?.[0]), { once: true });
      window.addEventListener('focus', () => setTimeout(() => {
        if (!input.files?.length) finish(null);
      }, 300), { once: true });
      input.click();
    });
  }

  async function replaceReleaseFile(id) {
    const file = await chooseFirmwareFile();
    if (!file) return false;
    if (!confirm(`Replace firmware for ${id} with ${file.name}?`)) return false;
    const form = new FormData();
    form.set('file', file);
    const updated = await uploadFormData(protectedFilePath(id), form, 'PUT');
    document.querySelector('#refreshAll')?.click();
    if (updated?.product === 'DigitalRealm' && !updated?.signature) {
      notify(`Firmware file updated for ${id}. The old signature was cleared; open Edit and paste a new DR Device Studio signature before Publish.`, 'good');
    } else {
      notify(`Firmware file updated for ${id}.`, 'good');
    }
    return true;
  }

  function notify(text, tone = '') {
    const el = document.querySelector('#message');
    if (!el) return;
    el.textContent = text;
    el.className = `ota-message ${tone}`;
    el.classList.toggle('ota-hidden', !text);
  }

  function fileNameFromResponse(response, fallback) {
    const disposition = response.headers.get('content-disposition') || '';
    const match = disposition.match(/filename="?([^";]+)"?/i);
    return match?.[1] || fallback;
  }

  async function downloadRelease(id) {
    const path = protectedFilePath(id);
    const response = await fetch(path, { headers: authHeaders(), cache: 'no-store' });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.message || data.error || `HTTP ${response.status}`);
    }
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    try {
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = fileNameFromResponse(response, `${id}.bin`);
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } finally {
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    }
  }

  async function copyReleaseLink(id) {
    const value = absoluteUrl(protectedFilePath(id));
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
    } else {
      const input = document.createElement('textarea');
      input.value = value;
      input.style.position = 'fixed';
      input.style.opacity = '0';
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      input.remove();
    }
    notify(`Copied protected download link: ${value}`);
  }

  function makeButton(label, action, id) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'admin-button ota-mini';
    button.textContent = label;
    button.dataset.otaFileAction = action;
    button.dataset.id = id;
    return button;
  }

  function decorateReleaseRows() {
    document.querySelectorAll('#releaseRows tr').forEach(row => {
      const actions = row.querySelector('.ota-table-actions');
      const identity = actions?.querySelector('[data-id]');
      if (!actions || !identity) return;
      const id = identity.dataset.id;
      if (!id || actions.querySelector('[data-ota-file-action]')) return;
      actions.prepend(makeButton('Copy link', 'copy', id));
      actions.prepend(makeButton('Download', 'download', id));
      if (!row.querySelector('.ota-status.published')) {
        actions.prepend(makeButton('Update file', 'update', id));
      }
    });
  }

  function showAbsoluteDeviceEndpoints() {
    document.querySelectorAll('.ota-card code.ota-mono').forEach(code => {
      const text = code.textContent || '';
      if (text.includes('/api/dr/ota/download')) code.textContent = `GET ${absoluteUrl('/api/dr/ota/download')}`;
      else if (text.includes('/api/dr/ota')) code.textContent = `GET ${absoluteUrl('/api/dr/ota')}`;
    });
  }

  document.addEventListener('click', async event => {
    const button = event.target.closest?.('[data-ota-file-action]');
    if (!button) return;
    event.preventDefault();
    const { id, otaFileAction: action } = button.dataset;
    button.disabled = true;
    try {
      if (action === 'download') {
        await downloadRelease(id);
        notify(`Firmware download started for ${id}.`);
      } else if (action === 'copy') {
        await copyReleaseLink(id);
      } else if (action === 'update') {
        await replaceReleaseFile(id);
      }
    } catch (error) {
      notify(error?.message || 'Firmware file action failed.', 'error');
    } finally {
      button.disabled = false;
      setTimeout(() => setProgress(0, false), 800);
    }
  });

  function start() {
    showAbsoluteDeviceEndpoints();
    decorateReleaseRows();
    const rows = document.querySelector('#releaseRows');
    if (rows) new MutationObserver(decorateReleaseRows).observe(rows, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
