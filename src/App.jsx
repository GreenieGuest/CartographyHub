import { useRef } from "react";
import MapCanvas from "./components/MapCanvas";
import Toolbar from "./components/Toolbar";
import Sidebar from "./components/Sidebar";
import { useMapStore } from "./store/mapStore";
import './App.css'

export default function App() {
	const fileInputRef = useRef(null)
	const { loadMapImage } = useMapStore()

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