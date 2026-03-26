# Nhentai Mirror Proxy

Full reverse proxy mirror dengan optimasi SEO untuk deploy di Railway, Render, atau VPS.

## Fitur

- **Full URL rewriting** — Semua link internal di-rewrite ke domain mirror
- **Canonical tag** — Setiap halaman punya `<link rel="canonical">` yang mengarah ke domain mirror (bukan target), sehingga Google tidak menganggap duplikat
- **Meta robots** — `index, follow` ditambahkan otomatis
- **Open Graph / Twitter** — `og:url` dan `twitter:url` di-rewrite
- **Redirect handling** — Semua redirect (301/302/307/308) di-rewrite agar Location header mengarah ke domain mirror
- **Custom robots.txt** — Disajikan dari mirror, bukan dari target
- **CSS/JS/JSON rewriting** — URL dalam file non-HTML juga di-rewrite
- **Gzip compression** — Response dikompresi
- **Docker ready** — Bisa deploy via Docker

## Cara Mengatasi Masalah SEO

| Masalah Google Search Console | Solusi |
|---|---|
| Duplikat, Google memilih kanonis berbeda | Canonical tag di-rewrite ke domain mirror |
| Tidak ditemukan (404) | Proxy meneruskan semua path, redirect di-handle |
| Halaman dengan pengalihan | Redirect Location header di-rewrite ke domain mirror |

## Environment Variables

| Variable | Default | Keterangan |
|---|---|---|
| `MIRROR_DOMAIN` | *(auto dari Host header)* | Domain mirror kamu, misal `yourdomain.com` |
| `TARGET_HOST` | `nhentai.xxx` | Hostname target yang di-mirror |
| `PORT` | `3000` | Port server |

> **Penting:** Selalu set `MIRROR_DOMAIN` di production agar canonical tag konsisten.

---

## Deploy ke Railway

1. Push repo ini ke GitHub
2. Buka [railway.app](https://railway.app), buat project baru, connect ke repo
3. Railway otomatis detect `Dockerfile` atau `package.json`
4. Tambahkan environment variable:
   ```
   MIRROR_DOMAIN=yourdomain.com
   ```
5. Deploy. Railway otomatis set `PORT`.
6. Custom domain: Settings → Domains → Add Custom Domain

---

## Deploy ke Render

1. Push repo ke GitHub
2. Buka [render.com](https://render.com), New → Web Service → Connect repo
3. Build Command: `npm install`
4. Start Command: `npm start`
5. Environment variables:
   ```
   MIRROR_DOMAIN=yourdomain.com
   ```
6. Custom domain: Settings → Custom Domains

---

## Deploy ke VPS

```bash
# Clone repo
git clone https://github.com/yourusername/nhentai-mirror.git
cd nhentai-mirror

# Install dependencies
npm install

# Set environment
export MIRROR_DOMAIN=yourdomain.com
export PORT=3000

# Jalankan
node server.js

# Atau pakai Docker
docker build -t nhentai-mirror .
docker run -d -p 3000:3000 \
  -e MIRROR_DOMAIN=yourdomain.com \
  --name nhentai-mirror \
  nhentai-mirror
```

### Untuk production di VPS, pakai Nginx reverse proxy:

```nginx
server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
    }
}
```

---

## Jalankan Lokal

```bash
npm install
MIRROR_DOMAIN=localhost:3000 node server.js
```

Buka `http://localhost:3000`