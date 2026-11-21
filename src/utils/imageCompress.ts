/** Réduit une photo (côté navigateur) pour qu'elle reste légère : JPEG, 1 024 px max, moins de ~220 Ko. */
export async function compressImage(file: File, maxSide = 1024, maxChars = 280_000): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Ce fichier n’est pas une image.');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('Image illisible.'));
      i.src = url;
    });
    let side = maxSide;
    for (let attempt = 0; attempt < 5; attempt++) {
      const ratio = Math.min(1, side / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.width * ratio));
      canvas.height = Math.max(1, Math.round(img.height * ratio));
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Compression impossible sur ce navigateur.');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      for (const q of [0.7, 0.55, 0.4]) {
        const data = canvas.toDataURL('image/jpeg', q);
        if (data.length <= maxChars) return data;
      }
      side = Math.round(side * 0.75);
    }
    throw new Error('Photo trop lourde, choisissez-en une plus petite.');
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function mapsLink(place?: string | null, lat?: number | null, lng?: number | null): string | null {
  if (typeof lat === 'number' && typeof lng === 'number') {
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  }
  if (place) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}`;
  return null;
}
