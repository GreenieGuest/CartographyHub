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
    const { referenceLayers, updateLayer, removeLayer, moveLayer } = useMapStore()

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
                {activeTab === 'Province' && <ProvincePanel />}
                {activeTab === 'Layers' && <LayersPanel layers={referenceLayers} onUpdate={updateLayer} onRemove={removeLayer} onMove={moveLayer} />}
                {activeTab === 'Hierarchy' && <HierarchyTree />}
            </div>
        </aside>
    )
}

function ProvincePanel() {
    const {
        selectedProvince, provinceData, provinceDataHeaders,
        updateProvinceField, refreshSelectedProvince,
        registerProvince,
        showLabels, setShowLabels,
    } = useMapStore()

    if (!selectedProvince) {
        return (
            <div className="province-panel">
                <p>Click any province to view data!</p>
            </div>
        )
    }

    const [r, g, b] = selectedProvince.rgb
    const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
    const key = selectedProvince.key
    const data = provinceData[key] ?? null
    const isRegistered = !!data

    const handleFieldChange = (field, value) => {
        updateProvinceField(key, field, value)
        refreshSelectedProvince()
    }

    const handleRegister = () => {
        registerProvince(r, g, b)
        refreshSelectedProvince()
    }
    
    const cols = provinceDataHeaders.length
        ? provinceDataHeaders
        : data ? Object.keys(data) : []

    return (
        <div className="province-panel">
            <div className="province-color-swatch" style={{ background: hex }} title={hex} />
            <div className="province-color-label">
                RGB ({r}, {g}, {b}) &nbsp; {hex}
            </div>

            {!isRegistered ? (
                <div>
                    <p>Province not assigned yet</p>
                    {provinceDataHeaders.length > 0
                        ? <button onClick={handleRegister}>+ Add Data</button>
                        : <p>Load a CSV first to add data!</p>
                    }
                </div>
            ) : (
                <table className="province-data-table">
                    <tbody>
                        {cols.map(col => (
                            <tr key={col}>
                                <td className="col-key">{col}</td>
                                <td className='col-val'>
                                    <input className="field-input"
                                    value={data[col] ?? ''}
                                    onChange={e => handleFieldChange(col, e.target.value)}
                                    />
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
            
        </div>
    )
}

function LayersPanel({layers, onUpdate, onRemove, onMove}) {
    if (layers.length === 0) {
        return <p className="panel-hint">No reference layers added. Use the toolbar to add reference images.</p>
    }
    return (
        <div className="layers-list">
            {layers.map((layer) => {
                const index = layers.findIndex(l => l.id === layer.id)
                return (
                    <div key={layer.id} className="layer-row">
                        <span>{layer.name || `Layer ${index + 1}`}</span>
                        <button onClick={() => onUpdate(layer.id, { visible: !layer.visible })}>{layer.visible ? '👁' : '◌'}</button>
                        <input type="range" min="0" max="1" step="0.01" value={layer.opacity} onChange={(e) => onUpdate(layer.id, { opacity: Number(e.target.value) })} />
                        <div className="layer-controls">
                            <button onClick={() => onMove(layer.id, -1)} disabled={index === 0}>↑</button>
                            <button onClick={() => onMove(layer.id, 1)} disabled={index === layers.length - 1}>↓</button>
                            <button onClick={() => onRemove(layer.id)}>✕</button>
                        </div>
                    </div>
                )
            })}
        </div>
    )
}
