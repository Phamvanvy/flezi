'use strict';
// Shared browser helpers: JSON fetch wrapper, toasts, and the sign-in gate.
window.Flezi = (() => {
  async function api(method, path, body) {
    const init = { method, credentials: 'same-origin', headers: {} };
    if (body !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    try {
      const res = await fetch(path, init);
      const data = res.status === 204 ? null : await res.json().catch(() => null);
      return { ok: res.ok, status: res.status, data, error: data && data.error };
    } catch {
      return { ok: false, status: 0, data: null, error: { message: 'Network error. Check your connection.' } };
    }
  }

  function toast(message, type = 'ok') {
    let host = document.querySelector('.toast-host');
    if (!host) {
      host = document.createElement('div');
      host.className = 'toast-host';
      host.setAttribute('role', 'status');
      document.body.appendChild(host);
    }
    const el = document.createElement('div');
    el.className = `toast${type === 'error' ? ' error' : ''}`;
    el.textContent = message;
    host.appendChild(el);
    // Rapid actions shouldn't bury the screen in toasts: keep only the 3 most recent.
    while (host.children.length > 3) host.firstElementChild.remove();
    setTimeout(() => el.remove(), 3200);
  }

  /** Shows the sign-in card until a session exists, then calls onReady(user). */
  async function requireSession(onReady) {
    const gate = document.getElementById('signin');
    const app = document.getElementById('app');
    const who = document.getElementById('who');
    const logout = document.getElementById('logout');
    wireLogout();

    const enter = (user) => {
      gate.hidden = true;
      app.hidden = false;
      if (who) who.textContent = `Signed in as ${user.name}`;
      if (logout) logout.hidden = false;
      onReady(user);
    };

    const existing = await api('GET', '/session');
    if (existing.ok) return enter(existing.data.user);

    gate.hidden = false;
    app.hidden = true;
    const form = gate.querySelector('form');
    const input = gate.querySelector('input');
    const error = gate.querySelector('.field-error');
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const button = form.querySelector('button');
      button.disabled = true;
      const res = await api('POST', '/session', { username: input.value });
      button.disabled = false;
      if (!res.ok) {
        error.textContent = (res.error && res.error.fields && res.error.fields.username) || res.error.message;
        return;
      }
      enter(res.data.user);
    });
  }

  function wireLogout() {
    const logout = document.getElementById('logout');
    if (!logout) return;
    logout.addEventListener('click', async () => {
      await api('DELETE', '/session');
      window.location.reload();
    });
  }

  function escapeText(s) {
    const div = document.createElement('div');
    div.textContent = s == null ? '' : String(s);
    return div.innerHTML;
  }

  const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

  function relativeTime(iso) {
    const diff = (Date.now() - new Date(iso).getTime()) / 1000;
    const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
    if (diff < 60) return rtf.format(-Math.round(diff), 'second');
    if (diff < 3600) return rtf.format(-Math.round(diff / 60), 'minute');
    if (diff < 86400) return rtf.format(-Math.round(diff / 3600), 'hour');
    return rtf.format(-Math.round(diff / 86400), 'day');
  }

  return { api, toast, requireSession, wireLogout, escapeText, money, relativeTime };
})();
