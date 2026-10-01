'use strict';
(() => {
  const { api, toast, requireSession } = window.Flezi;
  const $ = (id) => document.getElementById(id);

  let tasks = [];
  let filter = 'all';
  let editingId = null;
  const pending = new Set(); // task ids with a request in flight (double-click guard)

  const visible = () => (filter === 'all' ? tasks : tasks.filter((t) => t.status === filter));

  function render() {
    const list = $('tasks');
    list.replaceChildren();
    const items = visible();
    $('empty').hidden = items.length > 0;
    for (const task of items) list.appendChild(renderTask(task));
  }

  function el(tag, props = {}, children = []) {
    const node = Object.assign(document.createElement(tag), props);
    for (const child of [].concat(children)) node.append(child);
    return node;
  }

  function renderTask(task) {
    const li = el('li', { className: `task ${task.status}${pending.has(task.id) ? ' pending' : ''}` });
    li.dataset.id = task.id;

    const check = el('input', { type: 'checkbox', checked: task.status === 'done', title: 'Toggle done' });
    check.setAttribute('aria-label', `Mark "${task.title}" as ${task.status === 'done' ? 'open' : 'done'}`);
    check.disabled = pending.has(task.id);
    check.addEventListener('click', (e) => {
      e.preventDefault(); // state is driven by render(), not the native checkbox
      toggle(task);
    });

    let body;
    if (editingId === task.id) {
      const title = el('input', { value: task.title, maxLength: 200 });
      const desc = el('input', { value: task.description, maxLength: 2000, placeholder: 'Description' });
      const onKey = (e) => {
        if (e.key === 'Enter') save(task, title.value, desc.value);
        if (e.key === 'Escape') cancelEdit();
      };
      title.addEventListener('keydown', onKey);
      desc.addEventListener('keydown', onKey);
      body = el('div', { className: 'edit-fields' }, [title, desc]);
      setTimeout(() => title.focus(), 0);
      const actions = el('div', { className: 'actions' }, [
        button('Save', '', () => save(task, title.value, desc.value)),
        button('Cancel', 'secondary', cancelEdit),
      ]);
      li.append(check, body, actions);
      return li;
    }

    const title = el('div', { className: 'title' }, [task.title, el('span', { className: `badge ${task.status}`, textContent: task.status })]);
    title.addEventListener('dblclick', () => startEdit(task.id));
    body = el('div', {}, [title]);
    if (task.description) body.append(el('div', { className: 'desc', textContent: task.description }));
    body.append(el('div', { className: 'meta', textContent: `Updated ${new Date(task.updatedAt).toLocaleString()}` }));

    const actions = el('div', { className: 'actions' }, [
      button('Edit', 'secondary', () => startEdit(task.id)),
      button('Delete', 'danger', () => remove(task)),
    ]);
    li.append(check, body, actions);
    return li;
  }

  function button(label, cls, onClick) {
    const b = el('button', { type: 'button', textContent: label, className: cls });
    b.addEventListener('click', onClick);
    return b;
  }

  function startEdit(id) {
    editingId = id;
    render();
  }

  function cancelEdit() {
    editingId = null;
    render();
  }

  function replaceTask(updated) {
    tasks = tasks.map((t) => (t.id === updated.id ? updated : t));
  }

  function dropTask(id) {
    tasks = tasks.filter((t) => t.id !== id);
  }

  /** Server says the task is gone (deleted in another tab / not ours): drop it locally. */
  function handleGone(id) {
    dropTask(id);
    toast('That task no longer exists (it may have been deleted elsewhere).', 'error');
  }

  async function toggle(task) {
    if (pending.has(task.id)) return; // rapid double-click: ignore while a request is in flight
    const before = { ...task };
    const next = task.status === 'done' ? 'open' : 'done';
    pending.add(task.id);
    replaceTask({ ...task, status: next }); // optimistic
    render();
    // Explicit target status (not "flip") keeps the request idempotent if it is ever retried.
    const res = await api('PUT', `/tasks/${task.id}`, { status: next });
    pending.delete(task.id);
    if (res.ok) {
      replaceTask(res.data);
      toast(next === 'done' ? 'Task completed' : 'Task reopened');
    } else if (res.status === 404) {
      handleGone(task.id);
    } else {
      replaceTask(before); // rollback
      toast(res.error.message || 'Could not update task', 'error');
    }
    render();
  }

  async function save(task, title, description) {
    if (!title.trim()) {
      toast('Title must not be empty', 'error');
      return;
    }
    const before = { ...task };
    editingId = null;
    pending.add(task.id);
    replaceTask({ ...task, title: title.trim(), description: description.trim() });
    render();
    const res = await api('PUT', `/tasks/${task.id}`, { title, description });
    pending.delete(task.id);
    if (res.ok) {
      replaceTask(res.data);
      toast('Task saved');
    } else if (res.status === 404) {
      handleGone(task.id);
    } else {
      replaceTask(before);
      toast(res.error.message || 'Could not save task', 'error');
    }
    render();
  }

  async function remove(task) {
    if (pending.has(task.id)) return;
    const index = tasks.findIndex((t) => t.id === task.id);
    pending.add(task.id);
    dropTask(task.id); // optimistic
    render();
    const res = await api('DELETE', `/tasks/${task.id}`);
    pending.delete(task.id);
    if (res.ok) {
      toast('Task deleted');
    } else if (res.status === 404) {
      toast('Task was already deleted');
    } else {
      tasks.splice(index, 0, task); // rollback to its original position
      toast(res.error.message || 'Could not delete task', 'error');
    }
    render();
  }

  async function load() {
    // The server applies the filter (?status=), so the API path is exercised end to end.
    const query = filter === 'all' ? '' : `?status=${filter}`;
    const res = await api('GET', `/tasks${query}`);
    if (!res.ok) return toast(res.error.message || 'Could not load tasks', 'error');
    tasks = res.data;
    render();
  }

  $('add-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const titleInput = $('new-title');
    const descInput = $('new-desc');
    const addBtn = $('add-btn');
    if (!titleInput.value.trim()) {
      $('add-error').textContent = 'Title must not be empty';
      titleInput.classList.add('invalid');
      return;
    }
    $('add-error').textContent = '';
    titleInput.classList.remove('invalid');
    addBtn.disabled = true;
    const res = await api('POST', '/tasks', { title: titleInput.value, description: descInput.value });
    addBtn.disabled = false;
    if (!res.ok) {
      $('add-error').textContent = (res.error.fields && res.error.fields.title) || res.error.message;
      return;
    }
    titleInput.value = '';
    descInput.value = '';
    if (filter !== 'done') tasks.unshift(res.data);
    render();
    toast('Task added');
  });

  $('new-title').addEventListener('input', () => {
    $('add-error').textContent = '';
    $('new-title').classList.remove('invalid');
  });

  document.querySelectorAll('.tabs button').forEach((tab) => {
    tab.addEventListener('click', () => {
      filter = tab.dataset.filter;
      document.querySelectorAll('.tabs button').forEach((t) => t.setAttribute('aria-selected', String(t === tab)));
      load();
    });
  });

  requireSession(() => load());
})();
