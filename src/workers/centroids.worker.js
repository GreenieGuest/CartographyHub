// Basically the spiritual successor of ParadoxNameScript
// Input: { buffer, width, height }
// output: { centroids: {"r, g, b": {cx, cy, count }}}
// Scans each pixel, gets sum-x, sum-y and count per color key
// Then divides to get centroid

self.onmessage = ({ data }) => {
    const { buffer, width, height } = data
    const pixels = new Uint8ClampedArray(buffer)

    const sumX = {}
    const sumY = {}
    const count = {}

    for ( let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4
            const r = pixels[i], g = pixels[i+1], b = pixels[i+2], a = pixels[i+3]
            if (a < 128) continue
            const key = `${r},${g},${b}`
            if (count[key]) {
                sumX[key] += x
                sumY[key] += y
                count[key]++
            } else {
                sumX[key] = x
                sumY[key] = y
                count[key] = 1
            }
        }
    }

    const centroids = {}
    for ( const key of Object.keys(count)) {
        const n = count[key]
        centroids[key] = {
            cx: Math.round(sumX[key] / n),
            cy: Math.round(sumY[key] / n),
            count: n,
        }
    }

    self.postMessage({ centroids })
}