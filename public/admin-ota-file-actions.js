(() => {
  if (window.location.pathname !== '/admin/ota') return;

  const protectedFilePath = id => `/api/admin/ota/releases/${encodeURIComponent(id)}/file`;
  const absoluteUrl = path => new URL(path, window.location.origin).toString();
  const authHeaders = () => {
    const token = sessionStorage.getItem('rg_admin_token') || '';
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

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
      }
    } catch (error) {
      notify(error?.message || 'Firmware file action failed.', 'error');
    } finally {
      button.disabled = false;
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
