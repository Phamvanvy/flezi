'use strict';
(() => {
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const $ = (id) => document.getElementById(id);
  const form = $('auth-form');
  const email = $('email');
  const password = $('password');
  const submit = $('submit');

  let mode = 'register'; // or 'login'
  let inFlight = false;
  const touched = { email: false, password: false };

  const COPY = {
    register: {
      title: 'Create your account',
      subtitle: 'Register to access your personalised dashboard.',
      submit: 'Create account',
      toggleText: 'Already have an account?',
      toggle: 'Sign in',
      autocomplete: 'new-password',
    },
    login: {
      title: 'Welcome back',
      subtitle: 'Sign in with your email and password.',
      submit: 'Sign in',
      toggleText: 'New here?',
      toggle: 'Create an account',
      autocomplete: 'current-password',
    },
  };

  function rules(pw) {
    return { length: pw.length >= 8, letter: /[A-Za-z]/.test(pw), digit: /\d/.test(pw) };
  }

  function emailMessage() {
    const v = email.value.trim();
    if (!v) return 'Email is required';
    if (v.length > 254) return 'Email must be at most 254 characters';
    if (!EMAIL_RE.test(v)) return 'Enter a valid email address';
    return '';
  }

  function passwordMessage() {
    const v = password.value;
    if (!v) return 'Password is required';
    if (mode === 'login') return '';
    const r = rules(v);
    if (!r.length) return 'Password must be at least 8 characters';
    if (!r.letter || !r.digit) return 'Password must contain at least one letter and one number';
    return '';
  }

  function showField(input, errorEl, message, force) {
    const show = force || touched[input.name];
    errorEl.textContent = show ? message : '';
    input.classList.toggle('invalid', Boolean(show && message));
    input.setAttribute('aria-invalid', String(Boolean(show && message)));
  }

  function validate(force = false) {
    const e = emailMessage();
    const p = passwordMessage();
    showField(email, $('email-error'), e, force);
    showField(password, $('password-error'), p, force);
    const r = rules(password.value);
    document.querySelectorAll('#pw-rules li').forEach((li) => li.classList.toggle('met', r[li.dataset.rule]));
    return !e && !p;
  }

  function setMode(next) {
    mode = next;
    const c = COPY[mode];
    $('title').textContent = c.title;
    $('subtitle').textContent = c.subtitle;
    $('submit-label').textContent = c.submit;
    $('toggle-text').textContent = c.toggleText;
    $('toggle').textContent = c.toggle;
    $('pw-rules').hidden = mode === 'login';
    password.autocomplete = c.autocomplete;
    $('form-error').hidden = true;
    touched.email = touched.password = false;
    validate(false);
  }

  function setBusy(busy) {
    inFlight = busy;
    submit.disabled = busy;
    $('spinner').hidden = !busy;
  }

  function showFormError(message) {
    $('form-error').textContent = message;
    $('form-error').hidden = !message;
  }

  async function post(path, body) {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(body),
    });
    const data = res.status === 204 ? {} : await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  }

  function applyServerError({ status, data }) {
    const err = (data && data.error) || {};
    if (err.fields) {
      if (err.fields.email) showField(email, $('email-error'), err.fields.email, true);
      if (err.fields.password) showField(password, $('password-error'), err.fields.password, true);
    }
    if (status === 409) return showFormError('Email already in use. Try signing in instead.');
    if (status === 429) return showFormError(err.message || 'Too many attempts. Please wait and try again.');
    showFormError(err.message || 'Something went wrong. Please try again.');
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (inFlight) return; // guards double-submit even if the button is re-enabled by devtools
    showFormError('');
    $('notice').hidden = true;
    if (!validate(true)) return;

    const credentials = { email: email.value.trim(), password: password.value };
    setBusy(true);
    try {
      if (mode === 'register') {
        const reg = await post('/register', credentials);
        if (!reg.ok) return applyServerError(reg);
      }
      const login = await post('/login', credentials);
      if (!login.ok) return applyServerError(login);
      // Session lives in an HttpOnly cookie set by the server; nothing stored in localStorage.
      window.location.assign('/home.html');
    } catch {
      showFormError('Network error. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  });

  for (const input of [email, password]) {
    input.addEventListener('input', () => validate(false));
    input.addEventListener('blur', () => {
      touched[input.name] = true;
      validate(false);
    });
  }

  $('toggle').addEventListener('click', (event) => {
    event.preventDefault();
    setMode(mode === 'register' ? 'login' : 'register');
  });

  const params = new URLSearchParams(window.location.search);
  if (params.has('login') || params.has('expired')) setMode('login');
  if (params.has('expired')) {
    $('notice').textContent = 'Your session expired. Please sign in again.';
    $('notice').hidden = false;
  }
})();
