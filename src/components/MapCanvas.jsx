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
        return createImageBitmap(tile)
    }, [])

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