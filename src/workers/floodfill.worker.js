// input: {buffer, width, height, startX, startY, fillR, fillG, fillB }
// output: { buffer }

self.onmessage = ({ data }) => {
    const { buffer, width, height, startX, startY, fillR, fillG, fillB } = data
    const pixels = new Uint8ClampedArray(buffer)

    const idx = (x, y) => (y * width + x) * 4
    const si = idx(startX, startY) // index from which fill starts
    const targetR = pixels[si], targetG = pixels[si+1], targetB = pixels[si+2]

    // if target is already that color
    if (targetR === fillR && targetG === fillG && targetB === fillB) {
        self.postMessage({ buffer: pixels.buffer, width, height }, [pixels.buffer])
        return
    }

    const visited = new Uint8Array(width * height)
    const stack = new Int32Array(width * height * 2)
    let sp = 0
    stack[sp++] = startX
    stack[sp++] = startY

    while (sp > 0) {
        const y = stack[--sp]
        const x = stack[--sp]

        if (x < 0 || x >= width || y < 0 || y >= height) continue
        const vi = y * width + x
        if (visited[vi]) continue

        const i = vi * 4
        if (pixels[i] !== targetR || pixels[i+1] !== targetG || pixels[i+2] !== targetB) continue

        visited[vi] = 1
        pixels[i] = fillR; pixels[i+1] = fillG; pixels[i+2] = fillB

        stack[sp++] = x + 1; stack[sp++] = y
        stack[sp++] = x - 1; stack[sp++] = y
        stack[sp++] = x; stack[sp++] = y + 1
        stack[sp++] = x; stack[sp++] = y - 1
    }

    self.postMessage({buffer: pixels.buffer, width, height}, [pixels.buffer])
}