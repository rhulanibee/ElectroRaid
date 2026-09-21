/**
 * Repair evidence photo rules for the technician handset.
 *
 * The photo itself stays with the repair on the device; only its metadata is
 * written to the repair's audit record (matching how investigation evidence is
 * referenced by `addEvidence`).
 */

/** Prototype cap — keeps a field photo inside the handset's repair form state. */
export const REPAIR_PHOTO_MAX_BYTES = 5 * 1024 * 1024;

/** JPG / JPEG, PNG and WEBP only. */
export const REPAIR_PHOTO_ACCEPT = "image/jpeg,image/jpg,image/png,image/webp";

const ACCEPTED_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

const ACCEPTED_EXTENSION = /\.(jpe?g|png|webp)$/i;

/** A photo picked on the handset, held with the repair until sign-off. */
export interface RepairPhoto {
  dataUri: string;
  name: string;
  type: string;
  bytes: number;
}

/** What the API stores for the repair — never the image bytes. */
export type RepairPhotoMeta = Omit<RepairPhoto, "dataUri">;

/** The part of a picked file that validation needs (a browser File satisfies this). */
export interface PickedFile {
  name: string;
  type: string;
  size: number;
}

export function photoMegabytes(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(1);
}

/**
 * `null` when the picked file can be attached, otherwise the message to show
 * the technician.
 */
export function repairPhotoError(file: PickedFile): string | null {
  const isImage = file.type
    ? ACCEPTED_MIME.has(file.type)
    : ACCEPTED_EXTENSION.test(file.name);
  if (!isImage) {
    return "That file is not a photo. Attach a JPG, PNG or WEBP image.";
  }
  if (file.size > REPAIR_PHOTO_MAX_BYTES) {
    return `That photo is ${photoMegabytes(file.size)} MB. Attach one under ${Math.round(
      REPAIR_PHOTO_MAX_BYTES / 1024 / 1024,
    )} MB.`;
  }
  return null;
}

export function repairPhotoMeta(photo: RepairPhoto): RepairPhotoMeta {
  return { name: photo.name, type: photo.type, bytes: photo.bytes };
}
