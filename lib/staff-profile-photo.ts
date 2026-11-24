export const staffPhotoMaxBytes = 80 * 1024;
export const staffPhotoMaxEdge = 384;

export type StaffPhotoFraming = { x: number; y: number; zoom: number };
export const centeredStaffPhoto: StaffPhotoFraming = { x: 0, y: 0, zoom: 1 };

export function staffPhotoFrame(width: number, height: number, framing: StaffPhotoFraming) {
  const scale = framing.zoom / Math.min(width, height);
  const w = width * scale;
  const h = height * scale;
  const limitX = (w - 1) / 2;
  const limitY = (h - 1) / 2;
  const x = Math.max(-limitX, Math.min(limitX, framing.x));
  const y = Math.max(-limitY, Math.min(limitY, framing.y));
  return { width: w, height: h, left: x - limitX, top: y - limitY, x, y };
}

export function compressStaffPhoto(image: HTMLImageElement, framing: StaffPhotoFraming): string {
  const { naturalWidth, naturalHeight } = image;
  const frame = staffPhotoFrame(naturalWidth, naturalHeight, framing);
  const edge = Math.max(1, Math.min(staffPhotoMaxEdge, Math.round(Math.min(naturalWidth, naturalHeight) / framing.zoom)));
  const canvas = document.createElement("canvas");
  canvas.width = edge;
  canvas.height = edge;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Photo compression is unavailable in this browser.");

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, edge, edge);
  context.drawImage(image, frame.left * edge, frame.top * edge, frame.width * edge, frame.height * edge);
  const prefix = "data:image/jpeg;base64,";
  for (const quality of [0.84, 0.7, 0.55, 0.4]) {
    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    const encoded = dataUrl.slice(prefix.length);
    const padding = encoded.endsWith("==") ? 2 : encoded.endsWith("=") ? 1 : 0;
    if (dataUrl.startsWith(prefix) && encoded.length * 3 / 4 - padding <= staffPhotoMaxBytes) return dataUrl;
  }
  throw new Error("Couldn't compress this photo under 80 KB. Try a different image.");
}
