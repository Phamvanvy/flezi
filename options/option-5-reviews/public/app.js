'use strict';
(() => {
  const { api, toast, requireSession, relativeTime } = window.Flezi;
  const $ = (id) => document.getElementById(id);

  let items = [];
  let currentId = null;
  let myReview = null;
  let me = null;
  let submitting = false;

  function stars(rating) {
    const wrap = document.createElement('span');
    wrap.className = 'stars-static';
    wrap.setAttribute('aria-label', `${rating} out of 5 stars`);
    const full = Math.round(rating);
    for (let i = 1; i <= 5; i++) {
      wrap.append(Object.assign(document.createElement('span'), { textContent: '★', className: i <= full ? '' : 'off' }));
    }
    return wrap;
  }

  function buildStarInput() {
    const fs = $('star-input');
    // Rendered 5..1 with row-reverse so the CSS sibling selector can light up lower stars.
    for (let v = 5; v >= 1; v--) {
      const input = Object.assign(document.createElement('input'), { type: 'radio', name: 'rating', id: `star-${v}`, value: String(v) });
      const label = Object.assign(document.createElement('label'), { htmlFor: `star-${v}`, textContent: '★', title: `${v} star${v > 1 ? 's' : ''}` });
      label.setAttribute('aria-label', `${v} star${v > 1 ? 's' : ''}`);
      input.addEventListener('change', () => ($('rating-error').textContent = ''));
      fs.append(input, label);
    }
  }

  const selectedRating = () => {
    const checked = document.querySelector('input[name="rating"]:checked');
    return checked ? Number(checked.value) : null;
  };

  function prefill() {
    document.querySelectorAll('input[name="rating"]').forEach((r) => (r.checked = myReview && Number(r.value) === myReview.rating));
    $('comment').value = myReview ? myReview.comment : '';
    $('count').textContent = String($('comment').value.length);
    $('form-title').textContent = myReview ? 'Edit your review' : 'Write a review';
    $('submit-label').textContent = myReview ? 'Update review' : 'Submit review';
    $('rating-error').textContent = '';
  }

  function renderItems() {
    $('items').replaceChildren(
      ...items.map((item) => {
        const b = Object.assign(document.createElement('button'), { type: 'button', textContent: item.name });
        b.setAttribute('aria-current', String(item.id === currentId));
        b.addEventListener('click', () => select(item.id));
        return b;
      }),
    );
  }

  function renderSummary(data) {
    $('avg-number').textContent = data.averageRating.toFixed(1);
    $('avg-stars').replaceChildren(...stars(data.averageRating).childNodes);
    $('avg-count').textContent = `${data.reviewCount} review${data.reviewCount === 1 ? '' : 's'}`;
  }

  function renderReviews(list) {
    $('empty').hidden = list.length > 0;
    $('reviews').replaceChildren(
      ...list.map((r) => {
        const li = document.createElement('li');
        const isMine = me && r.userId === me.id;
        if (isMine) li.className = 'mine';
        const head = document.createElement('div');
        head.className = 'head';
        head.append(Object.assign(document.createElement('span'), { className: 'author', textContent: r.author }), stars(r.rating));
        if (isMine) head.append(Object.assign(document.createElement('span'), { className: 'tag', textContent: 'You' }));
        const time = Object.assign(document.createElement('time'), {
          className: 'time',
          dateTime: r.createdAt,
          textContent: relativeTime(r.createdAt) + (r.edited ? ' · edited' : ''),
          title: new Date(r.createdAt).toLocaleString(),
        });
        head.append(time);
        li.append(head);
        if (r.comment) li.append(Object.assign(document.createElement('p'), { className: 'text', textContent: r.comment }));
        return li;
      }),
    );
  }

  async function load() {
    const res = await api('GET', `/items/${encodeURIComponent(currentId)}/reviews`);
    if (!res.ok) return toast((res.error && res.error.message) || 'Could not load reviews', 'error');
    myReview = res.data.myReview;
    renderSummary(res.data);
    renderReviews(res.data.reviews);
    prefill();
  }

  function select(id) {
    currentId = id;
    const item = items.find((i) => i.id === id);
    $('item-name').textContent = item.name;
    $('item-desc').textContent = item.description;
    renderItems();
    load();
  }

  function setBusy(busy) {
    submitting = busy;
    $('submit').disabled = busy;
    $('spinner').hidden = !busy;
  }

  $('comment').addEventListener('input', () => ($('count').textContent = String($('comment').value.length)));

  $('review-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (submitting) return; // duplicate-submission guard
    const rating = selectedRating();
    if (!rating) {
      $('rating-error').textContent = 'Please choose a rating from 1 to 5 stars';
      return;
    }
    const body = { rating, comment: $('comment').value };
    setBusy(true);
    // Existing review -> PUT /reviews/:id (author-only edit); otherwise create via POST.
    const res = myReview
      ? await api('PUT', `/reviews/${encodeURIComponent(myReview.id)}`, body)
      : await api('POST', `/items/${encodeURIComponent(currentId)}/reviews`, body);
    setBusy(false);
    if (!res.ok) {
      const fields = (res.error && res.error.fields) || {};
      if (fields.rating) $('rating-error').textContent = fields.rating;
      toast(fields.comment || (res.error && res.error.message) || 'Could not save review', 'error');
      return;
    }
    toast(myReview ? 'Review updated' : 'Thanks for your review!');
    await load();
  });

  buildStarInput();
  requireSession(async (user) => {
    me = user;
    const res = await api('GET', '/items');
    items = res.data || [];
    if (items.length) select(items[0].id);
  });
})();
