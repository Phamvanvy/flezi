'use strict';
(() => {
  const { money, toast } = window.Flezi;
  const $ = (id) => document.getElementById(id);
  const PRICE_RE = /^\d+(\.\d{1,2})?$/;
  const SORT_LABELS = { newest: 'Newest', price_asc: 'Price ↑', price_desc: 'Price ↓', name_asc: 'Name A-Z' };

  // Single source of truth for filters; mirrored into the URL so reload/back keep state.
  const state = { search: '', categories: [], minPrice: '', maxPrice: '', sort: 'newest', page: 1 };
  let controller = null;

  function readUrl() {
    const p = new URLSearchParams(window.location.search);
    state.search = p.get('search') || '';
    state.categories = p.getAll('category');
    state.minPrice = p.get('minPrice') || '';
    state.maxPrice = p.get('maxPrice') || '';
    state.sort = p.get('sort') || 'newest';
    state.page = Math.max(1, Number(p.get('page')) || 1);
  }

  function toParams() {
    const p = new URLSearchParams();
    if (state.search) p.set('search', state.search);
    for (const c of state.categories) p.append('category', c);
    if (state.minPrice) p.set('minPrice', state.minPrice);
    if (state.maxPrice) p.set('maxPrice', state.maxPrice);
    if (state.sort !== 'newest') p.set('sort', state.sort);
    if (state.page > 1) p.set('page', String(state.page));
    return p;
  }

  function syncInputs() {
    $('search').value = state.search;
    $('minPrice').value = state.minPrice;
    $('maxPrice').value = state.maxPrice;
    $('sort').value = state.sort;
    document.querySelectorAll('#categories input').forEach((cb) => (cb.checked = state.categories.includes(cb.value)));
  }

  function priceProblem() {
    const { minPrice, maxPrice } = state;
    if (minPrice && !PRICE_RE.test(minPrice)) return 'Min price must be a positive number';
    if (maxPrice && !PRICE_RE.test(maxPrice)) return 'Max price must be a positive number';
    if (minPrice && maxPrice && Number(minPrice) > Number(maxPrice)) return 'Min price is higher than max price: no products can match';
    return '';
  }

  function showSkeleton() {
    $('grid').setAttribute('aria-busy', 'true');
    $('grid').replaceChildren(...Array.from({ length: 6 }, () => Object.assign(document.createElement('div'), { className: 'skeleton' })));
    $('empty').hidden = true;
  }

  async function load({ pushHistory = true } = {}) {
    const problem = priceProblem();
    $('price-error').textContent = problem;
    $('minPrice').classList.toggle('invalid', /Min|higher/.test(problem));
    $('maxPrice').classList.toggle('invalid', /Max|higher/.test(problem));
    renderChips();

    const params = toParams();
    if (pushHistory) history.replaceState(null, '', params.toString() ? `?${params}` : window.location.pathname);
    // Malformed number: don't send a request the server will reject.
    if (problem && !/higher/.test(problem)) return;

    if (controller) controller.abort(); // a newer query supersedes any in-flight one
    controller = new AbortController();
    showSkeleton();
    try {
      const res = await fetch(`/products?${params}`, { signal: controller.signal });
      const data = await res.json();
      if (!res.ok) throw new Error((data.error && data.error.message) || 'Request failed');
      render(data);
    } catch (err) {
      if (err.name === 'AbortError') return;
      $('grid').replaceChildren();
      toast(err.message, 'error');
    } finally {
      $('grid').setAttribute('aria-busy', 'false');
    }
  }

  function render(data) {
    const grid = $('grid');
    grid.replaceChildren(
      ...data.items.map((p) => {
        const card = document.createElement('article');
        card.className = 'product';
        const tile = Object.assign(document.createElement('div'), { className: `tile ${p.category}`, textContent: p.category });
        const h3 = Object.assign(document.createElement('h3'), { textContent: p.name });
        const desc = Object.assign(document.createElement('p'), { textContent: p.description });
        const price = Object.assign(document.createElement('div'), { className: 'price-tag', textContent: money.format(p.price) });
        card.append(tile, h3, desc, price);
        return card;
      }),
    );
    $('empty').hidden = data.items.length > 0;
    const from = data.totalItems === 0 ? 0 : (data.page - 1) * data.pageSize + 1;
    const to = Math.min(data.page * data.pageSize, data.totalItems);
    $('summary').textContent = data.items.length
      ? `Showing ${from}-${to} of ${data.totalItems} products`
      : `${data.totalItems} products found`;
    renderPager(data);
  }

  function renderPager({ page, totalPages }) {
    const pager = $('pager');
    pager.replaceChildren();
    if (totalPages <= 1) return;
    const add = (label, target, opts = {}) => {
      const b = Object.assign(document.createElement('button'), { type: 'button', textContent: label, disabled: Boolean(opts.disabled) });
      if (opts.current) b.setAttribute('aria-current', 'page');
      if (opts.aria) b.setAttribute('aria-label', opts.aria);
      b.addEventListener('click', () => goTo(target));
      pager.appendChild(b);
    };
    add('‹ Prev', page - 1, { disabled: page <= 1, aria: 'Previous page' });
    for (let i = 1; i <= totalPages; i++) add(String(i), i, { current: i === page });
    add('Next ›', page + 1, { disabled: page >= totalPages, aria: 'Next page' });
  }

  function goTo(page) {
    state.page = page; // filters untouched: pagination preserves them
    load();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function renderChips() {
    const chips = [];
    const chip = (label, onRemove) => {
      const span = Object.assign(document.createElement('span'), { className: 'chip', textContent: label });
      const x = Object.assign(document.createElement('button'), { type: 'button', textContent: '×' });
      x.setAttribute('aria-label', `Remove filter ${label}`);
      x.addEventListener('click', () => {
        onRemove();
        state.page = 1;
        syncInputs();
        load();
      });
      span.appendChild(x);
      chips.push(span);
    };
    if (state.search) chip(`“${state.search}”`, () => (state.search = ''));
    for (const c of state.categories) chip(c, () => (state.categories = state.categories.filter((x) => x !== c)));
    if (state.minPrice) chip(`≥ ${money.format(Number(state.minPrice) || 0)}`, () => (state.minPrice = ''));
    if (state.maxPrice) chip(`≤ ${money.format(Number(state.maxPrice) || 0)}`, () => (state.maxPrice = ''));
    if (state.sort !== 'newest') chip(`Sort: ${SORT_LABELS[state.sort]}`, () => (state.sort = 'newest'));
    if (chips.length > 1) {
      const clear = Object.assign(document.createElement('button'), { type: 'button', className: 'chip clear', textContent: 'Clear all' });
      clear.addEventListener('click', () => {
        Object.assign(state, { search: '', categories: [], minPrice: '', maxPrice: '', sort: 'newest', page: 1 });
        syncInputs();
        load();
      });
      chips.push(clear);
    }
    $('chips').replaceChildren(...chips);
  }

  function debounce(fn, ms) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  }

  // Keyword and price typing are debounced (300ms) so we don't fire a request per keystroke.
  const onTyped = debounce(() => {
    state.search = $('search').value.trim();
    state.minPrice = $('minPrice').value.trim();
    state.maxPrice = $('maxPrice').value.trim();
    state.page = 1;
    load();
  }, 300);
  ['search', 'minPrice', 'maxPrice'].forEach((id) => $(id).addEventListener('input', onTyped));

  $('sort').addEventListener('change', () => {
    state.sort = $('sort').value;
    state.page = 1;
    load();
  });

  async function init() {
    readUrl();
    const res = await fetch('/categories');
    const categories = await res.json();
    $('categories').replaceChildren(
      ...categories.map(({ name, count }) => {
        const label = document.createElement('label');
        const cb = Object.assign(document.createElement('input'), { type: 'checkbox', value: name });
        cb.addEventListener('change', () => {
          state.categories = [...document.querySelectorAll('#categories input:checked')].map((x) => x.value);
          state.page = 1;
          load();
        });
        label.append(cb, name, Object.assign(document.createElement('span'), { className: 'count', textContent: count }));
        return label;
      }),
    );
    syncInputs();
    load({ pushHistory: false });
  }

  init();
})();
