import process from 'process';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs/promises';
import { Telegraf, Markup } from 'telegraf';
import { ytDlpWrap } from 'yt-dlp-exec';
import ffmpegPath from 'ffmpeg-static';
import { file as tmpFile } from 'tmp-promise';
import yts from 'yt-search';
import fetch from 'node-fetch';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Environment & runtime checks ---
const minNodeMajor = 20;
const nodeVer = process.versions.node.split('.')[0];
if (Number(nodeVer) < minNodeMajor) {
  console.error(`Node.js ${minNodeMajor} or higher is required. Current: ${process.versions.node}`);
  process.exit(1);
}

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
if (!TELEGRAM_TOKEN) {
  console.error('Missing TELEGRAM_TOKEN environment variable. Export your bot token first.');
  process.exit(1);
}

// --- init ---
const bot = new Telegraf(TELEGRAM_TOKEN);

// yt-dlp wrapper (makes calling the yt-dlp binary easier)
const ytdlp = ytDlpWrap();

// helper: is URL of platform
const isUrl = (s) => {
  try { new URL(s); return true; } catch { return false; }
};
const isYouTube = (s) => /(?:youtube\.com\/watch|youtu\.be\/)/i.test(s);
const isSpotify = (s) => /open\.spotify\.com\/(track|album|playlist)\/?/i.test(s);
const isTikTok = (s) => /tiktok\.com\/@|vt\.tiktok\.com|tiktok\.com\/i\//i.test(s);
const isInstagram = (s) => /instagram\.com\/p\/|instagram\.com\/reel\/|instagr\.am\//i.test(s);

// helper: search YouTube by query -> returns first url
async function searchYouTube(query) {
  const r = await yts(query);
  const first = r && r.videos && r.videos.length ? r.videos[0] : null;
  return first ? first.url : null;
}

// helper: get spotify oembed title (no auth)
async function spotifyTitleFromUrl(url) {
  try {
    const oembed = `https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`;
    const res = await fetch(oembed);
    if (!res.ok) return null;
    const j = await res.json();
    // j.title typically "Artist — Track"
    return j.title || null;
  } catch (e) { return null; }
}

// download with yt-dlp into a temp file
async function downloadWithYtDlp(url, options = {}) {
  // options: {extractAudio: bool, audioFormat: 'mp3'|'m4a', video: bool}
  const tmp = await tmpFile({ postfix: options.extractAudio ? '.mp3' : '.mp4' });
  const outPath = tmp.path;

  // construct args
  const ytdlpArgs = [];

  if (options.extractAudio) {
    ytdlpArgs.push('--extract-audio');
    ytdlpArgs.push('--audio-format', options.audioFormat || 'mp3');
    ytdlpArgs.push('--audio-quality', '0'); // best
    ytdlpArgs.push('--format', 'bestaudio');
  } else if (options.video) {
    // best video+audio muxed if possible
    ytdlpArgs.push('-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best');
  } else {
    ytdlpArgs.push('-f', 'bestaudio/best');
  }

  ytdlpArgs.push('--output', outPath);
  // ensure ffmpeg from ffmpeg-static is used
  if (ffmpegPath) {
    ytdlpArgs.push('--ffmpeg-location', ffmpegPath);
  }

  try {
    await ytdlp(url, ytdlpArgs);
    return { path: outPath, cleanup: tmp.cleanup };
  } catch (err) {
    // cleanup file if created
    try { await fs.unlink(outPath); } catch {}
    throw err;
  }
}

// --- Bot commands ---
bot.start((ctx) => {
  return ctx.reply(
    `Halo! Saya bot musik. Perintah utama:\n` +
    `/play <query|url> - mainkan/unduh audio dari YouTube/Spotify/TikTok/Instagram\n` +
    `/download <url> - unduh video/audio dari YouTube/TikTok/Instagram\n` +
    `/help - lihat panduan singkat`
  );
});

bot.help((ctx) => {
  return ctx.reply(
    `Panduan singkat:\n` +
    "- /play <query|url>\n  * Jika masukkan adalah query biasa -> mencari di YouTube & mengunduh audio terbaik.\n  * Jika masukkan Spotify URL -> ambil title via oEmbed lalu cari di YouTube.\n  * Jika YouTube/TikTok/Instagram URL -> unduh audio terbaik dan kirim.\n\n" +
    "- /download <url>\n  * Mendownload video (jika tersedia) atau audio dengan kualitas terbaik.\n\nBatas Telegram untuk file besar mungkin berlaku (bot dapat mengirim sampai 2GB tergantung akun)."
  );
});

