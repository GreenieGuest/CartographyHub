import { useRef } from 'react'
import { useMapStore } from '../stores/mapStore'

const TOOLS = [
    { id: 'select', title: 'Select Province'},
    { id: 'brush', title: 'Brush Tool'},
    { id: 'fill', title: 'Fill Tool'},
    { id: 'wand', title: 'Magic Wand (coming soon)'},
]

const VIEWS = [
    { id: 'default', label: 'Default (Location)'},
    { id: 'tradeGood', label: 'Trade Goods'},
    { id: 'population', label: 'Population'},
    { id: 'vegetation', label: 'Vegetation'},
    { id: 'climate', label: 'Climate'},
    { id: 'region', label: 'Region'},
    { id: 'area', label: 'Area'},
    { id: 'province', label: 'Province'},
]

export default function Toolbar() {
    const {
        activeTool, setActiveTool,
        visualizationMode, setVisualizationMode,
        brushColor, setBrushColor,
        brushSize, setBrushSize,
        addReferenceLayer,
        loadProvinceData
    } = useMapStore()

    const csvRef = useRef(null)
    const refImgRef = useRef(null)

    const handleCSV = (e) => {
        const file = e.target.files[0]
        if (file) {
            const reader = new FileReader()
            reader.onload = (event) => {
                const text = event.target.result
                loadProvinceData(text)
            }
            reader.readAsText(file)
            e.target.value = ''
        }
    }

    const handleReferenceImage = (e) => {
        const file = e.target.files[0]
        if (file) {
            const reader = new FileReader()
            reader.onload = (event) => {
                const img = new Image()
                img.onload = () => {
                    addReferenceLayer(img)
                }   
                img.src = event.target.result
            }
            reader.readAsDataURL(file)
            e.target.value = ''
        }
    }

    return (
        <aside className="toolbar">
            <section className="toolbar-section">
                <div className="toolbar-label">Tools</div>
                <div className="toolbar-buttons">
                    {TOOLS.map((tool) => (
                        <button
                            key={tool.id}
                            className={activeTool === tool.id ? 'active' : ''}
                            onClick={() => setActiveTool(tool.id)}
                        >
                            {tool.title}
                        </button>
                    ))}
                </div>
            </section>

            {(activeTool === 'brush') || (activeTool === 'fill') ? (
                <section className="toolbar-section">
                    <div className="toolbar-label">Tool Settings</div>
                    <div className="toolbar-controls">
                        <label>
                            Color:
                            <input
                                type="color"
                                value={brushColor}
                                onChange={(e) => setBrushColor(e.target.value)}
                            />
                        </label>
                        {activeTool === 'brush' ? (
                            <label>
                                Size:
                                <input
                                    type="range"
                                    min="1"
                                    max="100"
                                    value={brushSize}
                                    onChange={(e) => setBrushSize(parseInt(e.target.value))}
                                />
                            </label>
                        ) : null}
                    </div>
                </section>
            ) : null}

            <section className="toolbar-section">
                <div className="toolbar-label">Map Mode</div>
                <div className="view-buttons">
                    {VIEWS.map((view) => (
                        <button
                            key={view.id}
                            className={visualizationMode === view.id ? 'active' : ''}
                            onClick={() => setVisualizationMode(view.id)}
                        >
                            {view.label}
                        </button>
                    ))}
                </div>
            </section>

            <section className="toolbar-section">
                <div className="toolbar-label">Data</div>
                <div className="data-buttons">
                    <button onClick={() => csvRef.current.click()}>Load Province Data (CSV)</button>
                    <input
                        type="file"
                        ref={csvRef}
                        onChange={handleCSV}
                        style={{ display: 'none' }}
                    />
                </div>
            </section>

            <section className="toolbar-section">
                <div className="toolbar-label">Layers</div>
                <div className="reference-image-buttons">
                    <button onClick={() => refImgRef.current.click()}>Add Reference Layer</button>
                    <input
                        type="file"
                        ref={refImgRef}
                        onChange={handleReferenceImage}
                        style={{ display: 'none' }}
                    />
                </div>
            </section>
        </aside>
    )
}