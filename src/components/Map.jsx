import { useState } from 'react'
import '../App.css'

function Map() {
  const [map, setMap] = useState(null)
  const [clickedPixel, setClickedPixel] = useState(null)

  return (
    <>
        <section id="center">
            <div className="hero"> 
                <h1>Map Component</h1>
                <input type="file" accept="image/*" onChange={(e) => {
                    const file = e.target.files[0]
                    const reader = new FileReader()
                    reader.onload = (event) => {
                        const img = new Image()
                        img.onload = () => {
                            setMap(img)
                        }
                        img.src = event.target.result
                    }
                    reader.readAsDataURL(file)
                }} />
            </div>
                <div>
                    {map && (
                        <canvas
                            width={map.width}
                            height={map.height}
                            onClick={(e) => {
                                const rect = e.target.getBoundingClientRect()
                                const x = e.clientX - rect.left
                                const y = e.clientY - rect.top
                                const ctx = e.target.getContext('2d')
                                const pixelData = ctx.getImageData(x, y, 1, 1).data
                                setClickedPixel(pixelData)
                            }}
                            ref={(canvas) => {
                                if (canvas && map) {
                                    const ctx = canvas.getContext('2d')
                                    ctx.drawImage(map, 0, 0)
                                }
                            }}
                        />
                    )}
                    {clickedPixel && (
                        <p>Clicked pixel RGB: ({clickedPixel[0]}, {clickedPixel[1]}, {clickedPixel[2]})</p>
                    )}
                </div>
        </section>
    </>
  )
}

export default Map
