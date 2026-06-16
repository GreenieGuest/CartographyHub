import { useState } from 'react'
import { useMapStore } from '../stores/mapStore'

const CHILD_TYPES = {
    root: 'region',
    region: 'area',
    area: 'province',
    province: 'location',
    location: null,
}

export default function HierarchyTree() {
    const { hierarchy, addNode } = useMapStore()

    return (
        <div className="hierarchy-tree">
            <div className="hierarchy-header">
                <h2>World Hierarchy</h2>
                <button onClick={() => addNode(null, 'root', 'New Region')}>Add Region</button>
            </div>
            {hierarchy.length === 0 ? (
                <p>No regions added yet. Click "Add Region" to start building the hierarchy.</p>
            ) : (
                <ul className="tree-root">
                    {hierarchy.map((node) => (
                        <TreeNode key={node.id} node={node} depth={0} />
                    ))}
                </ul>
            )}
        </div>
    )
}