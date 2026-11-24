"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { centeredStaffPhoto, compressStaffPhoto, staffPhotoFrame, type StaffPhotoFraming } from "../lib/staff-profile-photo";

export type StaffPhotoDraft = { source: File | string; framing: StaffPhotoFraming };

export function StaffPhotoEditor({ draft, onCancel, onApply }: {
  draft: StaffPhotoDraft;
  onCancel: () => void;
  onApply: (photo: string, framing: StaffPhotoFraming) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const drag = useRef<{ id: number; x: number; y: number; size: number; start: StaffPhotoFraming } | null>(null);
  const [image, setImage] = useState<HTMLImageElement>();
  const [error, setError] = useState("");
  const [framing, setFraming] = useState(draft.framing);

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  useEffect(() => {
    const file = typeof draft.source === "string" ? null : draft.source;
    if (file && (!file.type.startsWith("image/") || file.size > 25 * 1024 * 1024)) {
      setError(file.type.startsWith("image/") ? "Choose a photo smaller than 25 MB." : "Choose an image file.");
      return;
    }

    let active = true;
    const objectUrl = file ? URL.createObjectURL(file) : null;
    const photo = new Image();
    photo.src = objectUrl ?? String(draft.source);
    void photo.decode().then(() => {
      if (!active) return;
      if (photo.naturalWidth && photo.naturalHeight) setImage(photo);
      else setError("This image has no visible dimensions.");
    }).catch(() => {
      if (active) setError("This image couldn't be opened. Try a JPEG, PNG, or WebP.");
    });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [draft.source]);

  const frame = image ? staffPhotoFrame(image.naturalWidth, image.naturalHeight, framing) : null;

  function adjust(next: StaffPhotoFraming) {
    if (!image) return;
    const { x, y } = staffPhotoFrame(image.naturalWidth, image.naturalHeight, next);
    setFraming({ ...next, x, y });
  }

  function startDrag(event: PointerEvent<HTMLDivElement>) {
    if (!event.isPrimary || event.button !== 0 || !frame) return;
    const size = event.currentTarget.getBoundingClientRect().width;
    if (!size) return;
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, size, start: { ...framing, x: frame.x, y: frame.y } };
  }

  function move(event: PointerEvent<HTMLDivElement>) {
    const origin = drag.current;
    if (!origin || origin.id !== event.pointerId) return;
    adjust({
      zoom: origin.start.zoom,
      x: origin.start.x + (event.clientX - origin.x) / origin.size,
      y: origin.start.y + (event.clientY - origin.y) / origin.size,
    });
  }

  function stopDrag(event: PointerEvent<HTMLDivElement>) {
    if (drag.current?.id === event.pointerId) drag.current = null;
  }

  function nudge(event: KeyboardEvent<HTMLDivElement>) {
    const directions: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
    };
    const direction = directions[event.key];
    if (!direction || !frame) return;
    event.preventDefault();
    const step = event.shiftKey ? 0.08 : 0.025;
    adjust({ ...framing, x: frame.x + direction[0] * step, y: frame.y + direction[1] * step });
  }

  function apply() {
    if (!image || !frame) return;
    try {
      const applied = { ...framing, x: frame.x, y: frame.y };
      onApply(compressStaffPhoto(image, applied), applied);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Couldn't process the photo.");
    }
  }

  return <dialog ref={dialog} className="staff-photo-editor" aria-labelledby="staff-photo-title" onCancel={(event) => {
    event.preventDefault();
    onCancel();
  }}>
    <h2 id="staff-photo-title">Adjust profile photo</h2>
    <p id="staff-photo-help">Drag or use the arrow keys to reposition. Use the slider to zoom.</p>
    {image && frame ? <>
      <div className="staff-photo-preview" tabIndex={0} role="group" aria-label="Photo framing preview" aria-describedby="staff-photo-help"
        onPointerDown={startDrag} onPointerMove={move} onPointerUp={stopDrag} onPointerCancel={stopDrag} onLostPointerCapture={stopDrag} onKeyDown={nudge}>
        <img src={image.src} alt="" draggable={false} style={{
          width: `${frame.width * 100}%`, height: `${frame.height * 100}%`,
          left: `${frame.left * 100}%`, top: `${frame.top * 100}%`,
        }} />
        <span className="staff-photo-guide" aria-hidden="true" />
      </div>
      <label className="staff-photo-zoom">Zoom
        <input type="range" min={1} max={3} step={0.01} value={framing.zoom}
          onChange={(event) => adjust({ ...framing, zoom: Number(event.currentTarget.value) })} />
      </label>
    </> : !error && <p role="status">Loading photo…</p>}
    {error && <p role="alert">{error}</p>}
    <div className="staff-photo-actions">
      {image && <button type="button" className="text-button" onClick={() => adjust(centeredStaffPhoto)}>Reset framing</button>}
      <button type="button" className="secondary-button" onClick={onCancel}>Cancel</button>
      <button type="button" className="primary-button" disabled={!image} onClick={apply}>Use photo</button>
    </div>
  </dialog>;
}
