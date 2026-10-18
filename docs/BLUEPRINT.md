# Blueprint: IoT Designer

Aplikasi web untuk **merancang sistem IoT secara visual lalu menyimulasikannya di browser**: taruh sensor dan aktuator di kanvas, sambungkan dengan kabel, atur aturannya, tekan **Run**, dan lihat nilainya berubah secara langsung.

## Status

| # | Milestone | Status |
| --- | --- | --- |
| M0 | Kerangka repo | Selesai (CI menjalankan test dan build) |
| M1 | Editor | Selesai |
| M2 | Simulasi | Selesai. Berjalan di thread utama, belum di Web Worker; cukup untuk rangkaian kecil, dan engine-nya sudah terpisah dari UI sehingga mudah dipindah |
| M1+ | Papan mikrokontroler | Selesai: Arduino Uno, ESP32, Raspberry Pi Pico dengan gambar dan pin asli, diprogram lewat bahasa mini. Arduino Uno kini menjalankan C++ asli: kompilasi di server (avr-gcc), emulasi ATmega328P di browser (`avr8js`). Belum ada: emulasi ESP32/Pico, library Arduino di luar inti, komponen berpresisi waktu (servo, DHT22, I2C), validasi daya (VCC/GND) |
| M3 | Backend proyek | Belum. Sementara proyek disimpan di browser dan bisa diekspor/impor |
| M4 | Akun | Belum (ditunda) |
| M5 | Rilis v0.1 | Belum |

## 1. Target MVP (v0.1)

Satu alur yang harus jalan dari awal sampai akhir:

> Daftar/login → buat proyek → taruh komponen → sambungkan → Run → lihat nilai bergerak → simpan → buka lagi nanti.

### Masuk MVP

| Area | Fitur |
| --- | --- |
| Editor | Kanvas dengan zoom/pan, palet komponen, drag-and-drop, sambung kabel antar-port, hapus, undo/redo |
| Properti | Panel kanan untuk mengatur nilai komponen yang dipilih (rentang sensor, ambang batas, interval) |
| Simulasi | Tombol Run / Pause / Reset, kecepatan 1×/2×/5×, nilai tampil langsung di komponen |
| Proyek | Buat, ganti nama, simpan, buka, hapus. Simpan otomatis setiap ada perubahan |
| Akun | Daftar dan login dengan email + password |

### Komponen MVP

| Jenis | Komponen | Port |
| --- | --- | --- |
| Sensor | Suhu, Kelembapan, Cahaya, Gerak (PIR), Tombol | `out` |
| Logika | Pembanding (`>`, `<`, `==`), AND/OR/NOT, Timer | `in` → `out` |
| Aktuator | LED, Relay/Kipas, Buzzer | `in` |
| Tampilan | Gauge, Grafik garis | `in` |

Contoh rangkaian yang harus bisa dibuat: **Sensor suhu → Pembanding (> 30) → Kipas**, plus Grafik yang menampilkan suhunya.

### Tidak masuk MVP (nanti)

- Emulasi ESP32/Pico dan library Arduino tambahan (Uno sudah dengan `avr8js`; Pico lewat `rp2040js` rencananya)
- Koneksi ke perangkat asli lewat MQTT
- Kolaborasi real-time dan berbagi proyek lewat link publik
- Komponen custom buatan pengguna
- Login dengan Google/GitHub

## 2. Arsitektur

```
┌──────────────────────── Browser ────────────────────────┐
│  React UI (editor, panel)  ◄──►  Zustand (state proyek) │
│                                        │                │
│                         Web Worker: engine simulasi     │
└────────────────────────────┬────────────────────────────┘
                             │ REST/JSON (cookie sesi)
                     ┌───────▼────────┐
                     │ API (TypeScript)│
                     └───────┬────────┘
                     ┌───────▼────────┐
                     │  PostgreSQL    │
                     └────────────────┘
```

- **Simulasi 100% di browser.** Server tidak menjalankan simulasi. Server hanya mengurus akun dan menyimpan proyek.
- **Proyek disimpan utuh sebagai satu dokumen JSON** (komponen + kabel + posisi). Tidak dipecah ke banyak tabel.

**Kenapa backend TypeScript, bukan Go.** Validasi format proyek (`parseProject`), definisi komponen dan pinout papan, bahasa program papan, dan mesin simulasi semuanya sudah ditulis dalam TypeScript. Backend yang memvalidasi proyek tersimpan atau menjalankan simulasi tanpa browser (tes, thumbnail) bisa memakai kode yang sama persis. Dengan Go, semua itu harus ditulis ulang dan dua versi bisa saling menyimpang. Emulator yang direncanakan (`avr8js`, `rp2040js`) juga berbasis JavaScript. Go tetap pilihan bagus kalau nanti perlu gateway untuk ribuan perangkat IoT sungguhan (MQTT/WebSocket), sebagai layanan terpisah.

**Langkah berikutnya untuk berbagi kode:** pindahkan `components/`, `sim/`, dan `editor/serialize.ts` ke paket bersama (misalnya `packages/core`) yang dipakai `web/` dan `server/`. Belum dilakukan; kerangka server sekarang berdiri sendiri.

## 3. Tech stack

