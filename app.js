(() => {
  const app = document.getElementById('app');
  const toastEl = document.getElementById('toast');
  const dlg = document.getElementById('adjust-dialog');
  const adjustForm = document.getElementById('adjust-form');
  const adjustError = document.getElementById('adjust-error');

  let session = null; // { user, organization }

  /* ---------- helpers ---------- */

  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (v) => (v === null || v === undefined ? '—' : Number(v).toFixed(2));
  const val = (v) => (v === null || v === undefined ? '' : esc(v));

  function toast(message) {
    toastEl.textContent = message;
    toastEl.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => (toastEl.hidden = true), 2600);
  }

  async function api(path, { method = 'GET', body } = {}) {
    const res = await fetch('/api' + path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    });
    let data = null;
    try { data = await res.json(); } catch { /* empty body */ }
    if (!res.ok) {
      const err = new Error((data && data.error) || 'Request failed.');
      err.status = res.status;
      throw err;
    }
    return data;
  }

  function navigate(path) {
    if (location.hash === '#' + path) route();
    else location.hash = '#' + path;
  }

  // Wires up a form: collects values, disables the submit button, shows errors.
  function bindForm(id, handler) {
    const form = document.getElementById(id);
    const err = form.querySelector('.error');
    const btn = form.querySelector('button[type="submit"]');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      err.hidden = true;
      btn.disabled = true;
      try {
        await handler(Object.fromEntries(new FormData(form)));
      } catch (ex) {
        err.textContent = ex.message;
        err.hidden = false;
        btn.disabled = false;
      }
    });
  }

  /* ---------- layout ---------- */

  function shell(active, inner) {
    const link = (path, label) =>
      `<a href="#${path}" class="${active === path ? 'active' : ''}">${label}</a>`;
    app.innerHTML = `
      <header class="topbar">
        <div class="topbar-inner">
          <span class="brand">StockFlow</span>
          <nav class="nav-links">
            ${link('/', 'Dashboard')}
            ${link('/products', 'Products')}
            ${link('/settings', 'Settings')}
          </nav>
          <div class="who"><strong>${esc(session.organization.name)}</strong>${esc(session.user.email)}</div>
          <button class="btn small" id="logout">Log out</button>
        </div>
      </header>
      <main>${inner}</main>`;
    document.getElementById('logout').addEventListener('click', async () => {
      try { await api('/logout', { method: 'POST' }); } catch { /* ignore */ }
      session = null;
      navigate('/login');
    });
  }

  /* ---------- router ---------- */

  async function route() {
    const path = location.hash.slice(1) || '/';
    if (!session) {
      try { session = await api('/me'); } catch { session = null; }
    }
    const isPublic = path === '/login' || path === '/signup';
    if (!session && !isPublic) return navigate('/login');
    if (session && isPublic) return navigate('/');

    if (path === '/login') return viewLogin();
    if (path === '/signup') return viewSignup();
    if (path === '/') return viewDashboard();
    if (path === '/products') return viewProducts();
    if (path === '/products/new') return viewProductForm(null);
    const m = path.match(/^\/products\/(\d+)$/);
    if (m) return viewProductForm(Number(m[1]));
    if (path === '/settings') return viewSettings();
    navigate('/');
  }

  window.addEventListener('hashchange', route);

  /* ---------- auth views ---------- */

  function viewLogin() {
    app.innerHTML = `
      <div class="auth">
        <h1>StockFlow</h1>
        <p class="muted">Log in to manage your inventory.</p>
        <div class="card">
          <form id="login-form">
            <p class="error" hidden></p>
            <label>Email<input type="email" name="email" autocomplete="email" required /></label>
            <label>Password<input type="password" name="password" autocomplete="current-password" required /></label>
            <button type="submit" class="btn primary" style="width:100%">Log in</button>
          </form>
        </div>
        <p class="switch">New here? <a href="#/signup">Create an account</a></p>
      </div>`;
    app.querySelector('input').focus();
    bindForm('login-form', async (data) => {
      await api('/login', { method: 'POST', body: data });
      session = null;
      navigate('/');
    });
  }

  function viewSignup() {
    app.innerHTML = `
      <div class="auth">
        <h1>Create your account</h1>
        <p class="muted">Set up your organization and start tracking stock.</p>
        <div class="card">
          <form id="signup-form">
            <p class="error" hidden></p>
            <label>Organization name<input type="text" name="organizationName" placeholder="My Test Store" maxlength="120" required /></label>
            <label>Email<input type="email" name="email" autocomplete="email" required /></label>
            <label>Password<input type="password" name="password" autocomplete="new-password" minlength="8" required />
              <span class="hint">At least 8 characters.</span></label>
            <label>Confirm password<input type="password" name="confirm" autocomplete="new-password" required /></label>
            <button type="submit" class="btn primary" style="width:100%">Create account</button>
          </form>
        </div>
        <p class="switch">Already have an account? <a href="#/login">Log in</a></p>
      </div>`;
    app.querySelector('input').focus();
    bindForm('signup-form', async (data) => {
      if (data.password !== data.confirm) throw new Error('Passwords do not match.');
      await api('/signup', {
        method: 'POST',
        body: { organizationName: data.organizationName, email: data.email, password: data.password },
      });
      session = null;
      navigate('/');
    });
  }

  /* ---------- dashboard ---------- */

  async function viewDashboard() {
    shell('/', `
      <div class="page-head">
        <h1>Dashboard</h1>
        <a class="btn primary" href="#/products/new">Add product</a>
      </div>
      <div id="content" class="muted">Loading…</div>`);
    const box = document.getElementById('content');
    try {
      const d = await api('/dashboard');
      const lowRows = d.low_stock
        .map(
          (p) => `<tr>
            <td><a href="#/products/${p.id}">${esc(p.name)}</a></td>
            <td>${esc(p.sku)}</td>
            <td class="num">${p.quantity}</td>
            <td class="num">${p.threshold}</td>
          </tr>`
        )
        .join('');
      let lowSection;
      if (d.total_products === 0) {
        lowSection = `<div class="empty">No products yet. <a href="#/products/new">Add your first product</a> to start tracking stock.</div>`;
      } else if (d.low_stock.length === 0) {
        lowSection = `<div class="empty">Nothing is running low. Every product is above its threshold.</div>`;
      } else {
        lowSection = `<div class="table-wrap"><table>
          <thead><tr><th>Name</th><th>SKU</th><th class="num">Quantity on hand</th><th class="num">Low stock threshold</th></tr></thead>
          <tbody>${lowRows}</tbody></table></div>`;
      }
      box.className = '';
      box.innerHTML = `
        <div class="stats">
          <div class="card stat"><div class="num">${d.total_products}</div><div class="label">Total products</div></div>
          <div class="card stat"><div class="num">${d.total_quantity}</div><div class="label">Units on hand</div></div>
          <div class="card stat ${d.low_stock.length ? 'warn' : ''}"><div class="num">${d.low_stock.length}</div><div class="label">Low stock items</div></div>
        </div>
        <div class="card">
          <h2>Low stock items</h2>
          ${lowSection}
        </div>`;
    } catch (ex) {
      box.className = 'error';
      box.textContent = ex.message;
    }
  }

  /* ---------- products list ---------- */

  async function viewProducts() {
    shell('/products', `
      <div class="page-head">
        <h1>Products</h1>
        <div class="row">
          <input class="search" id="q" type="search" placeholder="Search by name or SKU" style="margin:0" />
          <a class="btn primary" href="#/products/new">Add product</a>
        </div>
      </div>
      <div class="card table-wrap">
        <table>
          <thead><tr>
            <th>Name</th><th>SKU</th><th class="num">Quantity</th><th>Stock</th><th class="num">Selling price</th><th></th>
          </tr></thead>
          <tbody id="rows"><tr><td colspan="6" class="empty">Loading…</td></tr></tbody>
        </table>
      </div>`);

    const tbody = document.getElementById('rows');
    const search = document.getElementById('q');
    let products = [];

    async function load() {
      const q = search.value.trim();
      try {
        products = (await api('/products?q=' + encodeURIComponent(q))).products;
      } catch (ex) {
        tbody.innerHTML = `<tr><td colspan="6" class="empty">${esc(ex.message)}</td></tr>`;
        return;
      }
      if (!products.length) {
        tbody.innerHTML = q
          ? `<tr><td colspan="6" class="empty">No products match “${esc(q)}”.</td></tr>`
          : `<tr><td colspan="6" class="empty">No products yet. <a href="#/products/new">Add your first product</a>.</td></tr>`;
        return;
      }
      tbody.innerHTML = products
        .map(
          (p) => `<tr>
            <td><a href="#/products/${p.id}">${esc(p.name)}</a></td>
            <td>${esc(p.sku)}</td>
            <td class="num">${p.quantity}</td>
            <td>${p.is_low ? '<span class="badge low">Low stock</span>' : '<span class="badge ok">In stock</span>'}</td>
            <td class="num">${money(p.selling_price)}</td>
            <td class="actions">
              <button class="btn small" data-adjust="${p.id}">Adjust stock</button>
              <a class="btn small" href="#/products/${p.id}">Edit</a>
              <button class="btn small danger" data-delete="${p.id}">Delete</button>
            </td>
          </tr>`
        )
        .join('');
    }

    let timer;
    search.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(load, 200);
    });

    tbody.addEventListener('click', async (e) => {
      const adjustBtn = e.target.closest('[data-adjust]');
      const deleteBtn = e.target.closest('[data-delete]');
      if (adjustBtn) {
        const p = products.find((x) => x.id === Number(adjustBtn.dataset.adjust));
        if (p) openAdjust(p, load);
      }
      if (deleteBtn) {
        const p = products.find((x) => x.id === Number(deleteBtn.dataset.delete));
        if (!p) return;
        if (!confirm(`Delete “${p.name}” (SKU ${p.sku})? This cannot be undone.`)) return;
        try {
          await api('/products/' + p.id, { method: 'DELETE' });
          toast('Product deleted');
          load();
        } catch (ex) {
          toast(ex.message);
        }
      }
    });

    load();
  }

  /* ---------- adjust stock dialog ---------- */

  let adjustCtx = null;

  function openAdjust(product, onDone) {
    adjustCtx = { product, onDone };
    document.getElementById('adjust-title').textContent = `Adjust stock: ${product.name}`;
    document.getElementById('adjust-current').textContent = `Currently ${product.quantity} units on hand.`;
    adjustForm.reset();
    adjustError.hidden = true;
    dlg.showModal();
    document.getElementById('adjust-delta').focus();
  }

  document.getElementById('adjust-cancel').addEventListener('click', () => dlg.close());

  adjustForm.addEventListener('submit', async (e) => {
    e.preventDefault(); // keep the dialog open until the request succeeds
    if (!adjustCtx) return;
    adjustError.hidden = true;
    try {
      await api(`/products/${adjustCtx.product.id}/adjust`, {
        method: 'POST',
        body: {
          delta: document.getElementById('adjust-delta').value,
          note: document.getElementById('adjust-note').value,
        },
      });
      dlg.close();
      toast('Stock updated');
      adjustCtx.onDone();
    } catch (ex) {
      adjustError.textContent = ex.message;
      adjustError.hidden = false;
    }
  });

  /* ---------- product form (create / edit) ---------- */

  async function viewProductForm(id) {
    const isEdit = id !== null;
    shell('/products', `<div id="content" class="muted">Loading…</div>`);
    const box = document.getElementById('content');

    let p = { name: '', sku: '', description: '', quantity: 0, cost_price: null, selling_price: null, low_stock_threshold: null };
    if (isEdit) {
      try {
        p = (await api('/products/' + id)).product;
      } catch (ex) {
        box.className = 'error';
        box.innerHTML = `${esc(ex.message)} <a href="#/products">Back to products</a>`;
        return;
      }
    }

    box.className = '';
    box.innerHTML = `
      <div class="page-head">
        <h1>${isEdit ? 'Edit product' : 'Add product'}</h1>
        <a class="btn" href="#/products">Back to products</a>
      </div>
      <div class="card" style="max-width:720px">
        <form id="product-form">
          <p class="error" hidden></p>
          <div class="grid2">
            <label>Name<input type="text" name="name" maxlength="200" value="${val(p.name)}" required /></label>
            <label>SKU<input type="text" name="sku" maxlength="100" value="${val(p.sku)}" required />
              <span class="hint">Must be unique in your organization.</span></label>
          </div>
          <label>Description<textarea name="description">${val(p.description)}</textarea></label>
          <div class="grid2">
            <label>Quantity on hand<input type="number" name="quantity" min="0" step="1" value="${val(p.quantity)}" required /></label>
            <label>Low stock threshold<input type="number" name="low_stock_threshold" min="0" step="1" value="${val(p.low_stock_threshold)}" />
              <span class="hint">Leave blank to use the default from Settings.</span></label>
            <label>Cost price<input type="number" name="cost_price" min="0" step="0.01" value="${val(p.cost_price)}" /></label>
            <label>Selling price<input type="number" name="selling_price" min="0" step="0.01" value="${val(p.selling_price)}" /></label>
          </div>
          ${isEdit ? `<p class="muted">Last updated ${esc(p.updated_at)} UTC${p.last_note ? ` · Last stock note: ${esc(p.last_note)}` : ''}</p>` : ''}
          <div class="row end">
            <a class="btn ghost" href="#/products">Cancel</a>
            <button type="submit" class="btn primary">${isEdit ? 'Save changes' : 'Add product'}</button>
          </div>
        </form>
      </div>`;

    bindForm('product-form', async (data) => {
      if (isEdit) {
        await api('/products/' + id, { method: 'PUT', body: data });
        toast('Changes saved');
      } else {
        await api('/products', { method: 'POST', body: data });
        toast('Product added');
      }
      navigate('/products');
    });
  }

  /* ---------- settings ---------- */

  async function viewSettings() {
    shell('/settings', `
      <div class="page-head"><h1>Settings</h1></div>
      <div id="content" class="muted">Loading…</div>`);
    const box = document.getElementById('content');
    try {
      const s = await api('/settings');
      box.className = '';
      box.innerHTML = `
        <div class="card" style="max-width:480px">
          <form id="settings-form">
            <p class="error" hidden></p>
            <label>Default low stock threshold
              <input type="number" name="default_low_stock_threshold" min="0" step="1" value="${val(s.default_low_stock_threshold)}" required />
              <span class="hint">Used for products that don't have their own threshold. A product is low on stock when its quantity is at or below this number.</span>
            </label>
            <button type="submit" class="btn primary">Save settings</button>
          </form>
        </div>`;
      bindForm('settings-form', async (data) => {
        await api('/settings', { method: 'PUT', body: data });
        toast('Settings saved');
        document.querySelector('#settings-form button[type="submit"]').disabled = false;
      });
    } catch (ex) {
      box.className = 'error';
      box.textContent = ex.message;
    }
  }

  route();
})();
