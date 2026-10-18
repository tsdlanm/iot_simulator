# IoT Designer

Aplikasi web untuk merancang sistem IoT secara visual lalu menyimulasikannya langsung di browser.

- **Frontend:** React + TypeScript (Vite), React Flow, Zustand
- **Backend:** TypeScript (Hono) + PostgreSQL + Drizzle. Baru kerangka, belum dipakai; editor saat ini berjalan penuh di browser

## Yang sudah bisa

- Kanvas: seret komponen dari palet (atau klik untuk menambah), tarik kabel dari titik keluaran ke titik masukan, geser, hapus
- Kabel divalidasi: tipe harus cocok (angka ke angka, ya/tidak ke ya/tidak), satu kabel per masukan, tanpa loop
- **Arduino Uno menjalankan kode Arduino C++ sungguhan.** Tulis sketch di tab **Kode**, tekan **Run**: server mengompilasinya dengan avr-gcc asli dan hasilnya dijalankan oleh emulator ATmega328P (`avr8js`) di browser, tanpa unggah file. Ada serial monitor dan pesan error per baris
- **3 papan dengan gambar dan pin asli:** Arduino Uno, ESP32 DevKit (30 pin), Raspberry Pi Pico (40 pin). ESP32 dan Pico masih memakai bahasa mini (lihat di bawah); Uno bisa dialihkan ke bahasa mini lewat tombol **Sederhana**
- 15 komponen lain: sensor (suhu, kelembapan, cahaya, gerak, tombol), logika (pembanding, AND, OR, NOT, timer), aktuator (LED, kipas, buzzer), tampilan (gauge, grafik)
- Panel properti untuk mengatur tiap komponen. Untuk papan mikrokontroler, programnya diedit di **editor kode** penuh (CodeMirror): nomor baris, pewarnaan sintaks, saran nama pin (`Ctrl+Space`), dan kesalahan digarisbawahi di barisnya
- **Alat pilih dan tangan:** seret area kosong untuk memilih banyak komponen sekaligus lalu hapus, duplikat, atau pindahkan bersama; alat tangan (atau `Space` + seret) menggeser kanvas
- **Zoom halus** dengan roda mouse ke arah kursor (10%–300%), slider zoom, dan tombol "tampilkan semua"
- **Panel kiri dan kanan bisa ditutup** (`[` dan `]`) dan **lebarnya bisa ditarik**; pilihan ini diingat setelah reload
- Simulasi Run / Pause / Reset dengan kecepatan 1×, 2×, 5×; pengeditan saat berjalan langsung berlaku
- Undo / redo (Ctrl+Z, Ctrl+Shift+Z), simpan otomatis di browser, ekspor/impor file `.iot.json`, empat contoh rangkaian, pencarian komponen
- Kabel yang ditolak menjelaskan alasannya (tipe tidak cocok, masukan sudah terpakai, membentuk loop)
- Tanpa akun

## Papan mikrokontroler

Sambungkan sensor ke pin masukan papan (bulat), dan pin keluaran (kotak) ke aktuator. Pin yang menyala hijau sedang aktif.

| Papan | Masukan angka | Masukan ya/tidak | Keluaran |
| --- | --- | --- | --- |
| Arduino Uno | A0–A5 | D2–D7 | D8–D13 |
| ESP32 DevKit | VP, VN, D34, D35, D32, D33 | D25, D26, D27, D14 | D12, D13, D23, D22, D21, D19, D18, D5, D17, D16, D4, D2, D15 |
| Raspberry Pi Pico | GP26, GP27, GP28 | GP0–GP5 | GP6–GP15, GP16–GP22 |

Pin daya (5V, 3V3, GND, VIN) dan pin khusus (SCL, SDA, TX, RX, dll.) digambar sesuai papan aslinya tetapi belum bisa disambung.

## Arduino Uno: kode asli

Papan Uno memakai C++ Arduino. Alurnya seperti Wokwi: **kompilasi di server, emulasi di browser.**

