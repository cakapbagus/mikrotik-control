# 🌐 Kontrol Internet Sekolah — Mikrotik Panel

Dashboard web untuk memblokir internet per address-list di Mikrotik RouterOS v7 via REST API.

---

## 📁 Struktur Project

```
mikrotik-control/
├── api/
│   ├── block.js       ← Blokir internet (5 atau 15 menit)
│   ├── unblock.js     ← Batalkan blokir manual
│   └── status.js      ← Cek status blokir aktif
├── public/
│   └── index.html     ← Dashboard UI
├── package.json
├── vercel.json
└── README.md
```

---

## 🚀 Cara Deploy ke Vercel

### 1. Persiapan Mikrotik

Pastikan REST API aktif di RouterOS v7:
- Buka Winbox → IP → Services → pastikan `www` atau `www-ssl` aktif
- REST API aktif otomatis di RouterOS v7 di port 80 (atau sesuai konfigurasi)

Buat user khusus (opsional tapi disarankan):
```
/user add name=webadmin password=PASSWORDKUAT group=full
```

### 2. Upload ke GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/USERNAME/mikrotik-control.git
git push -u origin main
```

### 3. Deploy di Vercel

1. Buka https://vercel.com → Login
2. Klik **"Add New Project"** → Import repo GitHub tadi
3. Klik **Deploy** (tanpa perlu mengubah apapun)

### 4. Set Environment Variables di Vercel

Setelah deploy, buka **Project Settings → Environment Variables**, tambahkan:

| Key | Value | Contoh |
|-----|-------|--------|
| `MIKROTIK_IP` | IP public Mikrotik | `38.225.121.13` |
| `MIKROTIK_PORT` | Port WebFig/REST | `8080` |
| `MIKROTIK_USER` | Username admin | `webadmin` |
| `MIKROTIK_PASS` | Password admin | `passwordkuat` |
| `ADMIN_KEY` | Kunci rahasia website | `kunci-rahasia-123` |

Setelah set env var, klik **Redeploy**.

### 5. Akses Website

Buka URL Vercel Anda (misal: `https://mikrotik-control.vercel.app`)
Masukkan **Admin Key** yang sudah diset di environment variable.

---

## 🔐 Keamanan

- **ADMIN_KEY**: Wajib diset! Ini yang melindungi dashboard dari akses umum
- **MIKROTIK_PASS**: Tersimpan aman di environment variable Vercel, tidak terekspos ke browser
- Gunakan user Mikrotik khusus dengan password kuat
- Pertimbangkan mengaktifkan HTTPS di Mikrotik untuk koneksi terenkripsi

---

## ⚙️ Cara Kerja

1. Browser → Vercel Serverless Function (api/block.js)
2. Serverless Function → Mikrotik REST API (`/rest/ip/firewall/filter/add`)
3. Mikrotik menambahkan rule DROP dengan timeout otomatis
4. Setelah timeout habis, rule terhapus sendiri → internet nyala kembali

Rule yang ditambahkan di Mikrotik:
```
/ip firewall filter add \
  chain=forward \
  action=drop \
  src-address-list=ALL-SISWA \
  timeout=00:05:00 \
  comment=BLOCK-ALL-SISWA
```

---

## 🛠️ Troubleshoot

**"Gagal terhubung ke Mikrotik"**
- Cek env var MIKROTIK_IP, PORT, USER, PASS sudah benar
- Pastikan port 8080 bisa diakses dari internet (Vercel server)
- Cek firewall Mikrotik apakah mengizinkan akses REST API dari luar

**"Unauthorized"**
- Admin Key salah, cek env var ADMIN_KEY

**Rule tidak muncul di Mikrotik**
- Pastikan user punya permission `write` di Mikrotik
- Cek log Vercel di dashboard untuk error detail
