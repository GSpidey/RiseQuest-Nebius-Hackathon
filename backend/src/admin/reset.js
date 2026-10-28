'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const values = new URLSearchParams(location.hash.slice(1));
  const email = values.get('email'), token = values.get('token');
  // Tokens stay out of server access logs and referrers. Clear browser history too.
  if (location.hash) history.replaceState(null, '', location.pathname);
  if (email) $('reset-email').value = email;
  if (token) { $('reset-token').value = token; $('reset-token').type = 'hidden'; $('token-label').hidden = true; }
  let busy = false;
  const message = (text, error = false) => { $('reset-message').textContent = text; $('reset-message').className = error ? 'error' : ''; };
  async function post(route, body) {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(route, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body), credentials: 'omit', cache: 'no-store', signal: controller.signal });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not complete this request. Please try again.');
      return data;
    } catch (error) { if (error.name === 'AbortError') throw new Error('This request timed out. Please try again.'); throw error; }
    finally { clearTimeout(timer); }
  }
  async function run(action) {
    if (busy) return; busy = true; $('save-password').disabled = $('send-new-link').disabled = true;
    try { await action(); } catch (error) { message(error.message, true); }
    finally { busy = false; $('save-password').disabled = $('send-new-link').disabled = false; }
  }
  $('reset-form').addEventListener('submit', event => {
    event.preventDefault();
    if (!$('reset-form').reportValidity()) return;
    if ($('new-password').value !== $('confirm-password').value) return message('The passwords do not match.', true);
    if (new TextEncoder().encode($('new-password').value).length > 72) return message('Choose a password of at most 72 bytes.', true);
    run(async () => {
      const result = await post('/api/auth/reset-password', {email:$('reset-email').value, token:$('reset-token').value, password:$('new-password').value});
      if (!result.success) throw new Error('Could not reset your password. Please request a new link.');
      $('reset-form').reset(); $('reset-form').hidden = true; $('reset-success').hidden = false; message(''); $('reset-success').focus();
    });
  });
  $('send-new-link').addEventListener('click', () => {
    if (!$('reset-email').reportValidity()) return;
    run(async () => { await post('/api/auth/forgot-password', {email:$('reset-email').value}); message('If this account exists, a new reset link has been sent. Use the newest email.'); });
  });
})();
