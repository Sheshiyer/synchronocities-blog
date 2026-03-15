import { useEffect, useRef, useCallback } from 'react'
import { buildGalleryData } from '../experience/galleryData'
import type { GalleryPlane } from '../experience/galleryData'

interface Post {
  slug: string
  title: string
  card?: string
  date: string
  excerpt?: string
  featuredImage?: string
}

interface DepthGalleryProps {
  posts: Post[]
}

export default function DepthGallery({ posts }: DepthGalleryProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<any>(null)
  const experienceRef = useRef<any>(null)
  const planeDataRef = useRef<GalleryPlane[]>([])

  const handleClick = useCallback(() => {
    const engine = engineRef.current
    const experience = experienceRef.current
    if (!engine || !experience) return

    const gallery = experience.gallery
    const cameraZ = engine.camera.position.z
    const activeIndex = gallery.getActivePlaneIndex(cameraZ)
    if (activeIndex < 0) return

    const plane = gallery.planes[activeIndex]
    const slug = plane?.userData?.label?.slug
    if (slug) {
      window.location.href = `/posts/${slug}`
    }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let disposed = false

    async function init() {
      const { Engine } = await import('../experience/Engine.js')
      const { Experience } = await import('../experience/Experience.js')

      if (disposed) return

      const planeData = buildGalleryData(posts)
      planeDataRef.current = planeData as GalleryPlane[]
      const experience = new Experience(planeData as any)
      const engine = new Engine(canvas!, experience)

      engineRef.current = engine
      experienceRef.current = experience
      await engine.init()
    }

    init()

    return () => {
      disposed = true
      if (engineRef.current) {
        engineRef.current.dispose()
        engineRef.current = null
      }
      experienceRef.current = null
    }
  }, [posts])

  return (
    <canvas
      ref={canvasRef}
      className="depth-gallery-canvas"
      onClick={handleClick}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        zIndex: 0,
        cursor: 'pointer',
      }}
    />
  )
}