- Pin keluaran D8–D13 disambung ke aktuator; masukan D2–D7 (ya/tidak) dan A0–A5 (angka) dari sensor. Pin PWM dibaca menyala bila duty cycle ≥ 50%.
- Tombol yang ditekan terbaca HIGH; bila pin memakai `INPUT_PULLUP`, terbaca LOW (seperti tombol ke GND).
- Masukan analog dipetakan lewat properti *Nilai sensor di 0 V / 5 V* (bawaan 0 dan 500, jadi `analogRead(A0) * 500.0 / 1023.0` menghasilkan derajat Celsius).
- Belum didukung: library di luar inti Arduino (Servo, Wire, SoftwareSerial, dst.), `tone()`, dan komponen yang butuh waktu presisi (servo, HC-SR04, DHT22, OLED I2C). Hanya satu papan: Uno.
- Pengeditan kode tidak berlaku saat berjalan: tekan Reset lalu Run.

## Bahasa mini (ESP32, Pico, dan Uno mode Sederhana)

Program ditulis di tab **Kode**, satu perintah per baris:

```
# A0 = suhu. Kipas di D13 menyala di atas 30.
D13 = A0 > 30
# D12 berkedip tiap 2 detik.
D12 = time % 2 < 1
```

Operator `+ - * / %`, `> >= < <= == !=`, `and or not`, dan kurung. `time` adalah waktu simulasi dalam detik. Hanya pin keluaran yang bisa diisi. Program diurai sendiri, tanpa `eval`. Ini bukan kode Arduino atau MicroPython sungguhan.

## Pintasan

| Aksi | Tombol |
| --- | --- |
| Alat pilih / alat tangan | `V` / `H` |
| Geser kanvas sementara | tahan `Space` dan seret |
| Zoom | roda mouse (`Shift` + roda menggeser ke samping) |
| Hapus / duplikat / pilih semua | `Del` / `Ctrl+D` / `Ctrl+A` |
| Urungkan / ulangi | `Ctrl+Z` / `Ctrl+Shift+Z` |
| Tutup atau buka panel kiri / kanan | `[` / `]` |

Rencana lengkap dan yang belum dikerjakan ada di [docs/BLUEPRINT.md](docs/BLUEPRINT.md).

## Menjalankan secara lokal

Editor hanya butuh Node.js 20+:

```sh
cd web
npm install
npm run dev     # http://localhost:5173
npm test        # unit test engine simulasi dan validasi proyek
npm run build
```

Backend (Node.js 22.9+) dan PostgreSQL. Endpoint: `GET /api/health`, `GET /api/ready` (cek database), `POST /api/compile` dan `GET /api/compile/status` (layanan kompilasi Arduino):

```sh
docker compose up -d                  # PostgreSQL di localhost:5432
cd server
npm install
cp ../.env.example .env               # dibaca otomatis oleh `npm run dev`
npm run dev                           # API di localhost:8080
npm test                              # unit test
npm run typecheck && npm run build
npm run db:generate                   # buat migrasi dari src/db/schema.ts
```

Server berjalan tanpa `DATABASE_URL`; hanya `/api/ready` yang menjawab 503.

### Layanan kompilasi

Butuh toolchain AVR di server: `sudo apt install gcc-avr avr-libc binutils-avr arduino-core-avr` (atau pakai `server/Dockerfile`, belum diuji build-nya). Jalankan server dan `npm run dev` di `web/` (Vite meneruskan `/api` ke port 8080). Pengaturan: `COMPILE_AVR_DIR`, `COMPILE_CACHE_DIR`, `COMPILE_TIMEOUT_MS`, `COMPILE_CONCURRENCY`, `COMPILE_RATE_LIMIT`, `TRUST_PROXY` (lihat `.env.example`).

Keamanan: kode pengguna dicek dulu (ukuran, header yang diizinkan, tanpa `asm`), dijalankan tanpa shell dengan batas waktu, memori, dan antrean, plus pembatasan per klien. Pemeriksaan itu hanya lapisan tambahan; **di produksi jalankan layanan ini dalam container terisolasi** (tanpa rahasia dan jaringan keluar, filesystem read-only kecuali direktori cache).

## Struktur

```
web/src/
  components/   definisi komponen IoT (port, properti, perilaku)
    boards/     gambar SVG papan mikrokontroler
  sim/          engine simulasi, runner, dan bahasa program papan (firmware.ts)
  emu/          emulator Arduino Uno (avr8js): parser HEX, mesin, sesi waktu nyata, Web Worker, klien compile
  editor/       kanvas, palet, panel properti, toolbar, store, penyimpanan
  ui/           ikon, notifikasi, dan tata letak panel (lebar, buka/tutup)
  pages/        halaman editor
server/         API TypeScript (Hono + Drizzle) dan layanan kompilasi Arduino (src/compile)
docs/           blueprint
```
