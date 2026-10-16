export const MAX_VIDEO_DURATION_SEC = 3 * 3600; // 10800 secondes = 3 heures
export const MAX_SUBTITLE_FILE_SIZE_BYTES = 2 * 1024 * 1024; // 2 Mo max pour fichier .srt / .vtt

export function extractYouTubeId(url: string): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  // Standard matching for youtube.com/watch?v=, youtu.be/, youtube.com/embed/, youtube.com/shorts/
  const match = trimmed.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([\w-]{11})/);
  return match ? match[1] : null;
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'Ko', 'Mo', 'Go'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export function formatDuration(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '00:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h} h ${m < 10 ? '0' : ''}${m} min`;
  }
  return `${m} min ${s < 10 ? '0' : ''}${s} s`;
}

/**
 * Nettoie et convertit un contenu de sous-titres (.srt ou .vtt) en format WebVTT 100% texte brut.
 * - Supprime rigoureusement toutes les balises HTML/XML (<font>, <b>, <i>, <u>, <v>, <c>, <script>, <iframe>, etc.).
 * - Décode les entités HTML sans jamais réinterpréter de code.
 * - Normalise les millisecondes SRT (virgules) en points conformes WebVTT.
 * - Garantit un en-tête WEBVTT standard et valide.
 */
export function sanitizeSubtitlesToPlainVtt(rawText: string): string {
  if (!rawText) return 'WEBVTT\n\n';

  // 1. Normalisation des sauts de ligne
  let clean = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // 2. Conversion des virgules SRT en points millisecondes (ex: 00:01:20,000 --> 00:01:20.000)
  clean = clean.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');

  // 3. Purge complète des blocs de scripts ou styles potentiellement injectés
  clean = clean.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  clean = clean.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');

  // 4. Texte brut strict : purge de toute balise HTML / XML
  clean = clean.replace(/<[^>]+>/g, '');

  // 4. Décodage sécurisé des entités HTML vers texte brut
  clean = clean
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');

  // Double vérification anti-injection (défense en profondeur)
  clean = clean.replace(/<[^>]+>/g, '');

  if (clean.startsWith('WEBVTT')) {
    return clean.trim() + '\n';
  }

  return `WEBVTT\n\n${clean.trim()}\n`;
}

export const convertSrtToVtt = sanitizeSubtitlesToPlainVtt;
