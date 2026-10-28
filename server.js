const express = require('express');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const db = require('./db');

const PORT = process.env.PORT || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';
const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-secret-change-me';
if (IS_PROD && !process.env.JWT_SECRET) {
  console.error('JWT_SECRET must be set in production.');
  process.exit(1);
}
const COOKIE_NAME = 'stockflow_token';
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

const app = express();
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));


function setAuthCookie(res, userId) {
  const token = jwt.sign({ uid: userId }, JWT_SECRET, { expiresIn: '7d' });
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: IS_PROD,
    maxAge: SEVEN_DAYS_MS,
  });
}


function auth(req, res, next) {
  const token = req.cookies[COOKIE_NAME];
  if (!token) return res.status(401).json({ error: 'Please log in.' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = db
      .prepare('SELECT id, email, organization_id FROM users WHERE id = ?')
      .get(payload.uid);
    if (!user) throw new Error('no user');
    req.user = { id: user.id, email: user.email, orgId: user.organization_id };
    next();
  } catch {
    res.status(401).json({ error: 'Session expired. Please log in again.' });
  }
}

function parseOptionalNumber(value, label, errors) {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) {
    errors.push(`${label} must be a number of 0 or more.`);
    return null;
  }
  return n;
}

function parseOptionalInt(value, label, errors) {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) {
    errors.push(`${label} must be a whole number of 0 or more.`);
    return null;
  }
  return n;
}

function parseProductBody(body) {
  const errors = [];
  const name = String(body.name ?? '').trim();
  const sku = String(body.sku ?? '').trim();
  if (!name) errors.push('Name is required.');
  if (!sku) errors.push('SKU is required.');
  if (name.length > 200) errors.push('Name is too long (max 200 characters).');
  if (sku.length > 100) errors.push('SKU is too long (max 100 characters).');

  let quantity = 0;
  if (body.quantity !== '' && body.quantity !== null && body.quantity !== undefined) {
    quantity = Number(body.quantity);
    if (!Number.isInteger(quantity) || quantity < 0) {
      errors.push('Quantity on hand must be a whole number of 0 or more.');
    }
  }

  const description = String(body.description ?? '').trim() || null;
  const costPrice = parseOptionalNumber(body.cost_price, 'Cost price', errors);
  const sellingPrice = parseOptionalNumber(body.selling_price, 'Selling price', errors);
  const threshold = parseOptionalInt(body.low_stock_threshold, 'Low stock threshold', errors);

  return {
    errors,
    data: { name, sku, description, quantity, costPrice, sellingPrice, threshold },
  };
}

const PRODUCT_SELECT = `
  SELECT p.id, p.name, p.sku, p.description, p.quantity, p.cost_price, p.selling_price,
         p.low_stock_threshold, p.last_note, p.last_updated_by, p.created_at, p.updated_at,
         COALESCE(p.low_stock_threshold, o.default_low_stock_threshold) AS effective_threshold,
         (p.quantity <= COALESCE(p.low_stock_threshold, o.default_low_stock_threshold)) AS is_low
  FROM products p
  JOIN organizations o ON o.id = p.organization_id
`;

function isUniqueError(err) {
  return err && typeof err.code === 'string' && err.code.startsWith('SQLITE_CONSTRAINT');
}


app.post('/api/signup', (req, res) => {
  const email = String(req.body.email ?? '').trim().toLowerCase();
  const password = String(req.body.password ?? '');
  const orgName = String(req.body.organizationName ?? '').trim();

  const errors = [];
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('Enter a valid email address.');
  if (password.length < 8) errors.push('Password must be at least 8 characters.');
  if (!orgName) errors.push('Organization name is required.');
  if (orgName.length > 120) errors.push('Organization name is too long.');
  if (errors.length) return res.status(400).json({ error: errors.join(' ') });

  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) {
    return res.status(409).json({ error: 'An account with this email already exists.' });
  }

  const hash = bcrypt.hashSync(password, 10);
  const create = db.transaction(() => {
    const org = db.prepare('INSERT INTO organizations (name) VALUES (?)').run(orgName);
    const user = db
      .prepare('INSERT INTO users (organization_id, email, password_hash) VALUES (?, ?, ?)')
      .run(org.lastInsertRowid, email, hash);
    return user.lastInsertRowid;
  });

  try {
    const userId = create();
    setAuthCookie(res, userId);
    res.status(201).json({ ok: true });
  } catch (err) {
    if (isUniqueError(err)) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }
    console.error(err);
    res.status(500).json({ error: 'Could not create account.' });
  }
});

app.post('/api/login', (req, res) => {
  const email = String(req.body.email ?? '').trim().toLowerCase();
  const password = String(req.body.password ?? '');
  if (!email || !password) {
    return res.status(400).json({ error: 'Enter your email and password.' });
  }
  const user = db.prepare('SELECT id, password_hash FROM users WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Incorrect email or password.' });
  }
  setAuthCookie(res, user.id);
  res.json({ ok: true });
});

app.post('/api/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME);
  res.json({ ok: true });
});

app.get('/api/me', auth, (req, res) => {
  const org = db
    .prepare('SELECT id, name FROM organizations WHERE id = ?')
    .get(req.user.orgId);
  res.json({ user: { id: req.user.id, email: req.user.email }, organization: org });
});


