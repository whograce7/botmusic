# Luxury Telegram Music & Downloader Bot (Node >=20)

Bot Telegram untuk memutar dan mengunduh media dari YouTube, Spotify (melalui pencarian YouTube), TikTok, Instagram menggunakan Node.js 20+.

Fitur utama:
- /play <query|url> — mainkan audio (YouTube, Spotify (via search), TikTok, Instagram)
- /download <url> — unduh video/audio dari YouTube/TikTok/Instagram
- Inline buttons untuk download/play saat kirim URL di chat

Persyaratan
- Node.js >= 20
- NPM atau pnpm
- Token bot Telegram (dari @BotFather)

Instalasi
1. Clone / masuk ke folder
2. Pasang dependency:
   npm install
3. Set environment variable token:
   export TELEGRAM_TOKEN="123456:ABC-DEF..."
   (di Windows PowerShell: $env:TELEGRAM_TOKEN="...")
4. Jalankan:
   npm start

Catatan teknis & troubleshooting
- Kode menggunakan `yt-dlp-exec` untuk memanggil yt-dlp; paket ini akan mengunduh binary yt-dlp yang sesuai. `ffmpeg-static` menyediakan ffmpeg statis sehingga tidak perlu instal ffmpeg manual biasanya.
- Jika terjadi error saat menjalankan yt-dlp (mis. binary tidak dieksekusi karena permission), jalankan lagi `npm i` dan pastikan folder project dapat menjalankan binary dari node_modules/.bin.
- Telegram memiliki batasan ukuran file untuk pengiriman menggunakan bot; saat ini bot dapat mengirim sampai 2GB tergantung akun, namun hosting Anda mungkin memiliki batas memori/ukuran file sementara.
- Untuk Spotify: bot mengambil judul via oEmbed (tanpa auth) dan mencari padanan di YouTube; tidak mendownload dari Spotify langsung (kebijakan Spotify).

Keamanan & legal
- Pastikan Anda mematuhi kebijakan hak cipta ketika mengunduh atau membagikan media.
- Jangan menyimpan token Telegram di repositori publik.

Jika Anda ingin saya:
- Menambahkan dukungan queue / playlist (untuk voice chat atau group).
- Menambahkan opsi kualitas (low/medium/high).
- Menambahkan Dockerfile untuk deployment.
Beritahu saya mana yang diinginkan, saya akan tambahkan.
