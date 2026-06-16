import { useState } from 'react'
import { useMapStore } from '../store/mapStore'
import HierarchyTree from './HierarchyTree'

const TABS = [
    'Province',
    'Layers',
    'Hierarchy'
]

export default function Sidebar() {
    const [activeTab, setActiveTab] = useState('Province')
    const { selectedProvince, provinceData, referenceLayers, updateLayer, removeLayer, moveLayer } = useMapStore()

    return (
        <aside className="sidebar">
            <div className="tab-buttons">
                {TABS.map((tab) => (
                    <button
                        key={tab}
                        className={activeTab === tab ? 'active' : ''}
                        onClick={() => setActiveTab(tab)}
                    >
                        {tab}
                    </button>
                ))}
            </div>

            <div className="sidebar-body">
                {activeTab === 'Province' && <ProvincePanel province={selectedProvince} />}
                {activeTab === 'Layers' && <LayersPanel layers={referenceLayers} onUpdate={updateLayer} onRemove={removeLayer} onMove={moveLayer} />}
                {activeTab === 'Hierarchy' && <HierarchyTree />}
            </div>
        </aside>
    )
}

function ProvincePanel({ province }) {
    if (!province) {
        return <p>No province selected. Click on the map to select a province.</p>
    }
    const [r, g, b] = province.rgb
    const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
    const data = province.data

    return (
        <div className="province-panel">
            <div className="province-color-swatch" style={{ background: hex }} title={hex} />
            <div className="province-color-label">
                RGB ({r}, {g}, {b}) &nbsp; {hex}
            </div>

            {data ? (
                <table className="province-data-table">
                    <tbody>
                        {Object.entries(data).map(([key, value]) => (
                            <tr key={key}>
                                <td>{key}</td>
                                <td>{value}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            ) : null}
        </div>
    )
}

function LayersPanel({layers, onUpdate, onRemove, onMove}) {
    if (layers.length === 0) {
        return <p>No reference layers added. Use the toolbar to add reference images.</p>
    }
    return (
        <div className="layers-list">
            {[...layers].reverse().map((layer, index) => (
                <div key={index} className="layer-row">
                    <span>{layer.name || `Layer ${index + 1}`}</span>
                    <button onClick={() => onUpdate(layer.id, { visible: !layer.visible })}>Toggle Visibility</button>
                    <input type="range" min="0" max="1" step="0.01" value={layer.opacity} onChange={(e) => onUpdate(layer.id, { opacity: Number(e.target.value) })} />
                    <div className="layer-controls">
                        <button onClick={() => onMove(index, 'up')} disabled={index === layers.length - 1}>↑</button>
                        <button onClick={() => onMove(index, 'down')} disabled={index === 0}>↓</button>
                        <button onClick={() => onRemove(index)}>Remove</button>
                    </div>
                </div>
            ))}
        </div>
    )
}
