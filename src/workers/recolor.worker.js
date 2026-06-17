//Input: { buffer: ArrayBuffer, width, height, provinceData, visualizationMode }
// Output: { buffer: ArrayBuffer, width, height }
import TRADE_GOOD_COLORS from "../constants/tradegoodcolors.js"

self.onmessage = ({ data }) => {
    const { buffer, width, height, provinceData, visualizationMode } = data
    const pixels = new Uint8ClampedArray(buffer)

    // Integer key = [ r, g, b ] | null
    const colorCache = new Map()

    const hashColor = (str) => {
        if (!str) return [120, 120, 120]
        let hash = 5381
        for (let i = 0; i < str.length; i++) hash = ((hash << 5) + hash) ^ str.charCodeAt(i)
        return [(hash >> 16) & 0xff, (hash >> 8) & 0xff, hash & 0xff]
    }

    const getVizColor = (province) => {
        if (!province) return null
        if (visualizationMode === 'tradeGood') {
            const g = (province.tradeGood || province.grade_good || province.raw_material || '').toLowerCase()
            return TRADE_GOOD_COLORS[g] || hashColor(g)
        }
        if (visualizationMode === 'continent') return hashColor(province.continent || '')
        if (visualizationMode === 'subcontinent') return hashColor(province.subcontinent || '')
        if (visualizationMode === 'region') return hashColor(province.region || '')
        if (visualizationMode === 'area') return hashColor(province.area || '')
        if (visualizationMode === 'province') return hashColor(province.province || '')
        if (visualizationMode === 'isCoastal') {
            const c = province.isCoastal || province.is_coastal || ''
            return (c === '1' || c.toLowerCase() === 'true') ? [70,130,180] : [139,115,85]
        }
        return null
    }

    for (let i = 0; i < pixels.length; i += 4) {
        const r = pixels[i], g = pixels[i+1], b = pixels[i+2]
        const key = (r << 16) | (g << 8) | b

        if (!colorCache.has(key)) {
            const pKey = `${r},${g},${b}`
            colorCache.set(key, getVizColor(provinceData[pKey] ?? null))
        }

        const c = colorCache.get(key)
        if (c) {
            pixels[i] = c[0]
            pixels[i+1] = c[1]
            pixels[i+2] = c[2]
        }
    }

    // transfer buffer back
    self.postMessage({buffer: pixels.buffer, width, height }, [pixels.buffer])
}