# راهنمای استقرار روی سرور

این راهنما نمونه‌ای برای یک سرور لینوکسی (Ubuntu 22.04/24.04) با PostgreSQL، Nginx و systemd است. هیچ بخشی از آن به‌صورت خودکار اجرا نشده است؛ دامنه، سرور و گواهی HTTPS را صاحب کسب‌وکار باید فراهم و تأیید کند.

## ۱. پیش‌نیازها

- Node.js 20.9 یا بالاتر (پیشنهاد: 22 LTS)
- PostgreSQL 14 یا بالاتر (روی 16 آزموده شد)
- Nginx و certbot برای HTTPS
- یک کاربر سیستمی بدون دسترسی root برای اجرای برنامه، مثلاً `motasadi`

## ۲. پایگاه داده

```sql
CREATE ROLE motasadi_app LOGIN PASSWORD '<رمز قوی و تصادفی>';
CREATE DATABASE motasadi OWNER motasadi_app ENCODING 'UTF8';
```

PostgreSQL را فقط روی `localhost` در دسترس بگذارید.

## ۳. کد و ساخت

```bash
sudo -u motasadi -i
git clone <مخزن> /srv/motasadi && cd /srv/motasadi      # یا کپی فایل‌ها
npm ci
npm run build
```

## ۴. فایل محیط

`/etc/motasadi.env` (مالک root، مجوز `600`):

```ini
NODE_ENV=production
DATABASE_URL=postgres://motasadi_app:<رمز>@127.0.0.1:5432/motasadi
SITE_URL=https://<دامنهٔ دفتر>
UPLOAD_DIR=/var/lib/motasadi/uploads
SESSION_TTL_HOURS=12
PORT=3000
HOSTNAME=127.0.0.1
```

```bash
sudo mkdir -p /var/lib/motasadi/uploads && sudo chown -R motasadi /var/lib/motasadi
```

## ۵. مهاجرت و نخستین مدیر

```bash
cd /srv/motasadi
set -a; source /etc/motasadi.env; set +a
npm run db:migrate
npm run admin:create -- --username <نام کاربری> --name "<نام کامل>"
```

## ۶. سرویس systemd

`/etc/systemd/system/motasadi.service`:

```ini
[Unit]
Description=Motasadi real estate platform
After=network.target postgresql.service

[Service]
User=motasadi
WorkingDirectory=/srv/motasadi/.next/standalone
EnvironmentFile=/etc/motasadi.env
ExecStart=/usr/bin/node server.js
Restart=on-failure
NoNewPrivileges=true
ProtectSystem=full
ReadWritePaths=/var/lib/motasadi

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload && sudo systemctl enable --now motasadi
```

## ۷. Nginx و HTTPS

```nginx
server {
  server_name <دامنهٔ دفتر>;
  client_max_body_size 15m;           # آپلود عکس (۱۲ مگابایت) و رسید (۱۰ مگابایت)
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

```bash
sudo certbot --nginx -d <دامنهٔ دفتر>
```

پس از فعال شدن HTTPS، سرآیند HSTS را در Nginx اضافه کنید: `add_header Strict-Transport-Security "max-age=31536000" always;`

> محدودیت نرخ ورود و فرم درخواست بر اساس `X-Forwarded-For` است؛ برنامه را فقط پشت پراکسی مطمئن و فقط روی `127.0.0.1` اجرا کنید.

## ۸. به‌روزرسانی نسخه

```bash
cd /srv/motasadi && git pull && npm ci && npm run build
set -a; source /etc/motasadi.env; set +a; npm run db:migrate
sudo systemctl restart motasadi
```

پیش از هر به‌روزرسانی از پایگاه داده و پوشهٔ آپلود پشتیبان بگیرید (README، بخش پشتیبان‌گیری).

## ۹. فهرست بررسی پیش از انتشار عمومی

- [ ] متن حریم خصوصی، قوانین و راهنماها توسط مشاور حقوقی بازبینی و برچسب «نیاز به بازبینی» برداشته شد
- [ ] مجوز استفادهٔ وب فونت‌های لحظه، ایران‌سنس X و ایران‌یکان تأیید شد
- [ ] اطلاعات تماس و نشانی در «تنظیمات» بازبینی شد
- [ ] هیچ دادهٔ نمونه‌ای در پایگاه دادهٔ تولید نیست
- [ ] HTTPS فعال است و ورود به پنل فقط روی HTTPS انجام می‌شود
- [ ] پشتیبان‌گیری خودکار روزانه و یک بازگردانی آزمایشی انجام شد
- [ ] `SITE_URL` دامنهٔ نهایی است و `/sitemap.xml` و `/robots.txt` درست‌اند
