import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AVATAR_PHOTO, DOCUMENT_PHOTO, RECEIPT_PHOTO, preparePhoto, targetSize } from './image-upload'

// jsdom no sabe decodificar imágenes ni tiene canvas de verdad: se sustituyen
// por dobles que apuntan, en orden, qué se les pidió.
const steps: Array<{ op: string; args: unknown[] }> = []
let decoded: { width: number; height: number } | null
const close = vi.fn()

beforeEach(() => {
  steps.length = 0
  decoded = { width: 4000, height: 3000 }
  close.mockClear()

  vi.stubGlobal('createImageBitmap', vi.fn(async () => {
    if (!decoded) throw new DOMException('The source image could not be decoded.', 'InvalidStateError')
    return { ...decoded, close }
  }))

  const context = {
    set fillStyle(value: string) { steps.push({ op: 'fillStyle', args: [value] }) },
    fillRect: (...args: unknown[]) => { steps.push({ op: 'fillRect', args }) },
    drawImage: (...args: unknown[]) => { steps.push({ op: 'drawImage', args }) },
  }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (this: HTMLCanvasElement, callback: BlobCallback, type?: string, quality?: unknown) {
    steps.push({ op: 'toBlob', args: [this.width, this.height, type, quality] })
    callback(new Blob(['jpeg'], { type: type ?? '' }))
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const upload = (type = 'image/png') => new File(['x'], 'IMG_2031.png', { type })
const encoded = () => steps.find((step) => step.op === 'toBlob')?.args
const indexOf = (op: string) => steps.findIndex((step) => step.op === op)

describe('Fotos antes de subir', () => {
  it('Un documento se queda en 1600 de ancho, como en la app', async () => {
    await preparePhoto(upload(), DOCUMENT_PHOTO, 'cedula')
    expect(encoded()).toEqual([1600, 1200, 'image/jpeg', 0.8])
  })

  it('El avatar cabe en 800×800 por los dos lados', async () => {
    decoded = { width: 1000, height: 2000 }
    await preparePhoto(upload(), AVATAR_PHOTO, 'perfil')
    expect(encoded()).toEqual([400, 800, 'image/jpeg', 0.82])
  })

  it('El comprobante solo se limita a lo ancho: una captura alta sigue legible', async () => {
    decoded = { width: 1080, height: 2400 }
    await preparePhoto(upload(), RECEIPT_PHOTO, 'viaje')
    expect(encoded()).toEqual([1080, 2400, 'image/jpeg', 0.85])
  })

  it('Nunca amplía una foto pequeña', async () => {
    decoded = { width: 500, height: 400 }
    await preparePhoto(upload(), AVATAR_PHOTO, 'perfil')
    expect(encoded()?.slice(0, 2)).toEqual([500, 400])
  })

  it('Sale siempre JPEG con el nombre pedido, aunque entre un PNG', async () => {
    const result = await preparePhoto(upload('image/png'), DOCUMENT_PHOTO, 'cedula')
    expect(result.type).toBe('image/jpeg')
    expect(result.name).toBe('cedula.jpg')
  })

  it('Pinta fondo blanco antes que la foto, para que un PNG transparente no salga negro', async () => {
    await preparePhoto(upload(), DOCUMENT_PHOTO, 'cedula')
    expect(steps[indexOf('fillStyle')].args).toEqual(['#fff'])
    expect(indexOf('fillRect')).toBeLessThan(indexOf('drawImage'))
  })

  it('Mide lo que va a quedar: una panorámica acaba por debajo de 600 y se rechaza con sus medidas', async () => {
    decoded = { width: 4000, height: 1000 }
    await expect(preparePhoto(upload(), DOCUMENT_PHOTO, 'matricula')).rejects.toThrow(
      'Esa foto es demasiado pequeña (1600×400). Tiene que medir al menos 600 píxeles de lado para que se lea.',
    )
    expect(encoded()).toBeUndefined()
  })

  it('El avatar no tiene suelo: una foto de 300 px vale', async () => {
    decoded = { width: 300, height: 300 }
    await expect(preparePhoto(upload(), AVATAR_PHOTO, 'perfil')).resolves.toBeInstanceOf(File)
  })

  it('Un archivo que no es una foto dice eso, no un error del navegador', async () => {
    decoded = null
    await expect(preparePhoto(upload('image/heic'), DOCUMENT_PHOTO, 'cedula')).rejects.toThrow(
      'Ese archivo no es una foto que podamos leer.',
    )
  })

  it('Libera la imagen decodificada también cuando la rechaza', async () => {
    decoded = { width: 200, height: 200 }
    await expect(preparePhoto(upload(), DOCUMENT_PHOTO, 'cedula')).rejects.toThrow()
    expect(close).toHaveBeenCalledOnce()
  })

  it('Redondea a píxeles enteros', () => {
    expect(targetSize(3001, 2001, DOCUMENT_PHOTO)).toEqual({ width: 1600, height: 1067 })
  })
})
