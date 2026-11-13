// Image helpers. Everything runs in the browser; nothing is uploaded here.

export interface PixelCrop {
  x: number
  y: number
  width: number
  height: number
}

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('This photo could not be opened. Try a JPG or PNG.'))
    img.src = url
  })
}

/**
 * Crops the photo and saves it as a fresh JPEG.
 * Drawing onto a canvas and re-encoding drops all metadata (GPS location,
 * camera model, date), so none of it is shared.
 *
 * Output resolution is the crop's own pixels, capped at 600 dpi for the
 * chosen print width (higher is invisible in print and only makes files bigger).
 */
export async function cropToJpeg(
  img: HTMLImageElement,
  crop: PixelCrop,
  printWidthMm: number,
  printHeightMm: number,
): Promise<Blob> {
  const maxW = Math.round((printWidthMm / 25.4) * 600)
  const outW = Math.max(1, Math.min(Math.round(crop.width), maxW))
  const outH = Math.max(1, Math.round((outW * printHeightMm) / printWidthMm))

  const canvas = document.createElement('canvas')
  canvas.width = outW
  canvas.height = outH
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Your browser cannot process images')
  ctx.fillStyle = '#ffffff' // transparent PNGs get a white background
  ctx.fillRect(0, 0, outW, outH)
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, crop.x, crop.y, crop.width, crop.height, 0, 0, outW, outH)

  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.92))
  canvas.width = canvas.height = 0
  if (!blob) throw new Error('Could not prepare the photo')
  return blob
}

/** Effective print resolution of an image printed at the given width. */
export function dpiFor(pixelWidth: number, printWidthMm: number) {
  return Math.round(pixelWidth / (printWidthMm / 25.4))
}
