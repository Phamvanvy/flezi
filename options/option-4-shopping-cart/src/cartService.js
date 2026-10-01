'use strict';
const crypto = require('node:crypto');
const { badRequest, notFound } = require('./lib/http');
const { MAX_QUANTITY } = require('./db');
const { toAmount, lineTotalCents, sumCents } = require('./money');

/** Quantities must be integers; JSON numbers like 1.5 or strings like "2" are rejected. */
function quantityError(q, { allowZero }) {
  if (q === undefined || q === null) return 'Quantity is required';
  if (typeof q !== 'number' || !Number.isInteger(q)) return 'Quantity must be a whole number';
  if (q < 0 || (!allowZero && q === 0)) return 'Quantity must be a positive whole number';
  if (q > MAX_QUANTITY) return `Quantity must be at most ${MAX_QUANTITY}`;
  return null;
}

function createCartService({ db, now = () => new Date().toISOString() }) {
  const findCart = db.prepare('SELECT * FROM carts WHERE owner_id = ?');
  const insertCart = db.prepare('INSERT INTO carts (id, owner_id, updated_at) VALUES (?, ?, ?) ON CONFLICT(owner_id) DO NOTHING');
  const touchCart = db.prepare('UPDATE carts SET updated_at = ? WHERE id = ?');
  const findProduct = db.prepare('SELECT * FROM products WHERE id = ?');
  const listProducts = db.prepare('SELECT * FROM products ORDER BY name');
  const findLine = db.prepare('SELECT * FROM cart_items WHERE cart_id = ? AND product_id = ?');
  const lines = db.prepare(`
    SELECT ci.product_id, ci.quantity, ci.unit_price_cents, p.name
    FROM cart_items ci JOIN products p ON p.id = ci.product_id
    WHERE ci.cart_id = ? ORDER BY ci.added_at, ci.product_id`);
  // Atomic merge: a second add of the same product increments instead of inserting a duplicate.
  // The original unit-price snapshot is kept on merge (documented "snapshot" behaviour).
  const upsertLine = db.prepare(`
    INSERT INTO cart_items (cart_id, product_id, quantity, unit_price_cents, added_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(cart_id, product_id) DO UPDATE SET quantity = quantity + excluded.quantity`);
  const setQuantity = db.prepare('UPDATE cart_items SET quantity = ? WHERE cart_id = ? AND product_id = ?');
  const deleteLine = db.prepare('DELETE FROM cart_items WHERE cart_id = ? AND product_id = ?');
  const clearLines = db.prepare('DELETE FROM cart_items WHERE cart_id = ?');

  function cartFor(ownerId) {
    insertCart.run(crypto.randomUUID(), ownerId, now());
    return findCart.get(ownerId);
  }

  /** Server-side totals are the source of truth; the UI only previews them. */
  function view(cartId) {
    const items = lines.all(cartId).map((r) => ({
      productId: r.product_id,
      name: r.name,
      unitPrice: toAmount(r.unit_price_cents),
      quantity: r.quantity,
      lineTotal: toAmount(lineTotalCents(r.unit_price_cents, r.quantity)),
      _lineCents: lineTotalCents(r.unit_price_cents, r.quantity),
    }));
    const subtotalCents = sumCents(items.map((i) => i._lineCents));
    for (const i of items) delete i._lineCents;
    return {
      items,
      itemCount: items.reduce((n, i) => n + i.quantity, 0),
      subtotal: toAmount(subtotalCents),
      grandTotal: toAmount(subtotalCents), // no tax/shipping in scope: grand total = subtotal
      currency: 'USD',
    };
  }

  function getCart(ownerId) {
    return view(cartFor(ownerId).id);
  }

  function addItem(ownerId, body) {
    const quantity = body.quantity === undefined ? 1 : body.quantity;
    const fields = {};
    if (typeof body.productId !== 'string' || !body.productId) fields.productId = 'productId is required';
    const qErr = quantityError(quantity, { allowZero: false });
    if (qErr) fields.quantity = qErr;
    if (Object.keys(fields).length) throw badRequest('Invalid input', fields);

    const product = findProduct.get(body.productId);
    if (!product) throw badRequest('Invalid input', { productId: 'Unknown product' });

    const cart = cartFor(ownerId);
    const existing = findLine.get(cart.id, product.id);
    if (existing && existing.quantity + quantity > MAX_QUANTITY) {
      throw badRequest('Invalid input', { quantity: `Quantity must be at most ${MAX_QUANTITY}` });
    }
    upsertLine.run(cart.id, product.id, quantity, product.price_cents, now());
    touchCart.run(now(), cart.id);
    return { created: !existing, cart: view(cart.id) };
  }

  /** Absolute quantity (idempotent). 0 removes the line; negatives / fractions are rejected. */
  function updateQuantity(ownerId, productId, body) {
    const qErr = quantityError(body.quantity, { allowZero: true });
    if (qErr) throw badRequest('Invalid input', { quantity: qErr });
    const cart = cartFor(ownerId);
    if (!findLine.get(cart.id, productId)) throw notFound('Item not in cart');
    if (body.quantity === 0) deleteLine.run(cart.id, productId);
    else setQuantity.run(body.quantity, cart.id, productId);
    touchCart.run(now(), cart.id);
    return view(cart.id);
  }

  function removeItem(ownerId, productId) {
    const cart = cartFor(ownerId);
    const { changes } = deleteLine.run(cart.id, productId);
    if (changes === 0) throw notFound('Item not in cart');
    touchCart.run(now(), cart.id);
  }

  function checkout(ownerId) {
    const cart = cartFor(ownerId);
    const summary = view(cart.id);
    if (summary.items.length === 0) throw badRequest('Cart is empty');
    clearLines.run(cart.id);
    return { orderId: crypto.randomUUID(), ...summary, placedAt: now() };
  }

  function products() {
    return listProducts.all().map((p) => ({ id: p.id, name: p.name, price: toAmount(p.price_cents) }));
  }

  return { getCart, addItem, updateQuantity, removeItem, checkout, products };
}

module.exports = { createCartService };
