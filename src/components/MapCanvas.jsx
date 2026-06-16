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

    const scheduleDraw = useCallback(() => {
        if (rafId.current) return
        rafId.current = requestAnimationFrame(draw)
    }, [draw])

    function drawEmpty(ctx, w, h) { // placeholder
        ctx.fillStyle = '#1a1c14'
        ctx.fillRect(0, 0, w, h)
        ctx.fillStyle = '#3a3d30'
        ctx.font = '14px Inter, system-ui, sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText('Load a map image to begin', w / 2, h / 2)
    }

    // when an image is loaded extract the ImageData
    useEffect(() => {
        if (!mapImage) return

        const offscreen = document.createElement('canvas')
        offscreen.width = mapImage.width
        offscreen.height = mapImage.height
        const ctx = offscreen.getContext('2d')
        ctx.drawImage(mapImage, 0, 0)
        const idata = ctx.getImageData(0, 0, mapImage.width, mapImage, height)

        pixelData.current = { data: idata.data, width: mapImage.width, height: mapImage.height }
        vizPixelData.current = null

        // fit image to viewport
        const container = containerRef.current
        if (container) {
            const scaleX = container.offsetWidth / mapImage.width
            const scaleY = container.offsetHeight / mapImage.height

            zoom.current = Math.min(scaleX, scaleY, 1)
            pan.current = {
                x: (container.offsetWidth - mapImage.width * zoom.current) / 2,
                y: (container.offsetHeight - mapImage.height * zoom.current) / 2,
            }
            setZoom(zoom.current)
        }

        invalidateTiles()
    }, [mapImage, invalidateTiles, setZoom])

    // map modes change

    useEffect(() => {
        if (!pixelData.current) return
        if (visualizationMode === 'default') {
            vizPixelData.current = null
            invalidateTiles()
            return
        }

        if (vizWorker.current) vizWorker.current.terminate()
        vizWorker.current = new Worker(
            new URL('../workers/recolor.worker.js', import.meta.url),
            { type: 'module' }
        )
        const { data, width, height } = pixelData.current
        const copy = new Uint8ClampedArray(data)

        vizWorker.current.onmessage = ({ data: msg }) => {
            vizPixelData.current = {
                data: new Uint8ClampedArray(msg.buffer),
                width: msg.width,
                height: msg.height,
            }
            invalidateTiles()
        }

        vizWorker.current.postMessage(
            { buffer: copy.buffer, width, height, provinceData, visualizationMode },
            [copy.buffer]
        )
    }, [visualizationMode, provinceData, invalidateTiles])

    // redraw when user changes reference layers

    useEffect(() => { scheduleDraw() }, [referenceLayers, scheduleDraw])

    // resize observer
    useEffect(() => {
        const ro = new ResizeObserver(() => scheduleDraw())
        if (containerRef.current) ro.observe(containerRef.current)
        return () => ro.disconnect()
    }, [scheduleDraw])

    // coordinate helpers

    const screenToImage = (sx, sy) => ({
        x: Math.floor((sx - pan.current.x) / zoom.current),
        y: Math.floor((sy - pan.current.y) / zoom.current),
    })

    const getPixelAt = (ix, iy) => {
        const src = pixelData.current
        if (!src) return null
        if (ix < 0 || iy < 0 || ix >= src.width || iy >= src.height) return null
        const i = (iy * src.width + ix) * 4
        return { r: src.data[i], h: src.data[i + 1], b: src.data[i + 2]}
    }

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