import { create } from 'zustand'
 
function rgbKey(r, g, b) {
  return `${r},${g},${b}`
}

export const useMapStore = create((set, get) => ({
    // Map Image
    mapImage: null,
    loadMapImage: (image) => set({ mapImage: image }),

    // Reference Layers
    referenceLayers: [],
    addReferenceLayer: (image, name) => set((state) => ({
        referenceLayers: [...state.referenceLayers, { id: Date.now(), img: image, name, opacity: 0.5, visible: true }]
    })),
    updateLayer: (id, updates) => set((state) => ({
        referenceLayers: state.referenceLayers.map(layer => layer.id === id ? { ...layer, ...updates } : layer)
    })),
    removeLayer: (id) => set((state) => ({
        referenceLayers: state.referenceLayers.filter(layer => layer.id !== id)
    })),
    moveLayer: (id, direction) => set((state) => {
        const layers = [...state.referenceLayers]
        const index = layers.findIndex(layer => layer.id === id)
        const target = index + direction
        if (target < 0 || target >= layers.length) return state
        [layers[index], layers[target]] = [layers[target], layers[index]]
        return { referenceLayers: layers }
    }),

    // Provvie Data
    provinceData: {},
    provinceDataHeaders: [],

    loadProvinceData: (csvText) => {
        const lines = csvText.trim().split('\n')
        const headers = lines[0].split(',').map(h => h.trim())
        const data = {}
        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',').map(v => v.trim())
            const row = {}
            headers.forEach((h, idx) => (row[h] = values[idx] ?? ''))
            const r = row.r ?? row.R
            const g = row.g ?? row.G
            const b = row.b ?? row.B
            if (r !== undefined && g !== undefined && b !== undefined) {
                data[rgbKey(r, g, b)] = row
            } else if (row.hex) {
                const hex = row.hex.replace('#', '')
                if (hex.length === 6) {
                    const r = parseInt(hex.slice(0, 2), 16)
                    const g = parseInt(hex.slice(2, 4), 16)
                    const b = parseInt(hex.slice(4, 6), 16)
                    data[rgbKey(r, g, b)] = row
                }
            }
        }
        set({ provinceData: data, provinceDataHeaders: headers })
    },

    updateProvinceField: (key, field, value) => set((state) => ({
        provinceData: {
            ...state.provinceData,
            [key]: { ...state.provinceData[key], [field]: value }
        }
    })),

    registerProvince: (r, g, b) => set((state) => {
        const key = rgbKey(r, g, b)
        if (state.provinceData[key]) return state // already exists
        const headers = state.provinceDataHeaders
        const row = {}
        headers.forEach(h => (row[h] = ''))
        // fill color columns
        if (row.r !== undefined) { row.r = String(r); row.g = String(g); row.b = String(b) }
        if (row.color !== undefined) row.color = `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`
        return { provinceData: {...state.provinceData, [key]: row } }
    }),

    exportCSV: () => {
        const { provinceData, provinceDataHeaders } = get()
        if (!provinceDataHeaders.length) return null
        const rows = [provinceDataHeaders.join(',')]
        for (const row of Object.values(provinceData)) {
            rows.push(provinceDataHeaders.map(h => row[h] ?? '').join(','))
        }
        return rows.join('\n')
    },

    // Provvie Hierarchy
    hierarchy: [],
    addNode: (parentId, type, name) => set((state) => {
        const newNode = { id: Date.now(), type, name, children: [] }
        if (!parentId) return { hierarchy: [...state.hierarchy, newNode] }
        const insert = (nodes) => nodes.map((n) =>
        n.id === parentId
            ? { ...n, children: [...(n.children || []), newNode] }
            : { ...n, children: insert(n.children || []) }
        )
        return { hierarchy: insert(state.hierarchy) }
    }),
    renameNode: (id, newName) => set((state) => {
        const rename = (nodes) => nodes.map((n) =>
        n.id === id
            ? { ...n, name: newName }
            : { ...n, children: rename(n.children || []) }
        )
        return { hierarchy: rename(state.hierarchy) }
    }),
    deleteNode: (id) => set((state) => {
        const del = (nodes) => nodes.filter((n) => n.id !== id).map((n) => ({ ...n, children: del(n.children || []) }))
        return { hierarchy: del(state.hierarchy) }
    }),

    // active tool
    activeTool: 'select',
    setActiveTool: (tool) => set({ activeTool: tool }),

    // Brush settings
    brushColor: '#ff0000',
    brushSize: 10,
    setBrushColor: (color) => set({ brushColor: color }),
    setBrushSize: (size) => set({ brushSize: size }),

    // selected province
    selectedProvince: null,
    selectProvince: (r, g, b) => {
        const key = rgbKey(r, g, b)
        const data = get().provinceData[key] ?? null
        set({ selectedProvince: { rgb: [r, g, b], key, data } })
    },

    refreshSelectedProvince: () => {
        const sel = get().selectedProvince
        if (!sel) return
        const data = get().provinceData[sel.key] ?? null
        set({ selectedProvince: {...sel, data } })
    },

    // visualization settings
    visualizationMode: 'default',
    setVisualizationMode: (mode) => set({ visualizationMode: mode }),
    showLabels: true,
    setShowLabels: (show) => set({ showLabels: show }),
    
    // Centroids
    centroids: {},
    setCentroids: (centroids) => set({ centroids }),

    // zoom / pan
    zoom: 1,
    setZoom: (zoom) => set({ zoom }),
}))