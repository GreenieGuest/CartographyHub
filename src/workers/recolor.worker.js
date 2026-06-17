//Input: { buffer: ArrayBuffer, width, height, provinceData, visualizationMode }
// Output: { buffer: ArrayBuffer, width, height }

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

    const TRADE_GOOD_COLORS = {
        grain:[218,165,32], wool:[240,230,140], fish:[100,149,237],
        iron:[105,105,105], gold:[255,215,0], silk:[221,160,221],
        spices:[255,140,0], wine:[128,0,128], cloth:[255,105,180],
        wood:[101,67,33], fur:[139,90,43], ivory:[255,255,240],
        salt:[245,245,245], copper:[184,115,51], dye:[148,0,211],
    }

    const getVizColor = (province) => {
        if (!province) return null
        if (visualizationMode === 'tradeGood') {
            const g = (province.tradeGood || province.grade_good || '').toLowerCase()
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