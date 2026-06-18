import { useRef, useEffect, useCallback } from 'react'
import { useMapStore } from '../store/mapStore'

// Constants

const TILE_SIZE = 512
const MIN_ZOOM = 0.05
const MAX_ZOOM = 32
const LABEL_MIN_ZOOM = 0.15
const LABEL_MIN_SCREEN_PX = 400
const ZOOM_FACTOR = 1.15

export default function MapCanvas() {
    const containerRef = useRef(null)
    const canvasRef = useRef(null) // the map canvas
    const labelCanvasRef = useRef(null) // the map canvas

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
    const centroidsWorker = useRef(null)

    // interactions
    const isPanning = useRef(false)
    const isDrawing = useRef(false)
    const lastMouse = useRef({ x: 0, y: 0 })

    const {
        mapImage, referenceLayers,
        activeTool, brushColor, brushSize,
        selectProvince, setZoom,
        visualizationMode, provinceData,
        showLabels, centroids, setCentroids,
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

    const drawLabels = useCallback(() => {
        const canvas = labelCanvasRef.current
        if (!canvas || !pixelData.current) return
        const ctx = canvas.getContext('2d')
        const { offsetWidth: cw, offsetHeight: ch } = containerRef.current
        if (canvas.width !== cw || canvas.height !== ch) {
            canvas.width = cw
            canvas.height = ch
        }
        ctx.clearRect(0, 0, cw, ch)

        const z = zoom.current
        if (!showLabels || z < LABEL_MIN_ZOOM || !Object.keys(centroids).length) return

        // show label based on current map mode, EG "Horses" everywhere for trade goods/raw material

        const getLabelText = (key) => {
            const p = provinceData[key]
            if (!p) return null
            if (visualizationMode === 'tradeGood') return p.raw_material || p.tradeGood || null
            if (visualizationMode === 'continent') return p.continent || null
            if (visualizationMode === 'subcontinent') return p.subcontinent || null
            if (visualizationMode === 'region') return p.region || null
            if (visualizationMode === 'area') return p.area || null
            if (visualizationMode === 'province') return p.province || null
            if (visualizationMode === 'population') return p.population || null
            if (visualizationMode === 'climate') return p.climate || null
            if (visualizationMode === 'vegetation') return p.vegetation || null
            // if unsupported or there is nothing then return province name
            return p.name || null
        }

        const px = pan.current.x
        const py = pan.current.y

        let labelsToDraw = []

        for (const [key, c] of Object.entries(centroids)) {
            const text = getLabelText(key)
            if (!text) continue
            const screenPx = c.count * z * z
            if (screenPx < LABEL_MIN_SCREEN_PX) continue
            const sx = px + c.cx * z
            const sy = py + c.cy * z
            if (sx < -200 || sy < -40 || sx > cw + 200 || sy > ch + 40) continue
            labelsToDraw.push({text, sx, sy })
        }

        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'

        for (const {text, sx, sy } of labelsToDraw) {
            const fontSize = Math.max(7, Math.min(13, z * 40))
            const fontWeight = 500
            ctx.font = `${fontWeight} ${fontSize}px Inter, system-ui, sans-serif`

            // measure for outline box
            const metrics = ctx.measureText(text)
            const tw = metrics.width
            const th = fontSize

            // text should be outlined (easier to read)
            ctx.globalAlpha = 0.75
            ctx.fillStyle = '#000'
            const offsets = [[-1,-1],[1,-1],[-1,1],[1,1],[0,-1],[0,1],[-1,0],[1,0]]
            for (const [ox, oy] of offsets) {
                ctx.fillText(text, sx + ox, sy + oy)
            }

            ctx.fillStyle = aggregate ? '#fff' : '#f0f0e0'
            ctx.fillText(text, sx, sy)
        }
    }, [centroids, provinceData, showLabels, visualizationMode])

    // draw loop

    const drawRef = useRef(null)

    const draw = useCallback(() => {
        rafId.current = null
        const canvas = canvasRef.current
        if (!canvas) {
            console.log('MapCanvas.draw: no canvas element')
            return
        }
        const ctx = canvas.getContext('2d')

        try {
            console.log('MapCanvas.draw: canvas', canvas.width, canvas.height, 'pan', pan.current, 'zoom', zoom.current, 'tiles', tileCache.current.size)
        } catch (err) {
            console.log('MapCanvas.draw: log failed', err)
        }

        const { offsetWidth: cw, offsetHeight: ch } = containerRef.current
        if (canvas.width !== cw || canvas.height !== ch) {
            canvas.width = cw
            canvas.height = ch
        }

        ctx.clearRect(0, 0, cw, ch)

        if (!mapImage) {
            console.log('MapCanvas.draw: mapImage is null')
            drawEmpty(ctx, cw, ch)
            return
        }

        const srcPixels = (visualizationMode !== 'default' && vizPixelData.current) ? vizPixelData.current : pixelData.current
        if (!srcPixels) {
            console.log('MapCanvas.draw: srcPixels not ready')
            return
        }

        const z = zoom.current
        const px = pan.current.x
        const py = pan.current.y
        const { width: imgW, height: imgH } = srcPixels

        console.log('MapCanvas.draw: srcPixels', imgW, imgH)

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
                        drawRef.current?.()
                    })
                }
            }
        }

        // If there are no cached tiles yet (first frame), draw the full image as a fallback
        if (tileCache.current.size === 0) {
            // use the original mapImage where available for immediate feedback
            try {
                ctx.drawImage(mapImage, px, py, imgW * z, imgH * z)
            } catch (err) {
                // ignore - drawing may fail if mapImage isn't usable
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
        console.log('MapCanvas.draw: finished frame')
        dirty.current = false
    }, [mapImage, visualizationMode, referenceLayers, createTile, drawLabels])

    const scheduleDrawStable = useCallback(() => {
        if (rafId.current) return
        rafId.current = requestAnimationFrame(() => {
            rafId.current = null
            draw()
        })
    }, [draw])

    useEffect(() => {
        drawRef.current = scheduleDrawStable
    }, [scheduleDrawStable])

     // invalidate and rebuild tile cache
    const invalidateTiles = useCallback(() => {
        tileCache.current.forEach(bmp => bmp.close?.())
        tileCache.current.clear()
        tileInFlight.current.clear()
        dirty.current = true
        scheduleDrawStable()
    }, [scheduleDrawStable])

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

        try {
            const offscreen = document.createElement('canvas')
            offscreen.width = mapImage.width
            offscreen.height = mapImage.height
            const ctx = offscreen.getContext('2d')
            ctx.drawImage(mapImage, 0, 0)
            const idata = ctx.getImageData(0, 0, mapImage.width, mapImage.height)

            console.log('MapCanvas: extracted image data', mapImage.width, mapImage.height)

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
            
            if (centroidsWorker.current) centroidsWorker.current.terminate()
                centroidsWorker.current = new Worker(new URL('../workers/centroids.worker.js', import.meta.url), {type: 'module'})
                centroidsWorker.current.onmessage = ({ data: msg }) => {
                setCentroids(msg.centroids)
                scheduleDrawStable()
            }
            const copy = new Uint8ClampedArray(idata.data)
            centroidsWorker.current.postMessage(
                { buffer: copy.buffer, width: mapImage.width, height: mapImage.height },
                [copy.buffer]
            )
        } catch (err) {
            console.error('MapCanvas: error extracting image data', err)
        }
    }, [mapImage, invalidateTiles, setZoom, setCentroids, scheduleDrawStable])

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
    useEffect(() => { scheduleDrawStable() }, [showLabels, centroids, scheduleDrawStable])
    useEffect(() => { scheduleDrawStable() }, [referenceLayers, scheduleDrawStable])

    // resize observer
    useEffect(() => {
        const ro = new ResizeObserver(() => scheduleDrawStable())
        if (containerRef.current) ro.observe(containerRef.current)
        return () => ro.disconnect()
    }, [scheduleDrawStable])

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
        return { r: src.data[i], g: src.data[i + 1], b: src.data[i + 2]}
    }

    // Paintbrush editing + invalidate affected tiles

    const paintBrush = useCallback((ix, iy) => {
        const src = pixelData.current
        if (!src) return
        const { data, width, height } = src
        const hex = brushColor.replace('#', '')
        const fr = parseInt(hex.substring(0,2),16)
        const fg = parseInt(hex.substring(2,4),16)
        const fb = parseInt(hex.substring(4,6),16)
        const r = Math.ceil(brushSize / 2)

        // paint circle
        const affectedTiles = new Set()
        for (let dy = -r; dy <= r; dy++) {
            for (let dx = -r; dx <= r; dx++) {
                if (dx*dx + dy*dy > r*r) continue
                const px2 = ix + dx, py2 = iy + dy
                if (px2 < 0 || py2 < 0 || px2 >= width || py2 >= height) continue
                const idx = (py2 * width + px2) * 4
                data[idx] = fr; data[idx+1] = fg; data[idx+2] = fb
                affectedTiles.add(`${Math.floor(px2/TILE_SIZE)}:${Math.floor(py2/TILE_SIZE)}`)
            }
        }

        // remove only affected tiles
        affectedTiles.forEach(key => {
            tileCache.current.get(key)?.close?.()
            tileCache.current.delete(key)
            tileInFlight.current.delete(key)
        })
        dirty.current = true
        scheduleDrawStable()
    }, [brushColor, brushSize, scheduleDrawStable])

    const floodFill = useCallback((ix, iy) => {
        const src = pixelData.current
        if (!src) return
        const hex = brushColor.replace('#', '')
        const fillR = parseInt(hex.substring(0,2),16)
        const fillG = parseInt(hex.substring(2,4),16)
        const fillB = parseInt(hex.substring(4,6),16)

        if (fillWorker.current) fillWorker.current.terminate()
        fillWorker.current = new Worker(
            new URL('../workers/floodfill.worker.js', import.meta.url), { type: 'module' }
        )

        // transfer buffer to worker
        const { width, height } = src
        const buffer = src.data.buffer

        fillWorker.current.onmessage = ({data: msg}) => {
            pixelData.current.data = new Uint8ClampedArray(msg.buffer)
            invalidateTiles()
        }

        fillWorker.current.postMessage(
            { buffer, width, height, startX: ix, startY: iy, fillR, fillG, fillB}, [buffer]
        )
        src.data = null
    }, [brushColor, invalidateTiles])

    // Mouse handlers
    const getCanvasXY = (e) => {
        const rect = canvasRef.current.getBoundingClientRect()
        return { sx: e.clientX - rect.left, sy: e.clientY - rect.top }
    }

    const onMouseDown = useCallback((e) => {
        // Pan: middle mouse or alt + left (probably gonna change later :/)
        if (e.button === 1 || (e.button === 0 && e.altKey)) {
            isPanning.current = true
            lastMouse.current = { x: e.clientX, y: e.clientY}
            e.preventDefault()
            return
        }
        if (e.button !== 0) return

        const { sx, sy } = getCanvasXY(e)
        const { x: ix, y: iy } = screenToImage(sx, sy)

        if (activeTool === 'select') {
            const px = getPixelAt(ix, iy)
            if (px) selectProvince(px.r, px.g, px.b)
        } else if (activeTool === 'brush') {
            isDrawing.current = true
            paintBrush(ix, iy)
        } else if (activeTool === 'fill') {
            floodFill(ix, iy)
        }
    }, [activeTool, selectProvince, paintBrush, floodFill])

    const onMouseMove = useCallback((e) => {
        if (isPanning.current) {
            pan.current.x += e.clientX - lastMouse.current.x
            pan.current.y += e.clientY - lastMouse.current.y
            lastMouse.current = { x: e.clientX, y: e.clientY }
            dirty.current = true
            scheduleDrawStable()
        } else if (isDrawing.current && activeTool === 'brush') {
            const { sx, sy } = getCanvasXY(e)
            const { x: ix, y: iy } = screenToImage(sx, sy)
            paintBrush(ix, iy)
        }
    }, [activeTool, paintBrush, scheduleDrawStable])

    const onMouseUp = useCallback(() => {
        isPanning.current = false
        isDrawing.current = false
    }, [])

    const onWheel = useCallback((e) => {
        e.preventDefault()
        const { sx, sy } = getCanvasXY(e)
        const factor = e.deltaY < 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR
        const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom.current * factor))
        // zoom towards cursor position

        pan.current.x = sx - (sx - pan.current.x) * (newZoom / zoom.current)
        pan.current.y = sy - (sy - pan.current.y) * (newZoom / zoom.current)
        zoom.current = newZoom
        setZoom(newZoom)
        dirty.current = true
        scheduleDrawStable()
    }, [scheduleDrawStable, setZoom])

    useEffect(() => {
        const el = canvasRef.current
        if (!el) return
        el.addEventListener('wheel', onWheel, { passive: false })
        return () => el.removeEventListener('wheel', onWheel)
    }, [onWheel])

    // cleanup
    useEffect(() => () => {
        // terminate all the workers
        vizWorker.current?.terminate()
        fillWorker.current?.terminate()
        centroidsWorker.current?.terminate()

        if (rafId.current) cancelAnimationFrame(rafId.current)
        tileCache.current.forEach(b => b.close?.())
    }, [])

    const cursor = { select:'crosshair', brush:'cell', fill:'cell', wand:'copy' }[activeTool] || 'default'

    return (
        <div ref={containerRef} className='canvas-container'>
            <canvas
                ref={canvasRef}
                className="map-canvas"
                style={{ cursor, width: '100%', height: '100%' }}
                onMouseDown={onMouseDown}
                onMouseMove={onMouseMove}
                onMouseUp={onMouseUp}
                onMouseLeave={onMouseUp}
            />
            <canvas
                ref={labelCanvasRef}
                className="map-canvas"
                style={{pointerEvents: 'none'}}
            />
        </div>
    )
}