# Deploy Uniqo to Railway

Everything is prepared: the `Dockerfile`, `railway.json` (health check and auto-restart), secure settings
for HTTPS, and a clean upload folder at **`dist\uniqo-railway`** (64 files, no database or customer data).
You'll need a **GitHub** account and a **Railway** account. You can sign in to Railway with GitHub.

## 1. The code is on GitHub

The project lives at **https://github.com/rakeshnamadi/Uniqo** (branch `main`). `D:\UniQO` is the local copy.
The repository is **public**. It contains no passwords or customer data: the admin password is a Railway
variable, and `.gitignore` keeps `data/`, `Images/` and database exports out.

## 2. Create the app on Railway

1. Go to **railway.com → New Project → Deploy from GitHub repo**, and pick `rakeshnamadi/Uniqo`.
   (The first time, Railway asks to connect your GitHub account. Allow access to this repository.)
   Railway finds the `Dockerfile` and starts building, which takes about 1–2 minutes.
2. Open the service, then **Variables → New Variable**:

   | Name | Value |
   |---|---|
   | `UNIQO_ADMIN_PASSWORD` | a strong password of your choice (used on the first start) |

3. **Add a volume. This step matters.** Right-click the service (or use `Ctrl+K` → *Add Volume*), attach
   it to the `uniqo` service, and set the **mount path** to `/data`.
   Without it, every redeploy wipes your designs, orders and accounts.
4. **Settings → Networking → Generate Domain.** You'll get an address like `uniqo-production.up.railway.app`.
   (Later: **Custom Domain** for `www.yourbrand.in`.)
5. Optional: **Settings → Region**, pick the one closest to India (Southeast Asia / Singapore) if offered.
6. Keep **1 replica**. The site uses a single database file on the volume.

Railway redeploys after adding the variable and volume. When the deploy turns **green** (the health
check at `/api/health` passed), the site is live.

## 3. First visit

1. Open `https://<your-domain>/admin` and sign in with `UNIQO_ADMIN_PASSWORD`.
   *If you skipped that variable, open the service's **Deploy Logs** and look for
   `Admin password set to: …`. A random one was generated for you.*
2. **Admin → Settings**: change the password, and set your real phone number, WhatsApp, email and address.
3. **Admin → Designs**: upload your product photos (for example the ones in `D:\UniQO\Images`).

## Updating the site later

From `D:\UniQO`, commit and push. Railway rebuilds automatically on every push to `main`:

```bash
git add -A
git commit -m "Describe the change"
git push
```

Your data lives on the `/data` volume, so it survives every update.

## Good to know

- **Cost:** Railway bills by usage. Check its current plans; a small site like this uses very little.
- **Backups:** Railway volumes support backups. Turn them on in the volume's settings.
- **HTTPS** is automatic. The app already sends secure cookies and HSTS behind Railway's proxy.
