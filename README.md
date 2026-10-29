# StockFlow MVP

Minimal multi-tenant inventory app: signup/login, product CRUD, stock adjustments,
dashboard with low-stock list, and a default low-stock setting.

**Stack:** Node.js + Express, SQLite (better-sqlite3), plain HTML/CSS/JS frontend (no build step).

## Run it

Requires Node.js 18 or newer.

```bash
npm install
npm start
```

Open http://localhost:3000, click "Create an account", and you're in.

For development with auto-restart: `npm run dev`

## Configuration (optional environment variables)

| Variable     | Default                     | Purpose                                      |
|--------------|-----------------------------|----------------------------------------------|
| PORT         | 3000                        | Server port                                  |
| JWT_SECRET   | dev-only value              | Signs login cookies. **Required in production** |
| NODE_ENV     | (unset)                     | Set to `production` to enable secure cookies |
| DB_PATH      | ./stockflow.db              | SQLite file location                         |

## Project layout

```
server.js        Express API + auth + tenant scoping
db.js            SQLite schema (created automatically on first run)
public/
  index.html     App shell + adjust-stock dialog
  app.js         Router and all screens
  style.css      Styles
```

## How tenant isolation works

Every API route (except signup/login) runs through the `auth` middleware, which resolves the
logged-in user's organization. Every product query includes `organization_id = ?`, so one
organization can never read or change another's data.

## Reset the database

Stop the server and delete `stockflow.db` (plus any `-wal` / `-shm` files).

## Notes / MVP limits

- No password reset (delete the user row or reset by hand in the DB).
- Hard delete for products, with a confirm dialog.
- Use HTTPS and a strong JWT_SECRET if you deploy this anywhere public.