| Bagian | Pilihan | Alasan |
| --- | --- | --- |
| Frontend | React + TypeScript + Vite | SPA, tanpa kebutuhan SSR |
| Kanvas | React Flow (`@xyflow/react`) | Node, port, dan kabel sudah tersedia |
| State | Zustand | Ringan, mudah dipakai untuk undo/redo |
| UI | Tailwind CSS + shadcn/ui | Komponen panel/dialog siap pakai |
| Grafik | uPlot | Cepat untuk data real-time |
| Backend | TypeScript di Node 22+, [Hono](https://hono.dev) | Satu bahasa dengan frontend; framework kecil dan berbasis standar web |
| Validasi | zod | Konfigurasi dan (nanti) isi request divalidasi dengan skema yang sama dengan tipenya |
| Database | PostgreSQL 16 | Kolom `JSONB` untuk dokumen proyek |
| Akses DB | `pg` + Drizzle ORM | Skema dalam TypeScript, query bertipe |
| Migrasi | `drizzle-kit` | SQL migrasi dihasilkan dari skema |
| Tes | Vitest | Sama dengan frontend |
| Lokal | Docker Compose (Postgres) | Satu perintah untuk menyalakan DB |

## 4. Struktur repo

```
.
├── web/                    # React app
│   └── src/
│       ├── editor/         # kanvas, palet, panel properti
│       ├── components/     # definisi tiap komponen IoT (port, properti, perilaku)
│       ├── sim/            # engine simulasi + Web Worker
│       ├── api/            # client ke backend
│       └── pages/          # login, daftar proyek, editor
├── server/                 # API TypeScript (Hono)
│   ├── src/
│   │   ├── index.ts        # menyalakan server, shutdown rapi
│   │   ├── app.ts          # menyusun aplikasi HTTP (mudah dites)
│   │   ├── config.ts       # membaca dan memvalidasi environment
│   │   ├── routes/         # endpoint
│   │   ├── modules/        # auth/, projects/ (kosong, M3 dan M4)
│   │   └── db/             # koneksi dan skema Drizzle
│   ├── test/
│   └── drizzle/            # migrasi SQL hasil drizzle-kit
├── docs/
└── docker-compose.yml
```

## 5. Model simulasi

- Setiap komponen punya **definisi**: daftar port masuk/keluar, properti, dan fungsi `step(input, state, dt) → output`.
- Engine berjalan per **tick** (default 100 ms). Setiap tick, komponen dievaluasi berurutan sesuai arah kabel (topological order), lalu nilai keluarannya dikirim ke UI.
- Sensor menghasilkan nilai dari pola yang bisa diatur: konstan, acak dalam rentang, atau gelombang sinus.
- Nilai yang mengalir di kabel hanya dua tipe: `number` dan `boolean`.
- Rangkaian yang melingkar (loop) ditolak di MVP.

## 6. Data

```sql
users (
  id            uuid primary key,
  email         text unique not null,
  password_hash text not null,          -- bcrypt
  created_at    timestamptz not null default now()
)

sessions (
  id          text primary key,         -- token acak, dikirim sebagai cookie HttpOnly
  user_id     uuid not null references users on delete cascade,
  expires_at  timestamptz not null
)

projects (
  id          uuid primary key,
  owner_id    uuid not null references users on delete cascade,
  name        text not null,
  graph       jsonb not null,           -- { version, nodes[], edges[] }
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
)
```

## 7. API

| Method | Path | Fungsi |
| --- | --- | --- |
| `POST` | `/api/auth/register` | Daftar |
| `POST` | `/api/auth/login` | Login, set cookie sesi |
| `POST` | `/api/auth/logout` | Logout |
| `GET` | `/api/me` | Data pengguna yang sedang login |
| `GET` | `/api/projects` | Daftar proyek milik pengguna |
| `POST` | `/api/projects` | Buat proyek |
| `GET` | `/api/projects/{id}` | Ambil proyek beserta `graph` |
| `PUT` | `/api/projects/{id}` | Simpan nama dan/atau `graph` |
| `DELETE` | `/api/projects/{id}` | Hapus proyek |

## 8. Urutan pengerjaan

| # | Milestone | Selesai kalau |
| --- | --- | --- |
| M0 | Kerangka repo | `web/` dan `server/` jalan lokal, Postgres via Docker Compose, CI menjalankan lint + test |
| M1 | Editor | Bisa taruh, geser, sambung, hapus komponen; undo/redo; proyek tersimpan di `localStorage` |
| M2 | Simulasi | Contoh "suhu → pembanding → kipas" jalan dengan Run/Pause/Reset, nilai tampil di kanvas dan grafik |
| M3 | Backend proyek | API proyek + database; editor menyimpan dan memuat dari server |
| M4 | Akun | Register/login/logout; setiap pengguna hanya melihat proyeknya sendiri |
| M5 | Rilis v0.1 | Deploy (frontend + API + Postgres) dan bisa dipakai dari internet |

M1 dan M2 sengaja dikerjakan sebelum backend. Ini supaya bagian tersulit dan paling menarik, yaitu editor dan simulasi, sudah terbukti jalan lebih dulu.

## 9. Keputusan yang masih terbuka

- **Nama aplikasi.** Untuk sementara "IoT Designer".
- **Tempat deploy.** Contoh: Vercel/Netlify untuk frontend, Fly.io/Railway untuk API + Postgres.
- **Arah setelah v0.1.** Pilih antara emulasi mikrokontroler (mirip Wokwi) atau koneksi ke perangkat asli via MQTT.
