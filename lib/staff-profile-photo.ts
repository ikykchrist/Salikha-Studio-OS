export const staffPhotoMaxBytes = 80 * 1024;
export const staffPhotoMaxEdge = 384;

export async function compressStaffPhoto(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file.");
  if (file.size > 25 * 1024 * 1024) throw new Error("Choose a photo smaller than 25 MB.");

  const source = URL.createObjectURL(file);
  const image = new Image();
  image.src = source;
  try {
    await image.decode().catch(() => { throw new Error("This image couldn't be opened. Try a JPEG, PNG, or WebP."); });
    const scale = Math.min(1, staffPhotoMaxEdge / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Photo compression is unavailable in this browser.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const prefix = "data:image/jpeg;base64,";
    const maxEncodedLength = Math.ceil(staffPhotoMaxBytes / 3) * 4;
    for (const quality of [0.84, 0.7, 0.55, 0.4]) {
      const dataUrl = canvas.toDataURL("image/jpeg", quality);
      const encoded = dataUrl.slice(prefix.length);
      const padding = encoded.endsWith("==") ? 2 : encoded.endsWith("=") ? 1 : 0;
      if (dataUrl.startsWith(prefix) && encoded.length <= maxEncodedLength && encoded.length * 3 / 4 - padding <= staffPhotoMaxBytes) {
        return dataUrl;
      }
    }
    throw new Error("Couldn't compress this photo under 80 KB. Try a different image.");
  } finally {
    URL.revokeObjectURL(source);
  }
}
