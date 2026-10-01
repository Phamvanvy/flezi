'use strict';
// Drives the real apps in headless Edge and captures evidence screenshots.
// Also runs each option's real test suite and renders its stdout as an image.
const { chromium } = require('playwright-core');
const { execSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

const OPTIONS = 'E:/repos/flezi/options';
const OUT = 'E:/repos/flezi/evidence';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

const dirs = {
  1: 'option-1-user-auth',
  2: 'option-2-todo-crud',
  3: 'option-3-product-catalog',
  4: 'option-4-shopping-cart',
  5: 'option-5-reviews',
};

async function startApp(n) {
  const { createApp } = require(path.join(OPTIONS, dirs[n], 'src/app.js'));
  const dbFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), `opt${n}-`)), 'app.db');
  const app = n === 3 ? createApp({ quiet: true }) : createApp({ quiet: true, dbFile });
  const server = http.createServer(app.handler);
  await new Promise((r) => server.listen(0, 'localhost', r));
  return { base: `http://localhost:${server.address().port}`, close: () => new Promise((r) => server.close(r)) };
}

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function terminalHtml(title, command, output) {
  const lines = output
    .split(/\r?\n/)
    .map((l) => {
      const e = escapeHtml(l);
      if (/^\s*✔/.test(l)) return `<span class="ok">${e}</span>`;
      if (/^\s*✖/.test(l)) return `<span class="bad">${e}</span>`;
      if (/^ℹ (pass|tests)/.test(l)) return `<span class="ok b">${e}</span>`;
      if (/^ℹ fail 0/.test(l)) return `<span class="ok b">${e}</span>`;
      if (/^ℹ/.test(l)) return `<span class="info">${e}</span>`;
      return e;
    })
    .join('\n');
  return `<!doctype html><meta charset="utf-8"><style>
    body{margin:0;background:#0c0c0c;font:15px/1.45 Consolas,"Cascadia Mono",monospace;color:#d4d4d4}
    .bar{background:#1f1f1f;color:#cfcfcf;padding:8px 14px;font:13px "Segoe UI",sans-serif;border-bottom:1px solid #333}
    pre{margin:0;padding:14px 18px;white-space:pre-wrap}
    .cmd{color:#e5c07b}.ok{color:#4ec9b0}.bad{color:#f48771}.info{color:#9cdcfe}.b{font-weight:bold}
  </style><div class="bar">${escapeHtml(title)}</div><pre><span class="cmd">${escapeHtml(command)}</span>\n${lines}</pre>`;
}

