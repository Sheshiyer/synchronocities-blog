import { useEffect, useRef } from 'react'
import { buildGalleryData } from '../experience/galleryData'
import type { GalleryPlane } from '../experience/galleryData'

interface Post {
  slug: string
  title: string
  card?: string
  date: string
  excerpt?: string
}

interface DepthGalleryProps {
  posts: Post[]
}

export default function DepthGallery({ posts }: DepthGalleryProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<any>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let disposed = false

    async function init() {
      // Dynamic imports to avoid SSR issues with Three.js
      const { Engine } = await import('../experience/Engine.js')
      const { Experience } = await import('../experience/Experience.js')

      if (disposed) return

      const planeData = buildGalleryData(posts)
      const experience = new Experience(planeData as any)
      const engine = new Engine(canvas!, experience)

      engineRef.current = engine
      await engine.init()
    }

    init()

    return () => {
      disposed = true
      if (engineRef.current) {
        engineRef.current.dispose()
        engineRef.current = null
      }
    }
  }, [posts])

  return (
    <canvas
      ref={canvasRef}
      className="depth-gallery-canvas"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        zIndex: 0,
      }}
    />
  )
}