app.get('/api/dashboard', auth, (req, res) => {
  const totals = db
    .prepare(
      `SELECT COUNT(*) AS total_products, COALESCE(SUM(quantity), 0) AS total_quantity
       FROM products WHERE organization_id = ?`
    )
    .get(req.user.orgId);

  const lowStock = db
    .prepare(
      `SELECT p.id, p.name, p.sku, p.quantity,
              COALESCE(p.low_stock_threshold, o.default_low_stock_threshold) AS threshold
       FROM products p
       JOIN organizations o ON o.id = p.organization_id
       WHERE p.organization_id = ?
         AND p.quantity <= COALESCE(p.low_stock_threshold, o.default_low_stock_threshold)
       ORDER BY p.quantity ASC, p.name ASC`
    )
    .all(req.user.orgId);

  res.json({ ...totals, low_stock: lowStock });
});


app.get('/api/products', auth, (req, res) => {
  const q = String(req.query.q ?? '').trim();
  const like = `%${q}%`;
  const rows = db
    .prepare(
      `${PRODUCT_SELECT}
       WHERE p.organization_id = ?
         AND (? = '' OR p.name LIKE ? OR p.sku LIKE ?)
       ORDER BY p.created_at DESC, p.id DESC`
    )
    .all(req.user.orgId, q, like, like);
  res.json({ products: rows });
});

app.get('/api/products/:id', auth, (req, res) => {
  const row = db
    .prepare(`${PRODUCT_SELECT} WHERE p.organization_id = ? AND p.id = ?`)
    .get(req.user.orgId, Number(req.params.id));
  if (!row) return res.status(404).json({ error: 'Product not found.' });
  res.json({ product: row });
});

app.post('/api/products', auth, (req, res) => {
  const { errors, data } = parseProductBody(req.body);
  if (errors.length) return res.status(400).json({ error: errors.join(' ') });
  try {
    const result = db
      .prepare(
        `INSERT INTO products
           (organization_id, name, sku, description, quantity, cost_price, selling_price,
            low_stock_threshold, last_updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        req.user.orgId, data.name, data.sku, data.description, data.quantity,
        data.costPrice, data.sellingPrice, data.threshold, req.user.id
      );
    res.status(201).json({ id: result.lastInsertRowid });
  } catch (err) {
    if (isUniqueError(err)) {
      return res.status(409).json({ error: `SKU "${data.sku}" is already used by another product.` });
    }
    console.error(err);
    res.status(500).json({ error: 'Could not create product.' });
  }
});

app.put('/api/products/:id', auth, (req, res) => {
  const { errors, data } = parseProductBody(req.body);
  if (errors.length) return res.status(400).json({ error: errors.join(' ') });
  try {
    const result = db
      .prepare(
        `UPDATE products
         SET name = ?, sku = ?, description = ?, quantity = ?, cost_price = ?,
             selling_price = ?, low_stock_threshold = ?, last_updated_by = ?,
             updated_at = datetime('now')
         WHERE id = ? AND organization_id = ?`
      )
      .run(
        data.name, data.sku, data.description, data.quantity, data.costPrice,
        data.sellingPrice, data.threshold, req.user.id,
        Number(req.params.id), req.user.orgId
      );
    if (result.changes === 0) return res.status(404).json({ error: 'Product not found.' });
    res.json({ ok: true });
  } catch (err) {
    if (isUniqueError(err)) {
      return res.status(409).json({ error: `SKU "${data.sku}" is already used by another product.` });
    }
    console.error(err);
    res.status(500).json({ error: 'Could not update product.' });
  }
});

app.post('/api/products/:id/adjust', auth, (req, res) => {
  const delta = Number(req.body.delta);
  const note = String(req.body.note ?? '').trim().slice(0, 300) || null;
  if (!Number.isInteger(delta) || delta === 0) {
    return res.status(400).json({ error: 'Enter a whole number other than 0 (for example +10 or -3).' });
  }
  const id = Number(req.params.id);
  const product = db
    .prepare('SELECT quantity FROM products WHERE id = ? AND organization_id = ?')
    .get(id, req.user.orgId);
  if (!product) return res.status(404).json({ error: 'Product not found.' });
  const next = product.quantity + delta;
  if (next < 0) {
    return res.status(400).json({ error: `Only ${product.quantity} units in stock; you cannot remove ${Math.abs(delta)}.` });
  }
  db.prepare(
    `UPDATE products
     SET quantity = ?, last_note = ?, last_updated_by = ?, updated_at = datetime('now')
     WHERE id = ? AND organization_id = ?`
  ).run(next, note, req.user.id, id, req.user.orgId);
  res.json({ ok: true, quantity: next });
});

app.delete('/api/products/:id', auth, (req, res) => {
  const result = db
    .prepare('DELETE FROM products WHERE id = ? AND organization_id = ?')
    .run(Number(req.params.id), req.user.orgId);
  if (result.changes === 0) return res.status(404).json({ error: 'Product not found.' });
  res.json({ ok: true });
});



app.get('/api/settings', auth, (req, res) => {
  const org = db
    .prepare('SELECT name, default_low_stock_threshold FROM organizations WHERE id = ?')
    .get(req.user.orgId);
  res.json({ organization_name: org.name, default_low_stock_threshold: org.default_low_stock_threshold });
});

app.put('/api/settings', auth, (req, res) => {
  const value = Number(req.body.default_low_stock_threshold);
  if (!Number.isInteger(value) || value < 0) {
    return res.status(400).json({ error: 'Default low stock threshold must be a whole number of 0 or more.' });
  }
  db.prepare('UPDATE organizations SET default_low_stock_threshold = ? WHERE id = ?')
    .run(value, req.user.orgId);
  res.json({ ok: true });
});


app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(err.status || 500).json({ error: 'Something went wrong.' });
});

app.listen(PORT, () => {
  console.log(`StockFlow running at http://localhost:${PORT}`);
});