function codeHtml(title, code, from, to) {
  const lines = code.split(/\r?\n/).slice(from - 1, to);
  const body = lines
    .map((l, i) => {
      let e = escapeHtml(l);
      e = e.replace(/(\/\/.*)$/, '<span class="c">$1</span>');
      e = e.replace(/('[^']*'|`[^`]*`)/g, '<span class="s">$1</span>');
      e = e.replace(/\b(const|let|function|return|if|throw|async|await|new|for|of|try|catch|else)\b/g, '<span class="k">$1</span>');
      return `<span class="n">${String(from + i).padStart(3, ' ')}</span>  ${e}`;
    })
    .join('\n');
  return `<!doctype html><meta charset="utf-8"><style>
    body{margin:0;background:#1e1e1e;font:14px/1.5 Consolas,"Cascadia Mono",monospace;color:#d4d4d4}
    .tab{background:#252526;color:#fff;padding:8px 14px;font:13px "Segoe UI",sans-serif;border-bottom:2px solid #0e7c86;display:inline-block}
    .head{background:#2d2d2d}
    pre{margin:0;padding:12px 16px;white-space:pre}
    .n{color:#6e7681}.k{color:#569cd6}.s{color:#ce9178}.c{color:#6a9955}
  </style><div class="head"><span class="tab">${escapeHtml(title)}</span></div><pre>${body}</pre>`;
}

async function renderHtml(browser, html, file, width = 1100) {
  const page = await browser.newPage({ viewport: { width, height: 400 }, deviceScaleFactor: 1.5 });
  await page.setContent(html);
  await page.screenshot({ path: file, fullPage: true });
  await page.close();
}

async function evidenceForTests(browser, n) {
  const cwd = path.join(OPTIONS, dirs[n]);
  let output;
  try {
    output = execSync('npm test', { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (err) {
    output = (err.stdout || '') + (err.stderr || '');
  }
  output = output.replace(/^\s*> .*\n/gm, '').trim();
  fs.writeFileSync(path.join(OUT, `option-${n}`, 'test-output.txt'), output);
  await renderHtml(browser, terminalHtml(`Terminal — ${dirs[n]} — ${new Date().toISOString().slice(0, 10)}`, `PS E:\\repos\\flezi\\options\\${dirs[n]}> npm test`, output), path.join(OUT, `option-${n}`, 'tests.png'), 1150);
}

async function evidenceForCode(browser, n, rel, from, to) {
  const code = fs.readFileSync(path.join(OPTIONS, dirs[n], rel), 'utf8');
  await renderHtml(browser, codeHtml(`${dirs[n]}/${rel}  (lines ${from}-${to})`, code, from, to), path.join(OUT, `option-${n}`, 'code.png'), 1150);
}

async function newPage(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 760 }, deviceScaleFactor: 1.5 });
  return ctx.newPage();
}

async function snap(page, n, name, opts = {}) {
  await pause(opts.wait ?? 250);
  // Crop to the content so the slide shows the UI, not empty background.
  const selector = opts.toast ? 'header, main > *, .toast' : 'header, main > *';
  const bounds = await page.evaluate((sel) => {
    let b = 0;
    let l = Infinity;
    let r = 0;
    let t = Infinity;
    for (const el of document.querySelectorAll(sel)) {
      if (el.hidden || el.offsetParent === null && getComputedStyle(el).position !== 'fixed') continue;
      const rect = el.getBoundingClientRect();
      b = Math.max(b, rect.bottom);
      l = Math.min(l, rect.left);
      r = Math.max(r, rect.right);
      t = Math.min(t, rect.top);
    }
    return { b, l, r, t };
  }, selector);
  // Without a full-width header (e.g. a centred login card), crop to the content on all sides.
  const hasHeader = await page.$('header.top');
  const x = hasHeader ? 0 : Math.max(0, Math.floor(bounds.l - 40));
  const y = hasHeader ? 0 : Math.max(0, Math.floor(bounds.t - 40));
  const width = hasHeader ? 1280 : Math.min(1280 - x, Math.ceil(bounds.r - bounds.l + 80));
  const height = Math.min(Math.max(Math.ceil(bounds.b + 28) - y, 300), 760 - y);
  await page.screenshot({ path: path.join(OUT, `option-${n}`, `${name}.png`), clip: { x, y, width, height } });
}

async function signIn(page, base, username) {
  await page.goto(base);
  await page.fill('#username', username);
  await page.click('#signin button[type=submit]');
  await page.waitForSelector('#app:not([hidden])');
}

const flows = {
  async 1(browser, base) {
    const page = await newPage(browser);
    await page.goto(base);
    await page.fill('#email', 'not-an-email');
    await page.fill('#password', 'short');
    await page.click('#title');
    await page.click('#submit');
    await snap(page, 1, 'ui-1-inline-validation');
    await page.fill('#email', 'vypv.demo@example.com');
    await page.fill('#password', 'Secret123');
    await page.click('#submit');
    await page.waitForURL('**/home.html');
    await page.waitForSelector('#profile:not([hidden])');
    await snap(page, 1, 'ui-2-protected-home');
    await page.click('#logout');
    await page.waitForURL('**/?login=1');
    await page.click('#toggle'); // back to register
    await page.fill('#email', 'VYPV.demo@example.com ');
    await page.fill('#password', 'Secret123');
    await page.click('#submit');
    await page.waitForSelector('#form-error:not([hidden])');
    await snap(page, 1, 'ui-3-duplicate-409');
    await page.click('#toggle'); // login
    await page.fill('#email', 'vypv.demo@example.com');
    await page.fill('#password', 'WrongPass1');
    await page.click('#submit');
    await page.waitForSelector('#form-error:not([hidden])');
    await snap(page, 1, 'ui-4-login-401-generic');
    await page.context().close();
  },

  async 2(browser, base) {
    const page = await newPage(browser);
    await signIn(page, base, 'vypv');
    await snap(page, 2, 'ui-1-empty-state');
    const add = async (title, desc = '') => {
      await page.fill('#new-title', title);
      await page.fill('#new-desc', desc);
      await page.click('#add-btn');
      await pause(150);
    };
    await add('Review Flow-2 guideline', 'Check the 16 required sections');
    await add('Write unit tests for ownership', 'User B must get 404');
    await add('Prepare evidence screenshots');
    await add('Submit report deck', 'Upload to PowerApps form');
    await page.locator('.task input[type=checkbox]').nth(3).click();
    await pause(200);
    await page.locator('.task input[type=checkbox]').nth(2).click();
    await pause(300);
    await snap(page, 2, 'ui-2-task-list', { wait: 900 });
    await page.fill('#new-title', '    ');
    await page.click('#add-btn');
    await snap(page, 2, 'ui-3-whitespace-title', { wait: 100 });
    await page.fill('#new-title', '');
    await page.locator('.task .actions button', { hasText: 'Edit' }).first().click();
    await page.locator('.edit-fields input').first().fill('Submit report deck (final v2)');
    await snap(page, 2, 'ui-4-inline-edit', { wait: 3500 });
    await page.keyboard.press('Enter');
    await pause(300);
    await page.click('.tabs button[data-filter=done]');
    await snap(page, 2, 'ui-5-filter-done', { wait: 600 });
    await page.context().close();
  },

  async 3(browser, base) {
    const page = await newPage(browser);
    await page.goto(base);
    await page.waitForSelector('.product');
    await snap(page, 3, 'ui-1-default-grid', { wait: 400 });
    await page.check('#categories input[value=electronics]');
    await page.check('#categories input[value=sports]');
    await page.fill('#minPrice', '20');
    await page.fill('#maxPrice', '120');
    await page.selectOption('#sort', 'price_asc');
    await pause(700);
    await snap(page, 3, 'ui-2-combined-filters-chips', { wait: 400 });
    await page.click('#pager button:has-text("2")');
    await snap(page, 3, 'ui-3-page-2-filters-kept', { wait: 600 });
    await page.goto(base);
    await page.fill('#search', 'zzz-no-match');
    await snap(page, 3, 'ui-4-empty-state', { wait: 900 });
    await page.goto(base);
    await page.fill('#minPrice', '100');
    await page.fill('#maxPrice', '10');
    await snap(page, 3, 'ui-5-min-gt-max', { wait: 900 });
    await page.context().close();
  },

  async 4(browser, base) {
    const page = await newPage(browser);
    await signIn(page, base, 'vypv');
    await page.waitForSelector('.products li');
    await snap(page, 4, 'ui-1-empty-cart', { wait: 400 });
    const addBtn = (name) => page.locator('.products li', { hasText: name }).locator('button');
    await addBtn('Ceramic Mug').click();
    await pause(150);
    await addBtn('Ceramic Mug').click(); // merge
    await pause(150);
    await addBtn('Ceramic Mug').click();
    await pause(150);
    await addBtn('Dotted Notebook').click();
    await pause(150);
    await addBtn('USB-C Cable').click();
    await pause(150);
    await snap(page, 4, 'ui-2-cart-merged-totals', { wait: 700 });
    const plus = page.locator('tr', { hasText: 'USB-C Cable' }).locator('button[aria-label^=Increase]');
    for (let i = 0; i < 4; i++) await plus.click(); // rapid clicks
    await snap(page, 4, 'ui-3-rapid-stepper', { wait: 900 });
    await page.reload();
    await page.waitForSelector('#cart-table:not([hidden])');
    await snap(page, 4, 'ui-4-persisted-after-reload', { wait: 500 });
    await page.click('#checkout');
    await snap(page, 4, 'ui-5-checkout-done', { wait: 700, toast: true });
    await page.context().close();
  },

  async 5(browser, base) {
    const page = await newPage(browser);
    await signIn(page, base, 'vypv');
    await page.waitForSelector('#reviews li');
    await snap(page, 5, 'ui-1-average-and-list', { wait: 400 });
    await page.click('#items button:has-text("Pour-over Kettle")');
    await snap(page, 5, 'ui-2-empty-be-first', { wait: 500 });
    await page.click('#items button:has-text("Aurora Headphones")');
    await pause(400);
    await page.click('#submit');
    await snap(page, 5, 'ui-3-rating-required', { wait: 200 });
    await page.click('label[for=star-4]');
    await page.fill('#comment', 'Solid headphones, battery easily lasts a work week.');
    await page.click('#submit');
    await snap(page, 5, 'ui-4-submitted', { wait: 800, toast: true });
    await page.reload();
    await page.waitForSelector('#reviews li');
    await pause(500);
    await page.click('label[for=star-2]');
    await page.fill('#comment', 'Edited: right ear cup started crackling after a week.');
    await snap(page, 5, 'ui-5-edit-prefilled');
    await page.click('#submit');
    await snap(page, 5, 'ui-6-edited-average-updated', { wait: 800 });
    await page.context().close();
  },
};

const codeRefs = {
  1: ['src/authService.js', 17, 50],
  2: ['src/taskService.js', 76, 109],
  3: ['src/catalogService.js', 83, 118],
  4: ['src/cartService.js', 67, 100],
  5: ['src/reviewService.js', 76, 107],
};

(async () => {
  const only = process.argv.slice(2).map(Number);
  const browser = await chromium.launch({ executablePath: EDGE, headless: true });
  try {
    for (const n of Object.keys(dirs).map(Number)) {
      if (only.length && !only.includes(n)) continue;
      fs.mkdirSync(path.join(OUT, `option-${n}`), { recursive: true });
      const app = await startApp(n);
      try {
        await flows[n](browser, app.base);
      } finally {
        await app.close();
      }
      await evidenceForTests(browser, n);
      await evidenceForCode(browser, n, ...codeRefs[n]);
      console.log(`option ${n}: done`);
    }
  } finally {
    await browser.close();
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
