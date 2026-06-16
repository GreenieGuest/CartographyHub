import { useState } from 'react'
import { useMapStore } from '../stores/mapStore'
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
        <div className="sidebar">
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
                {activeTab === 'Hierarchy' && <HierarchyTree />}
            </div>
        </div>
    )
}