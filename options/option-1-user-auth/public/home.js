'use strict';
(async () => {
  const $ = (id) => document.getElementById(id);
  const res = await fetch('/me', { credentials: 'same-origin' });
  if (res.status === 401) {
    window.location.replace('/?expired=1');
    return;
  }
  const me = await res.json();
  $('me-email').textContent = me.email;
  $('me-id').textContent = me.id;
  $('me-created').textContent = new Date(me.createdAt).toLocaleString();
  $('loading').hidden = true;
  $('profile').hidden = false;

  $('logout').addEventListener('click', async () => {
    await fetch('/logout', { method: 'POST', credentials: 'same-origin' });
    window.location.replace('/?login=1');
  });
})();
