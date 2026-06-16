import { useState } from 'react'
import { useMapStore } from '../store/mapStore'

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

function TreeNode({ node, depth }) {
    const [expanded, setExpanded] = useState(true)
    const [editing, setEditing] = useState(false)
    const [draft, setDraft] = useState(node.name)
    const { addNode, renameNode, deleteNode } = useMapStore()

    const childType = CHILD_TYPES[node.type]
    const hasChildren = node.children?.length > 0

    const commitRename = () => {
        if (draft.trim()) renameNode(node.id, draft.trim())
        setEditing(false)
    }

    return (
        <li className="tree-node" style={{ '--depth': depth }}>
            <div className={`tree-row depth-${Math.min(depth, 3)}`}>
                <button
                    className="tree-expand"
                    onClick={() => setExpanded((e) => !e)}
                    style={{ visibility: hasChildren ? 'visible' : 'hidden' }}
                >
                    {expanded ? '▼' : '▶'}
                </button>

                {editing ? (
                    <input
                        className="tree-edit-input"
                        value={draft}
                        autoFocus
                        onChange={(e) => setDraft(e.target.value)}
                        onBlur={commitRename}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') commitRename()
                            else if (e.key === 'Escape') setEditing(false)
                        }}
                    />
                ) : (
                    <span className="tree-name" onDoubleClick={() => setEditing(true)}>
                        {node.name} <span className="tree-type">({node.type})</span>
                    </span>
                )}

                <div className="tree-actions">
                    {childType && (
                        <button onClick={() => addNode(node.id, childType, `New ${childType.charAt(0).toUpperCase() + childType.slice(1)}`)}>
                            Add {childType.charAt(0).toUpperCase() + childType.slice(1)}
                        </button>
                    )}
                <button
                    className="icon-btn"
                    title="Rename"
                    onClick={() => {setDraft(node.name); setEditing(true)}}
                >
                    Edit
                </button>
                <button
                    className="icon-btn"
                    title="Delete"
                    onClick={() => {
                        if (confirm(`Delete "${node.name}" and all its children?`)) deleteNode(node.id)
                    }}
                >
                    Delete
                </button>
            </div>
        </div>

        {expanded && hasChildren && (
            <ul>
                {node.children.map((child) => (
                    <TreeNode key={child.id} node={child} depth={depth + 1} />
                ))}
            </ul>
        )}
        </li>
    )
}