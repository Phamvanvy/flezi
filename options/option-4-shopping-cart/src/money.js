'use strict';
// All money math happens in integer cents. Conversion to a decimal number happens only at
// the API boundary, so 0.1 + 0.2 style float errors can never accumulate in totals.

/** cents (integer) -> number with exactly 2 decimals, e.g. 2997 -> 29.97 */
const toAmount = (cents) => Math.round(cents) / 100;

/** unit price × quantity, both integers -> integer cents */
const lineTotalCents = (unitPriceCents, quantity) => unitPriceCents * quantity;

const sumCents = (values) => values.reduce((acc, v) => acc + v, 0);

module.exports = { toAmount, lineTotalCents, sumCents };
