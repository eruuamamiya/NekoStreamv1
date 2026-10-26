# 🐱 NekoStream

Situs nonton anime **subtitle Indonesia** yang ringan, ditambah **bot WhatsApp Saluran** yang otomatis mengumumkan episode baru. Dibuat tanpa framework dan tanpa proses build, dan cukup ringan untuk dijalankan di STB atau Raspberry Pi.

> ⚠️ Proyek ini hanya antarmuka (front-end) dan tidak menyimpan atau meng-host video apa pun. Seluruh data berasal dari API pihak ketiga, dan video diputar dari server pihak ketiga.

## ✨ Fitur

### Situs (`index.html` + `app.js`)
- Beranda dengan **hero carousel**, daftar *Sedang Tayang* dan *Baru Selesai*
- Banner HD diambil otomatis dari **Kuramanime** (dicocokkan lewat judul Jepang), dengan cache di `localStorage`
- Daftar anime A–Z dengan filter judul, daftar genre, jadwal rilis, dan pencarian
- Halaman detail: sinopsis, info, genre, daftar episode, dan rekomendasi
- Pemutar episode dengan **pilihan server**, tombol *Coba server lain*, dan fallback otomatis ke server yang bisa diputar
- Link unduhan per kualitas dan **riwayat tontonan** (Lanjut Menonton)
- Tema gelap/terang dan penanda episode yang sudah ditonton
- Tahan terhadap perubahan struktur respons API: daftar, episode, dan server dicari otomatis
- Router berbasis hash (`#/anime/...`), jadi cukup hosting statis

### Bot WhatsApp (`bot.js`)
- Memantau daftar *ongoing* dan mengirim notifikasi **episode baru** ke Saluran WhatsApp
- Gambar notifikasi: banner Kuramanime → poster Otakudesu → teks saja (fallback berurutan)
- Anti-spam: jalan pertama hanya mencatat, ada batas kiriman per siklus dan jeda antar pesan
- State disimpan atomik (`state.json`), sambung ulang otomatis, login lewat **kode pairing** atau QR
- Mode tes (`SEND_TEST=1`) untuk memastikan pengiriman ke Saluran berfungsi

## 📁 Struktur

```
nekostream/
├── index.html     # halaman utama + styling
├── app.js         # logika situs (jalan di browser)
├── server.js      # server statis tanpa dependensi (port 4555)
├── bot.js         # bot WhatsApp Saluran (Baileys)
└── package.json   # dependensi bot
```

## 🚀 Menjalankan

Butuh **Node.js 18+**.

### 1. Situs

```bash
node server.js
```

Buka `http://IP-PERANGKAT:4555`. Port bisa diganti lewat `PORT=8080 node server.js`.

> `app.js` adalah kode browser, **jangan** dijalankan dengan `node app.js`. Cukup jalankan `server.js` lalu buka lewat browser.

`server.js` hanya menyajikan file situs (html, js, css, gambar, font). Folder `auth/`, `node_modules/`, file tersembunyi, `state.json`, `bot.js`, dan `package.json` tidak bisa diakses dari luar.

### 2. Bot WhatsApp

```bash
npm install
SITE_URL=https://situs-kamu.example \
CHANNEL=https://whatsapp.com/channel/XXXXXXXX \
PAIR_NUMBER=62812xxxxxxxx \
node bot.js
```

Saat pertama kali jalan, bot menampilkan **kode pairing** di terminal. Buka WhatsApp → *Perangkat tertaut* → *Tautkan dengan nomor telepon* lalu masukkan kodenya. Kosongkan `PAIR_NUMBER` untuk login lewat QR.

Akun yang dipakai harus **pemilik atau admin** Saluran tujuan.

| Variabel | Fungsi | Default |
|---|---|---|
| `SITE_URL` | Alamat situs untuk link "Nonton" di notifikasi | *(kosong, link tidak ditampilkan)* |
| `CHANNEL` | Link Saluran atau JID `...@newsletter` | *(wajib diisi)* |
| `PAIR_NUMBER` | Nomor WhatsApp bot untuk kode pairing | *(kosong → QR)* |
| `INTERVAL_MIN` | Selang pengecekan (menit) | `10` |
| `MAX_PER_CYCLE` | Maksimum notifikasi per siklus | `5` |
| `API` | Endpoint Otakudesu | `https://api.nekostream.online/otakudesu` |
| `KURAMA` | Endpoint Kuramanime (banner) | `https://api.nekostream.online/kuramanime` |
| `SEND_TEST` | Kirim pesan tes saat tersambung | *(mati)* |

> Kalau kamu mengisi nilai default langsung di `bot.js`, **jangan** commit nomor telepon pribadimu ke repo publik. Gunakan variabel environment.

### Jalan terus di latar belakang (pm2)

```bash
npm i -g pm2
pm2 start server.js --name neko-web
pm2 start bot.js --name neko-bot
pm2 save && pm2 startup
pm2 logs neko-bot
```

### Domain lewat Cloudflare Tunnel / reverse proxy

Arahkan service ke `http://127.0.0.1:4555` (bukan `https://`, dan hindari `localhost` kalau IPv6 aktif). Error **502** biasanya berarti `server.js` mati atau tunnel menunjuk ke alamat/port yang salah.

## 🧩 Cara kerja singkat

```
Browser ── index.html + app.js ──► api.nekostream.online/otakudesu     (anime, episode, server)
                               └─► api.nekostream.online/kuramanime    (banner)

bot.js ── tiap N menit ──► /otakudesu/ongoing ── ada update? ──► WhatsApp Saluran
              └─ banner via Kuramanime (judul Jepang + &order_by=oldest)
```

Notifikasi dianggap "baru" kalau kombinasi **nomor episode + tanggal rilis** berubah dari yang pernah dikirim.

## 🛠️ Pemecahan masalah

| Masalah | Penyebab / solusi |
|---|---|
| `document is not defined` | `app.js` dijalankan dengan `node`. Jalankan `node server.js` dan buka lewat browser. |
| Cloudflare 502 | `server.js` tidak jalan atau tunnel salah alamat. Cek `curl -I http://127.0.0.1:4555`. |
| Bot mencatat "Terkirim" tapi pesan tidak muncul | Jalankan dengan `SEND_TEST=1` dan periksa log. Pastikan akun bot adalah admin/pemilik Saluran. |
| `Sesi keluar (logged out)` | Hapus folder `auth/` lalu jalankan ulang untuk login lagi. |
| Banner tidak cocok | Judul di Kuramanime berbeda. Bot dan situs mencari lewat judul Jepang lalu judul biasa. |

## ⚖️ Disclaimer

NekoStream **tidak menyimpan, meng-host, atau mengunggah** konten video. Semua konten berasal dari sumber pihak ketiga dan hak ciptanya milik pemilik masing-masing. Iklan di dalam pemutar berasal dari server pihak ketiga, bukan dari proyek ini. **Judi online dilarang**; jangan tergiur iklan judi, slot, atau pinjol. Disarankan memakai browser dengan pemblokir iklan.

## 📄 Lisensi

Tentukan lisensi sebelum dipublikasikan (misalnya MIT) dan tambahkan file `LICENSE`.
