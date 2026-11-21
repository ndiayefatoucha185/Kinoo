/**
 * Réduit une image choisie par l'utilisateur en avatar carré (256 px, JPEG).
 * Le serveur n'accepte que de petits avatars (≈ 200 Ko) : sans cette étape, une photo de téléphone
 * (plusieurs Mo) serait refusée à l'inscription ou à la mise à jour du profil.
 */
export function fileToAvatarDataUrl(file: File, size = 256, quality = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('Le fichier sélectionné n’est pas une image.'));
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas indisponible');
        // Recadrage centré (cover)
        const side = Math.min(img.width, img.height);
        const sx = (img.width - side) / 2;
        const sy = (img.height - side) / 2;
        ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
        resolve(canvas.toDataURL('image/jpeg', quality));
      } catch (err) {
        reject(err);
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Image illisible.'));
    };
    img.src = url;
  });
}
