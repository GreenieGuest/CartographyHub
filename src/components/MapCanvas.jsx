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

    const storeRef = useRef({})
    const store = useMapStore()
    storeRef.current = store

    const {
        mapImage, referenceLayers,
        activeTool, brushColor, brushSize,
        selectProvince, setZoom,
        visualizationMode, provinceData,
        showLabels, centroids, setCentroids,
    } = store

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

    const scheduleDrawStable = useCallback(() => {
        if (rafId.current) cancelAnimationFrame(rafId.current)
        rafId.current = requestAnimationFrame(() => {
            rafId.current = null
            drawFrame()
        })
    }, [])

    function drawLabels() {
        const canvas = labelCanvasRef.current
        if (!canvas) return
        const container = containerRef.current
        if (!container) return
        const ctx = canvas.getContext('2d')
        const cw = container.offsetWidth
        const ch = container.offsetHeight
        if (canvas.width !== cw || canvas.height !== ch) {
            canvas.width = cw
            canvas.height = ch
        }
        ctx.clearRect(0, 0, cw, ch)

        const { showLabels, centroids, provinceData, visualizationMode } = storeRef.current
        const z = zoom.current
        if (!showLabels || z < LABEL_MIN_ZOOM || !pixelData.current) return
        if (!centroids || Object.keys(centroids).length === 0) return

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
            if (visualizationMode === 'culture') return p.culture || null
            if (visualizationMode === 'religion') return p.religion || null
            if (visualizationMode === 'population') return p.population || p.Population ? String(p.population || p.Population) : null
            if (visualizationMode === 'climate') return p.climate || null
            if (visualizationMode === 'vegetation') return p.vegetation || null
            if (visualizationMode === 'terrain') return p.topography || p.terrain || null
            // if unsupported or there is nothing then return province name
            return p.name || null
        }

        const isAggregate = ['region', 'area', 'province', 'continent', 'subcontinent', 'owner'].includes(visualizationMode)

        const px = pan.current.x
        const py = pan.current.y

        const labelsToDraw = []

        if (isAggregate) {
            const groups = {}
            for (const [key, c] of Object.entries(centroids)) {
                if (c.count * z * z < LABEL_MIN_SCREEN_PX) continue
                const text = getLabelText(key)
                if (!text) continue
                if (!groups[text]) groups[text] = { sumCx: 0, sumCy: 0, n: 0 }
                groups[text].sumCx += c.cx
                groups[text].sumCy += c.cy
                groups[text].n++
            }
            for (const [text, g] of Object.entries(groups)) {
                const sx = px + (g.sumCx / g.n) * z
                const sy = py + (g.sumCy / g.n) * z
                if (sx < -300 || sy < -50 || sx > cw + 300 || sy > ch + 50) continue
                labelsToDraw.push({text, sx, sy, big: true })
            }
        } else {
            for (const [key, c] of Object.entries(centroids)) {
                if (c.count * z * z < LABEL_MIN_SCREEN_PX) continue
                const text = getLabelText(key)
                if (!text) continue
                const sx = px + c.cx * z
                const sy = py + c.cy * z
                if (sx < -300 || sy < -50 || sx > cw + 300 || sy > ch + 50) continue
                labelsToDraw.push({ text, sx, sy, big: false })
            }
        }

        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'

        for (const {text, sx, sy, big } of labelsToDraw) {
            const fontSize   = big ? Math.max(9, Math.min(18, z * 80)) : Math.max(7, Math.min(13, z * 40))
            ctx.font = `${big ? '700' : '500'} ${fontSize}px Inter, system-ui, sans-serif`

            ctx.globalAlpha = 0.75
            ctx.fillStyle = '#000'
            const offsets = [[-1,-1],[1,-1],[-1,1],[1,1],[0,-1],[0,1],[-1,0],[1,0]]
            for (const [ox, oy] of offsets) {
                ctx.fillText(text, sx + ox, sy + oy)
            }
            ctx.globalAlpha = 1

            ctx.fillStyle   = big ? '#fff' : '#f0f0e0'
            ctx.fillText(text, sx, sy)
        }
    }

    function drawEmpty(ctx, w, h) { // placeholder
        ctx.fillStyle = '#1a1c14'
        ctx.fillRect(0, 0, w, h)
        ctx.fillStyle = '#3a3d30'
        ctx.font = '14px Inter, system-ui, sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText('Load a map image to begin', w / 2, h / 2)
    }

    // draw loop

    function drawFrame() {
        const canvas = labelCanvasRef.current
        if (!canvas) return
        const container = containerRef.current
        if (!container) return
        const ctx = canvas.getContext('2d')
        const cw = container.offsetWidth
        const ch = container.offsetHeight
        if (!cw || !ch) return
        if (canvas.width !== cw || canvas.height !== ch) {
            canvas.width = cw
            canvas.height = ch
        }
        ctx.clearRect(0, 0, cw, ch)

        const { mapImage, visualizationMode, referenceLayers } = storeRef.current

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
                        scheduleDrawStable()
                    })
                }
            }
        }

        // If there are no cached tiles yet (first frame), draw the full image as a fallback
        if (tileCache.current.size === 0) {
            ctx.drawImage(mapImage, px, py, imgW * z, imgH * z)
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
        drawLabels()
    }

    // when an image is loaded extract the ImageData
    useEffect(() => {
        if (!mapImage) return

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

        tileCache.current.forEach(b => b.close?.())
        tileCache.current.clear()
        tileInFlight.current.clear()
        scheduleDrawStable()
        
        // centroid worker
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
    }, [mapImage, setZoom, setCentroids, scheduleDrawStable])

    // map modes change

    useEffect(() => {
        if (!pixelData.current) return
        if (visualizationMode === 'default') {
            vizPixelData.current = null

            tileCache.current.forEach(b => b.close?.())
            tileCache.current.clear()
            tileInFlight.current.clear()
            scheduleDrawStable()
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
            tileCache.current.forEach(b => b.close?.())
            tileCache.current.clear()
            tileInFlight.current.clear()
            scheduleDrawStable()
        }

        vizWorker.current.postMessage(
            { buffer: copy.buffer, width, height, provinceData, visualizationMode },
            [copy.buffer]
        )
    }, [visualizationMode, provinceData, scheduleDrawStable])

    // redraw when user changes reference layers
    useEffect(() => { scheduleDrawStable() }, [showLabels, centroids, referenceLayers, scheduleDrawStable])

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
        if (!src || !src.data) return null
        if (ix < 0 || iy < 0 || ix >= src.width || iy >= src.height) return null
        const i = (iy * src.width + ix) * 4
        return { r: src.data[i], g: src.data[i + 1], b: src.data[i + 2]}
    }

    // Paintbrush editing + invalidate affected tiles

    const paintBrush = useCallback((ix, iy) => {
        const src = pixelData.current
        if (!src || !src.data) return
        const { brushColor, brushSize } = storeRef.current
        const hex = brushColor.replace('#', '')
        const fr = parseInt(hex.substring(0,2),16)
        const fg = parseInt(hex.substring(2,4),16)
        const fb = parseInt(hex.substring(4,6),16)
        const r = Math.ceil(brushSize / 2)

        // paint circle
        const { data, width, height } = src
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
        scheduleDrawStable()
    }, [scheduleDrawStable])

    const floodFill = useCallback((ix, iy) => {
        const src = pixelData.current
        if (!src || !src.data) return
        const { brushColor } = storeRef.current
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

        fillWorker.current.onmessage = ({ data: msg }) => {
            pixelData.current.data = new Uint8ClampedArray(msg.buffer)
            tileCache.current.forEach(b => b.close?.())
            tileCache.current.clear()
            tileInFlight.current.clear()
            scheduleDrawStable()
        }

        fillWorker.current.postMessage(
            { buffer, width, height, startX: ix, startY: iy, fillR, fillG, fillB }, [buffer]
        )
        src.data = null
    }, [scheduleDrawStable])

    // Mouse handlers
    const getCanvasXY = (e) => {
        const rect = canvasRef.current.getBoundingClientRect()
        return { sx: e.clientX - rect.left, sy: e.clientY - rect.top }
    }

    const onMouseDown = useCallback((e) => {
        // Pan: middle mouse or alt + left (probably gonna change later :/)
        if (e.button === 1 || (e.button === 0 && e.altKey)) {
            isPanning.current = true
            lastMouse.current = { x: e.clientX, y: e.clientY }
            e.preventDefault()
            return
        }
        if (e.button !== 0) return

        const { sx, sy } = getCanvasXY(e)
        const { x: ix, y: iy } = screenToImage(sx, sy)
        const { activeTool, selectProvince } = storeRef.current

        if (activeTool === 'select') {
            const px = getPixelAt(ix, iy)
            if (px) selectProvince(px.r, px.g, px.b)
        } else if (activeTool === 'brush') {
            isDrawing.current = true
            paintBrush(ix, iy)
        } else if (activeTool === 'fill') {
            floodFill(ix, iy)
        }
    }, [paintBrush, floodFill])

    const onMouseMove = useCallback((e) => {
        if (isPanning.current) {
            pan.current.x += e.clientX - lastMouse.current.x
            pan.current.y += e.clientY - lastMouse.current.y
            lastMouse.current = { x: e.clientX, y: e.clientY }
            scheduleDrawStable()
        } else if (isDrawing.current) {
            const { activeTool } = storeRef.current
            if (activeTool === 'brush') {
                const { sx, sy } = getCanvasXY(e)
                const { x: ix, y: iy } = screenToImage(sx, sy)
                paintBrush(ix, iy)
            }
        }
    }, [paintBrush, scheduleDrawStable])

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
        storeRef.current.setZoom(newZoom)
        scheduleDrawStable()
    }, [scheduleDrawStable])

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
        <div ref={containerRef} className="canvas-container">
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
                style={{pointerEvents: 'none', width: '100%', height: '100%'}}
            />
        </div>
    )
}