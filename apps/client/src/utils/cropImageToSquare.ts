/**
 * Crops an image to a square by taking the center portion.
 * Uses Canvas API for client-side processing.
 * @param file - Original image file
 * @param type - Output MIME type (default: image/jpeg)
 * @param quality - Output quality 0-1 (default: 0.92)
 * @returns Promise<File> - Cropped square image file
 */
export async function cropImageToSquare(
  file: File,
  type: string = "image/jpeg",
  quality: number = 0.92
): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      const { width, height } = img;
      const size = Math.min(width, height);
      const offsetX = (width - size) / 2;
      const offsetY = (height - size) / 2;

      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("No se pudo obtener el contexto del canvas"));
        return;
      }

      ctx.drawImage(img, offsetX, offsetY, size, size, 0, 0, size, size);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("No se pudo generar la imagen recortada"));
            return;
          }
          const croppedFile = new File([blob], file.name, {
            type,
            lastModified: Date.now(),
          });
          resolve(croppedFile);
        },
        type,
        quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("No se pudo cargar la imagen"));
    };

    img.src = url;
  });
}
