/**
 * Prepara una foto antes de subirla a Storage, con los mismos números que la app.
 *
 * La app reduce todas las fotos al elegirlas (`image_picker` con `maxWidth` e
 * `imageQuality`); la web las subía tal cual salían del teléfono, hasta 5 MB
 * cada una. Con el bucket gratuito de 1 GB, eso son unas doscientas fotos.
 *
 * Y no es solo el peso. Una foto de cámara lleva en sus metadatos (EXIF) las
 * coordenadas de donde se tomó, y el bucket `avatares` es público: subirla tal
 * cual es publicar dónde vive quien se hizo la foto en casa. Volver a dibujarla
 * en un canvas la deja sin metadatos, así que se hace siempre, aunque ya pese
 * poco.
 */

export interface PhotoLimits {
  /** Ancho máximo. Se reduce manteniendo la proporción; nunca se amplía. */
  maxWidth: number
  /** Alto máximo, si lo hay. La app solo lo fija para el avatar. */
  maxHeight?: number
  /** Calidad JPEG, de 0 a 1. */
  quality: number
  /** Lado mínimo que tiene que quedar para que se pueda leer. */
  minSide?: number
}

/** `settings_screen.dart`: 800×800, calidad 82. Se ve a 60 px. */
export const AVATAR_PHOTO: PhotoLimits = { maxWidth: 800, maxHeight: 800, quality: 0.82 }

/** `driver_profile_screen.dart`, y el suelo de `FleetService._ladoMinimo`. */
export const DOCUMENT_PHOTO: PhotoLimits = { maxWidth: 1600, quality: 0.8, minSide: 600 }

/**
 * `transfer_sheet.dart`. Solo a lo ancho: un comprobante suele ser una captura
 * de pantalla alta y estrecha, y limitarla a lo alto dejaría el texto ilegible.
 */
export const RECEIPT_PHOTO: PhotoLimits = { maxWidth: 1600, quality: 0.85 }

/** El tamaño al que queda una foto con esos límites. */
export function targetSize(width: number, height: number, limits: PhotoLimits): { width: number; height: number } {
  const scale = Math.min(1, limits.maxWidth / width, limits.maxHeight ? limits.maxHeight / height : 1)
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}

/**
 * Devuelve la foto reducida y en JPEG, lista para subir como `<name>.jpg`.
 *
 * Siempre JPEG, entre otras cosas para que la ruta en el bucket no cambie de
 * extensión: `cedula.png` y luego `cedula.jpg` son dos archivos, y el primero
 * se queda ahí sin que ninguna fila lo nombre.
 */
export async function preparePhoto(file: File, limits: PhotoLimits, name: string): Promise<File> {
  let bitmap: ImageBitmap
  try {
    // `from-image` gira la foto según su EXIF antes de dibujarla. Sin eso, al
    // quitarle los metadatos una foto vertical del móvil saldría tumbada.
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    throw new Error('Ese archivo no es una foto que podamos leer.')
  }

  try {
    const { width, height } = targetSize(bitmap.width, bitmap.height, limits)
    // Se mide lo que va a quedar, no lo que llegó, igual que la app: una
    // panorámica de 4000×1000 pasa del suelo, pero a 1600 de ancho se queda en
    // 400 de alto y no se lee.
    if (limits.minSide && (width < limits.minSide || height < limits.minSide)) {
      throw new Error(
        `Esa foto es demasiado pequeña (${width}×${height}). Tiene que medir al menos ${limits.minSide} píxeles de lado para que se lea.`,
      )
    }

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Tu navegador no pudo preparar la foto.')

    // JPEG no tiene transparencia: lo transparente de un PNG saldría negro.
    context.fillStyle = '#fff'
    context.fillRect(0, 0, width, height)
    context.drawImage(bitmap, 0, 0, width, height)

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', limits.quality))
    if (!blob) throw new Error('Tu navegador no pudo preparar la foto.')
    return new File([blob], `${name}.jpg`, { type: 'image/jpeg' })
  } finally {
    bitmap.close()
  }
}
