import { useRef, useEffect, useCallback } from 'react'
import { useMapStore } from '../store/mapStore'

// Constants

const TILE_SIZE = 512
const MIN_ZOOM = 0.05
const MAX_ZOOM = 32
const ZOOM_FACTOR = 1.15

export default function MapCanvas() {
    const containerRef = useRef(null)
    const canvasRef = useRef(null) // the map canvas

    const pan = useRef({ x: 0, y: 0 })
    const zoom = useRef(1)
    const rafId = useRef(null)
    const dirty = useRef(true)

    // tile cache
    const tileCache = useRef(new Map())
    const tileInFlight = useRef(new Set())

    const pixelData = useRef(null)

    const vizPixelData = useRef(null)
    const vizWorker = useRef(null)
    const fillWorker = useRef(null)

    // interactions
    const isPanning = useRef(false)
    const isDrawing = useRef(false)
    const lastMouse = useRef({ x: 0, y: 0 })

    const {
        mapImage, referenceLayers,
        activeTool, brushColor, brushSize,
        selectProvince, setZoom,
        visualizationMode, provinceData,
    } = useMapStore()

    // Tile Generation (splits large maps into grid to not crash your PC)
    // creates ImageBitmap from pixelData

    const createTile = useCallback((tx, ty, sourcePixels) => {
        const { data, width, height } = sourcePixels
        const x0 = tx * TILE_SIZE, y0 = ty * TILE_SIZE
        const tw = Math.min(TILE_SIZE, width - x0)
        const th = Math.min(TILE_SIZE, height - y0)
        if (tw <= 0 || th <= 0) return null

        const tile = new ImageData(tw, th)
        for (let row = 0; row < th; row++) {
            const srcOff = ((y0 + row) * width + x0) * 4
            const dstOff = row * tw * 4
            tile.data.set(data.subarray(srcOff, srcOff + tw * 4), dstOff)
        }
        return createImageBitmap(tile) // returns Promise<ImageBitmap>
    }, [])

    // invalidate and rebuild tile cache
    const invalidateTiles = useCallback(() => {
        tileCache.current.forEach(bmp => bmp.close?.())
        tileCache.current.clear()
        tileInFlight.current.clear()
        dirty.current = true
        scheduleDraw()
    }, [])

    // draw loop

    const draw = useCallback(() => {
        rafId.current = null
        const canvas = canvasRef.current
        if (!canvas) return
        const ctx = canvas.getContext('2d')

        const { offsetWidth: cw, offsetHeight: ch } = canvas.parentElement
        if (canvas.width !== cw || canvas.height !== ch) {
            canvas.width = cw
            canvas.height = ch
        }

        ctx.clearRect(0, 0, cw, ch)

        if (!mapImage) {
            drawEmpty(ctx, cw, ch)
            return
        }

        const srcPixels = (visualizationMode !== 'default' && vizPixelData.current) ? vizPixelData.current : pixelData.current
        if (!srcPixels) return

        const z = zoom.current
        const px = pan.current.x
        const py = pan.current.y
        const { width: imgW, height: imgH } = srcPixels

        // find out which ones are actually visible
        const tilesX = Math.ceil(imgW / TILE_SIZE)
        const tilesY = Math.ceil(imgH / TILE_SIZE)

        // make viewport rectangle in image space
        const imgLeft = Math.max(0, Math.floor(-px / z / TILE_SIZE))
        const imgTop = Math.max(0, Math.floor(-py / z / TILE_SIZE))
        const imgRight = Math.min(tilesX - 1, Math.ceil((cw-px) / z / TILE_SIZE))
        const imgBottom = Math.min(tilesY - 1, Math.ceil((ch-py) / z / TILE_SIZE))

        ctx.save()
        ctx.imageSmoothingEnabled = z < 1
        ctx.imageSmoothingQuality = 'low'

        for (let ty = imgTop; ty <= imgBottom; ty++) {
            for (let tx = imgLeft; tx <= imgRight; tx++) {
                const key = `${tx}:${ty}`
                const bmp = tileCache.current.get(key)

                if (bmp) {
                    const dx = px + tx * TILE_SIZE * z
                    const dy = py + ty * TILE_SIZE * z
                    ctx.drawImage(bmp, dx, dy, bmp.width * z, bmp.height * z)
                } else if (!tileInFlight.current.has(key)) {
                    // start async tile creation
                    tileInFlight.current.add(key)
                    createTile(tx, ty, srcPixels).then(bitmap => {
                        if (!bitmap) return
                        tileCache.current.set(key, bitmap)
                        tileInFlight.current.delete(key)
                        scheduleDraw()
                    })
                }
            }
        }

        // reference layers
        for (const layer of referenceLayers) {
            if (!layer.visible) continue
            ctx.globalAlpha = layer.opacity
            ctx.drawImage(layer.img, px, py, imgW * z, imgH * z)
            ctx.globalAlpha = 1
        }

        ctx.restore()
        dirty.current = false
    }, [mapImage, visualizationMode, referenceLayers, createTile])

    return (
        <>
            <section id="center">
                <div className="hero"> 
                    <h1>Map Component</h1>
                    <input type="file" accept="image/*" onChange={(e) => {
                        const file = e.target.files[0]
                        const reader = new FileReader()
                        reader.onload = (event) => {
                            const img = new Image()
                            img.onload = () => {
                                setMap(img)
                            }
                            img.src = event.target.result
                        }
                        reader.readAsDataURL(file)
                    }} />
                </div>
                    <div>
                        {map && (
                            <canvas
                                width={map.width}
                                height={map.height}
                                onClick={(e) => {
                                    const rect = e.target.getBoundingClientRect()
                                    const x = e.clientX - rect.left
                                    const y = e.clientY - rect.top
                                    const ctx = e.target.getContext('2d')
                                    const pixelData = ctx.getImageData(x, y, 1, 1).data
                                    setClickedPixel(pixelData)
                                }}
                                ref={(canvas) => {
                                    if (canvas && map) {
                                        const ctx = canvas.getContext('2d')
                                        ctx.drawImage(map, 0, 0)
                                    }
                                }}
                            />
                        )}
                        {clickedPixel && (
                            <p>Clicked pixel RGB: ({clickedPixel[0]}, {clickedPixel[1]}, {clickedPixel[2]})</p>
                        )}
                    </div>
            </section>
        </>
    )
}