bot.command('play', async (ctx) => {
  const text = ctx.message.text.split(' ').slice(1).join(' ').trim();
  if (!text) return ctx.reply('Gunakan: /play <query atau url>');

  await ctx.reply('Memproses permintaan... Mohon tunggu — ini bisa beberapa detik sampai beberapa menit tergantung ukuran.');

  try {
    let targetUrl = text;
    if (!isUrl(text)) {
      // treat as search query -> search YouTube
      const found = await searchYouTube(text);
      if (!found) return ctx.reply('Tidak menemukan hasil di YouTube untuk query itu.');
      targetUrl = found;
    } else if (isSpotify(text)) {
      // get title and search on YouTube
      const title = await spotifyTitleFromUrl(text);
      if (!title) return ctx.reply('Gagal mendapatkan info dari Spotify. Coba kirim query atau URL lain.');
      const found = await searchYouTube(title);
      if (!found) return ctx.reply(`Gagal menemukan padanan YouTube untuk: ${title}`);
      targetUrl = found;
    }

    // For all cases we'll download audio (mp3)
    const { path: filePath, cleanup } = await downloadWithYtDlp(targetUrl, { extractAudio: true, audioFormat: 'mp3' });

    // send audio
    await ctx.replyWithAudio({ source: filePath }, { title: path.basename(filePath) });
    await cleanup();
  } catch (err) {
    console.error('play error:', err);
    return ctx.reply('Terjadi kesalahan saat mengunduh atau mengonversi media. Lihat log pada server.');
  }
});

bot.command('download', async (ctx) => {
  const text = ctx.message.text.split(' ').slice(1).join(' ').trim();
  if (!text) return ctx.reply('Gunakan: /download <url>');
  if (!isUrl(text)) return ctx.reply('Masukkan harus URL yang valid.');

  await ctx.reply('Memproses unduhan...');

  try {
    // If it's a video-capable source, request video; otherwise fallback to audio
    const wantVideo = isYouTube(text) || isTikTok(text) || isInstagram(text);
    const { path: filePath, cleanup } = await downloadWithYtDlp(text, { video: wantVideo, extractAudio: !wantVideo });

    // choose sending method
    const stats = await fs.stat(filePath);
    const sizeMB = (stats.size / (1024 * 1024)).toFixed(1);
    // send as video if mp4 else as document
    if (filePath.endsWith('.mp4') || filePath.endsWith('.mkv')) {
      await ctx.replyWithVideo({ source: filePath }, { caption: `Ukuran: ${sizeMB} MB` });
    } else if (filePath.endsWith('.mp3') || filePath.endsWith('.m4a')) {
      await ctx.replyWithAudio({ source: filePath }, { caption: `Ukuran: ${sizeMB} MB` });
    } else {
      // fallback to general document
      await ctx.replyWithDocument({ source: filePath }, { caption: `Ukuran: ${sizeMB} MB` });
    }

    await cleanup();
  } catch (err) {
    console.error('download error:', err);
    return ctx.reply('Gagal mengunduh media. Mungkin url tidak didukung atau ada masalah jaringan.');
  }
});

// fallback for plain messages: treat as quick play query
bot.on('message', async (ctx) => {
  const txt = ctx.message.text || '';
  // ignore commands
  if (txt.startsWith('/')) return;
  // small heuristic: if message contains a known URL, offer download button
  const urls = txt.match(/https?:\/\/\S+/g);
  if (urls && urls.length) {
    const u = urls[0];
    await ctx.reply(
      `Saya menemukan URL: ${u}`,
      Markup.inlineKeyboard([
        Markup.button.callback('Download', `download:${u}`),
        Markup.button.callback('Play (Audio)', `play:${u}`)
      ])
    );
    return;
  }

  // otherwise offer to search on YouTube
  await ctx.reply(`Mencari & memutar dari YouTube: "${txt}" ...`);
  try {
    const found = await searchYouTube(txt);
    if (!found) return ctx.reply('Tidak menemukan hasil di YouTube.');
    const { path: filePath, cleanup } = await downloadWithYtDlp(found, { extractAudio: true, audioFormat: 'mp3' });
    await ctx.replyWithAudio({ source: filePath }, { title: path.basename(filePath) });
    await cleanup();
  } catch (err) {
    console.error('message handler error', err);
    await ctx.reply('Terjadi kesalahan saat memproses pesan Anda.');
  }
});

// action handlers for inline buttons
bot.action(/download:(.+)/, async (ctx) => {
  const url = ctx.match[1];
  await ctx.answerCbQuery('Mulai mengunduh...');
  try {
    await ctx.reply('Memproses unduhan dari tombol...');
    const { path: filePath, cleanup } = await downloadWithYtDlp(url, { video: true, extractAudio: false });
    await ctx.replyWithVideo({ source: filePath });
    await cleanup();
  } catch (err) {
    console.error('action download error', err);
    await ctx.reply('Gagal mengunduh.');
  }
});
bot.action(/play:(.+)/, async (ctx) => {
  const url = ctx.match[1];
  await ctx.answerCbQuery('Mulai memutar (mengunduh audio)...');
  try {
    const { path: filePath, cleanup } = await downloadWithYtDlp(url, { extractAudio: true, audioFormat: 'mp3' });
    await ctx.replyWithAudio({ source: filePath });
    await cleanup();
  } catch (err) {
    console.error('action play error', err);
    await ctx.reply('Gagal memutar.');
  }
});

// global error handling
bot.catch((err) => {
  console.error('Global bot error:', err);
});

(async () => {
  try {
    await bot.launch();
    console.log('Bot berjalan. Node versi', process.versions.node);
    console.log('Pastikan TELEGRAM_TOKEN diset pada environment.');
  } catch (e) {
    console.error('Gagal menjalankan bot:', e);
    process.exit(1);
  }
})();

// graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
