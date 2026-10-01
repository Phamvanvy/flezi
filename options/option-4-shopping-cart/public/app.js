'use strict';
(() => {
  const { api, toast, money, requireSession } = window.Flezi;
  const $ = (id) => document.getElementById(id);

  let cart = { items: [], subtotal: 0, grandTotal: 0, itemCount: 0 };
  // Per-line request coalescing: while a PUT is in flight we only remember the latest wanted
  // quantity and send it afterwards, so rapid clicks can't race or reorder.
  const inFlight = new Map(); // productId -> Promise
  const wanted = new Map(); // productId -> latest desired quantity

  const cents = (amount) => Math.round(amount * 100);

  /** Instant client-side preview (in cents); the server response then replaces it. */
  function preview() {
    let subtotal = 0;
    for (const item of cart.items) {
      item.lineTotal = (cents(item.unitPrice) * item.quantity) / 100;
      subtotal += cents(item.unitPrice) * item.quantity;
    }
    cart.subtotal = subtotal / 100;
    cart.grandTotal = subtotal / 100;
    cart.itemCount = cart.items.reduce((n, i) => n + i.quantity, 0);
  }

  function render() {
    const tbody = $('cart-lines');
    tbody.replaceChildren(...cart.items.map(renderLine));
    const empty = cart.items.length === 0;
    $('cart-table').hidden = empty;
    $('cart-empty').hidden = !empty;
    $('item-count').textContent = empty ? '' : `(${cart.itemCount} item${cart.itemCount === 1 ? '' : 's'})`;
    $('subtotal').textContent = money.format(cart.subtotal);
    $('grand-total').textContent = money.format(cart.grandTotal);
    $('checkout').disabled = empty;
    $('checkout-hint').hidden = !empty;
  }

  function td(content, cls) {
    const cell = document.createElement('td');
    if (cls) cell.className = cls;
    cell.append(content);
    return cell;
  }

  function renderLine(item) {
    const tr = document.createElement('tr');
    const stepper = document.createElement('div');
    stepper.className = 'stepper';
    const minus = Object.assign(document.createElement('button'), { type: 'button', textContent: '−' });
    minus.setAttribute('aria-label', `Decrease ${item.name}`);
    const out = Object.assign(document.createElement('output'), { textContent: String(item.quantity) });
    const plus = Object.assign(document.createElement('button'), { type: 'button', textContent: '+', disabled: item.quantity >= 99 });
    plus.setAttribute('aria-label', `Increase ${item.name}`);
    minus.addEventListener('click', () => setQuantity(item.productId, item.quantity - 1));
    plus.addEventListener('click', () => setQuantity(item.productId, item.quantity + 1));
    stepper.append(minus, out, plus);

    const remove = Object.assign(document.createElement('button'), { type: 'button', className: 'remove', textContent: 'Remove' });
    remove.addEventListener('click', () => removeLine(item.productId));

    tr.append(
      td(item.name),
      td(money.format(item.unitPrice), 'num'),
      td(stepper),
      td(money.format(item.lineTotal), 'num'),
      td(remove, 'num'),
    );
    return tr;
  }

  function applyServerCart(next) {
    // Keep showing any newer local intent for lines whose request hasn't been sent yet.
    cart = next;
    for (const [productId, qty] of wanted) {
      const line = cart.items.find((i) => i.productId === productId);
      if (line) line.quantity = qty;
    }
    if (wanted.size) preview();
    render();
  }

  function setQuantity(productId, quantity) {
    const line = cart.items.find((i) => i.productId === productId);
    if (!line) return;
    if (quantity <= 0) return removeLine(productId);
    line.quantity = Math.min(99, quantity);
    preview();
    render();
    wanted.set(productId, line.quantity);
    if (!inFlight.has(productId)) flush(productId);
  }

  async function flush(productId) {
    while (wanted.has(productId)) {
      const quantity = wanted.get(productId);
      wanted.delete(productId);
      const request = api('PUT', `/cart/items/${encodeURIComponent(productId)}`, { quantity });
      inFlight.set(productId, request);
      const res = await request;
      inFlight.delete(productId);
      if (res.ok) {
        applyServerCart(res.data);
      } else {
        wanted.delete(productId);
        toast((res.error && res.error.message) || 'Could not update quantity', 'error');
        await reload();
        return;
      }
    }
  }

  async function removeLine(productId) {
    wanted.delete(productId);
    const before = cart;
    cart = { ...cart, items: cart.items.filter((i) => i.productId !== productId) };
    preview();
    render();
    await inFlight.get(productId); // let a pending quantity update land first
    const res = await api('DELETE', `/cart/items/${encodeURIComponent(productId)}`);
    if (!res.ok && res.status !== 404) {
      cart = before;
      render();
      toast((res.error && res.error.message) || 'Could not remove item', 'error');
      return;
    }
    toast('Item removed');
    await reload();
  }

  async function addToCart(productId, button) {
    button.disabled = true;
    const res = await api('POST', '/cart/items', { productId, quantity: 1 });
    button.disabled = false;
    if (!res.ok) {
      toast((res.error && (res.error.fields ? Object.values(res.error.fields)[0] : res.error.message)) || 'Could not add item', 'error');
      return;
    }
    applyServerCart(res.data);
    toast(res.status === 201 ? 'Added to cart' : 'Quantity updated');
  }

  async function reload() {
    const res = await api('GET', '/cart');
    if (res.ok) applyServerCart(res.data);
  }

  async function loadProducts() {
    const res = await api('GET', '/products');
    if (!res.ok) return;
    $('products').replaceChildren(
      ...res.data.map((p) => {
        const li = document.createElement('li');
        const name = Object.assign(document.createElement('span'), { className: 'name', textContent: p.name });
        const price = Object.assign(document.createElement('span'), { className: 'price', textContent: money.format(p.price) });
        const btn = Object.assign(document.createElement('button'), { type: 'button', textContent: 'Add to cart' });
        btn.addEventListener('click', () => addToCart(p.id, btn));
        li.append(name, price, btn);
        return li;
      }),
    );
  }

  $('browse').addEventListener('click', () => {
    const list = $('products');
    list.scrollIntoView({ behavior: 'smooth' });
    list.classList.remove('flash');
    void list.offsetWidth;
    list.classList.add('flash');
    const first = list.querySelector('button');
    if (first) first.focus();
  });

  $('checkout').addEventListener('click', async () => {
    const button = $('checkout');
    button.disabled = true;
    const res = await api('POST', '/cart/checkout');
    if (!res.ok) {
      button.disabled = false;
      toast((res.error && res.error.message) || 'Checkout failed', 'error');
      return;
    }
    toast(`Order placed: ${money.format(res.data.grandTotal)}`);
    await reload();
  });

  requireSession(async () => {
    await loadProducts();
    await reload();
  });
})();
