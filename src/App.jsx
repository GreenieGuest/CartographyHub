import { useRef } from "react";
import MapCanvas from "./components/MapCanvas";
import Toolbar from "./components/Toolbar";
import Sidebar from "./components/Sidebar";
import { useMapStore } from "./store/mapStore";
import './App.css'

export default function App() {
	const fileInputRef = useRef(null)
	const { loadMapImage, mapImage } = useMapStore()

	const handleImageUpload = (e) => {
		const file = e.target.files[0]
		if (!file) return
		const reader = new FileReader()
		reader.onload = (event) => {
			const image = new Image()
			image.onload = () => {
				console.log('App: image loaded, width=', image.width, 'height=', image.height)
				window.__uploadedMap = image
				loadMapImage(image)
			}
			image.onerror = (err) => console.error('App: image failed to load', err)
			image.src = event.target.result
		}
		reader.readAsDataURL(file)
		e.target.value = ''
	}

	const handleExportPNG = () => {
        if (!mapImage) {alert('No map loaded'); return}
        
        const imgW = mapImage.width
        const imgH = mapImage.height
        const TILE_SIZE = 512
        
        // Extract full pixel data from map image
        const tempCanvas = document.createElement('canvas')
        tempCanvas.width = imgW
        tempCanvas.height = imgH
        const tempCtx = tempCanvas.getContext('2d')
        tempCtx.drawImage(mapImage, 0, 0)
        const sourcePixels = tempCtx.getImageData(0, 0, imgW, imgH)
        
        // Create output ImageData
        const outputImageData = tempCtx.createImageData(imgW, imgH)
        const { data } = sourcePixels
        
        // Iterate through tiles and compose full image
        const tilesX = Math.ceil(imgW / TILE_SIZE)
        const tilesY = Math.ceil(imgH / TILE_SIZE)
        
        for (let ty = 0; ty < tilesY; ty++) {
            for (let tx = 0; tx < tilesX; tx++) {
                const x0 = tx * TILE_SIZE
                const y0 = ty * TILE_SIZE
                const tw = Math.min(TILE_SIZE, imgW - x0)
                const th = Math.min(TILE_SIZE, imgH - y0)
                
                // Copy this tile's pixels to output
                for (let row = 0; row < th; row++) {
                    const srcOff = ((y0 + row) * imgW + x0) * 4
                    const dstOff = ((y0 + row) * imgW + x0) * 4
                    outputImageData.data.set(data.subarray(srcOff, srcOff + tw * 4), dstOff)
                }
            }
        }
        
        // Draw to canvas and export
        const exportCanvas = document.createElement('canvas')
        exportCanvas.width = imgW
        exportCanvas.height = imgH
        const exportCtx = exportCanvas.getContext('2d')
        exportCtx.putImageData(outputImageData, 0, 0)
        
        exportCanvas.toBlob(blob => {
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = 'map_export.png'
            a.click()
            URL.revokeObjectURL(url)
        })
    }

	return (
		<div className="app-shell">
			<header className="app-header">
				Cartography Hub
				<nav className="header-actions">
					<button className="btn-ghost" onClick={()=> fileInputRef.current?.click()}>
						Load Map Image
					</button>
					<input
						ref={fileInputRef}
						type="file"
						accept="image/*"
						style={{display: 'none'}}
						onChange={handleImageUpload}
					/>
                    <button className="btn-ghost" onClick={handleExportPNG}>Export PNG</button>
				</nav>
			</header>

			<div className="workspace">
				<Toolbar />
				<main className="canvas-area">
					<MapCanvas />
				</main>
				<Sidebar />
			</div>
		</div>
	)
}