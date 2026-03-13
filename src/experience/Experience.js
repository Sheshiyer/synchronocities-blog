import * as THREE from 'three'
import { Gallery } from './Gallery.js'
import { Background } from './Background/index.js'
import { CardLabel } from './CardLabel.js'
import { TrailController } from './TrailController.js'

class Experience {
  constructor(planeData = []) {
    this.isInitialized = false
    this.isDisposed = false
    this.gallery = new Gallery(planeData)
    this.label = new CardLabel(this.gallery)
    this.background = new Background()
    this.trailController = new TrailController({ gallery: this.gallery })
  }

  async init(scene, camera) {
    if (this.isInitialized) return

    await this.gallery.init(scene)
    this.label.init()
    this.background.init()
    this.trailController.init(scene, camera)

    this.isInitialized = true
  }

  update(time, camera = null, scroll = null) {
    this.trailController.update(camera, scroll, time)

    // Gallery + label
    this.gallery.update(camera, scroll, time)
    this.label.update(camera)

    // Camera-driven updates
    if (camera) {
      // Mood colors
      const moodBlendData = this.gallery.getMoodBlendData(camera.position.z)
      if (moodBlendData) {
        this.background.setMoodBlend(moodBlendData)
      }

      // Depth + velocity -> background motion response
      const depthProgress = this.gallery.getDepthProgress(camera.position.z)
      const velocityMax = scroll?.velocityMax || 1
      const velocityIntensity = THREE.MathUtils.clamp(
        Math.abs(scroll?.velocity || 0) / Math.max(velocityMax, 0.0001),
        0, 1
      )

      const planeBlendData = this.gallery.getPlaneBlendData(camera.position.z)
      const blend = planeBlendData?.blend ?? 0
      const distanceFromBlendCenter = Math.abs(blend - 0.5) * 2
      const transitionStability = THREE.MathUtils.smoothstep(distanceFromBlendCenter, 0.35, 1)
      const stabilizedVelocityIntensity = velocityIntensity * transitionStability

      this.background.setMotionResponse({
        depthProgress,
        velocityIntensity: stabilizedVelocityIntensity,
      })
    }

    // Background tick
    this.background.update(time)
  }

  dispose() {
    if (this.isDisposed) return
    this.trailController.dispose()
    this.gallery.dispose()
    this.label.dispose()
    this.background.dispose()
    this.isDisposed = true
  }
}

export { Experience }
