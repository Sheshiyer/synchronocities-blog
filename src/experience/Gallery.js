import * as THREE from 'three'
import planeVertexShader from './Plane/shaders/vertex.glsl'
import planeFragmentShader from './Plane/shaders/fragment.glsl'

class Gallery {
  constructor(planeData = []) {
    this.isInitialized = false

    // Planes
    this.planes = []
    this.texturesBySource = new Map()
    this.useTextures = true
    this.planeGap = 5
    this.desktopPlaneScale = 1
    this.mobilePlaneScale = 0.65
    this.mobileXSpreadFactor = 0.25
    this.mobileBreakpoint = 768
    this.planeConfig = planeData
    this.moodSampleOffset = 1
    this.planeFadeSampleOffset = 1
    this.planeFadeSmoothing = 0.14

    // Parallax
    this.parallaxEnabled = true
    this.parallaxAmountX = 0.16
    this.parallaxAmountY = 0.08
    this.parallaxSmoothing = 0.08
    this.pointerTarget = new THREE.Vector2(0, 0)
    this.pointerCurrent = new THREE.Vector2(0, 0)

    // Breath
    this.breathEnabled = true
    this.breathTiltAmount = 0.045
    this.breathScaleAmount = 0.03
    this.breathSmoothing = 0.14
    this.breathGain = 1.1
    this.breathIntensity = 0
    this.targetBreathIntensity = 0

    // Gesture drift
    this.gestureParallaxEnabled = true
    this.gestureParallaxAmountY = 0.05
    this.gestureParallaxSmoothing = 0.05
    this.driftCurrent = 0
    this.driftTarget = 0

    // Pointer events
    this.onPointerMove = (event) => {
      const x = (event.clientX / window.innerWidth) * 2 - 1
      const y = (event.clientY / window.innerHeight) * 2 - 1
      this.pointerTarget.set(x, -y)
    }
    this.onPointerLeave = () => {
      this.pointerTarget.set(0, 0)
    }
  }

  async init(scene) {
    if (this.isInitialized) return

    this.setPlanes(scene)
    this.updatePlaneMaterialMode()
    this.updatePlaneScale()
    this.layoutPlanes()
    this.bindPointerEvents()

    this.isInitialized = true
  }

  setPlanes(scene) {
    const planeGeometry = new THREE.PlaneGeometry(3, 3)

    this.planeConfig.forEach((plane, index) => {
      const texture = this.texturesBySource.get(plane.textureSrc) || null
      const textureImage = texture?.image
      const aspectRatio =
        textureImage && textureImage.width > 0 && textureImage.height > 0
          ? textureImage.width / textureImage.height
          : 1
      const fallbackColor = plane.fallbackColor || '#ffffff'
      const accentColor = plane.accentColor || fallbackColor
      const backgroundColor = plane.backgroundColor || fallbackColor
      const blob1Color = plane.blob1Color || fallbackColor
      const blob2Color = plane.blob2Color || fallbackColor

      const hasTexture = Boolean(texture) && this.useTextures
      let planeMaterial

      if (hasTexture) {
        planeMaterial = new THREE.MeshBasicMaterial({
          color: '#ffffff',
          map: texture,
          side: THREE.DoubleSide,
          transparent: true,
          depthWrite: false,
          opacity: index === 0 ? 1 : 0,
        })
      } else {
        planeMaterial = new THREE.ShaderMaterial({
          vertexShader: planeVertexShader,
          fragmentShader: planeFragmentShader,
          uniforms: {
            uTime: { value: 0 },
            uOpacity: { value: index === 0 ? 1 : 0 },
            uBackgroundColor: { value: new THREE.Color(backgroundColor) },
            uBlob1Color: { value: new THREE.Color(blob1Color) },
            uBlob2Color: { value: new THREE.Color(blob2Color) },
            uAccentColor: { value: new THREE.Color(accentColor) },
          },
          side: THREE.DoubleSide,
          transparent: true,
          depthWrite: false,
        })
      }

      const planeMesh = new THREE.Mesh(planeGeometry, planeMaterial)
      planeMesh.userData.basePosition = plane.position
      planeMesh.userData.baseColor = fallbackColor
      planeMesh.userData.accentColor = accentColor
      planeMesh.userData.backgroundColor = backgroundColor
      planeMesh.userData.blob1Color = blob1Color
      planeMesh.userData.blob2Color = blob2Color
      planeMesh.userData.label = plane.label || {}
      planeMesh.userData.texture = texture
      planeMesh.userData.aspectRatio = aspectRatio
      planeMesh.userData.isShaderMaterial = !hasTexture
      scene.add(planeMesh)
      this.planes.push(planeMesh)
    })
  }

  updatePlaneScale() {
    const isMobileViewport = window.innerWidth <= this.mobileBreakpoint
    const scale = isMobileViewport ? this.mobilePlaneScale : this.desktopPlaneScale

    this.planes.forEach((plane) => {
      const aspectRatio = plane.userData.aspectRatio || 1
      plane.scale.set(scale * aspectRatio, scale, 1)
    })
  }

  layoutPlanes() {
    const xSpreadFactor = this.getXSpreadFactor()

    this.planes.forEach((plane, index) => {
      const basePosition = plane.userData.basePosition || { x: 0, y: 0 }
      const xPosition = basePosition.x * xSpreadFactor
      plane.position.set(xPosition, basePosition.y, -index * this.planeGap)
    })
  }

  /**
   * Infinite spiral loop — repositions planes in a ring around the camera.
   * Planes that scroll off-screen behind the camera wrap ahead, and vice versa.
   * This is the pool/recycling pattern used in infinite scroll implementations.
   */
  wrapPlanes(cameraZ) {
    const planeCount = this.planes.length
    if (planeCount === 0) return

    const totalCycleLength = planeCount * this.planeGap

    this.planes.forEach((plane, index) => {
      const baseZ = -index * this.planeGap
      let relativeZ = baseZ - cameraZ
      // Wrap into [-totalCycleLength/2, +totalCycleLength/2]
      relativeZ = ((relativeZ % totalCycleLength) + totalCycleLength + totalCycleLength / 2) % totalCycleLength - totalCycleLength / 2
      plane.userData.wrappedZ = cameraZ + relativeZ
    })
  }

  getXSpreadFactor() {
    const isMobileViewport = window.innerWidth <= this.mobileBreakpoint
    return isMobileViewport ? this.mobileXSpreadFactor : 1
  }

  getDepthRange() {
    if (!this.planes.length) {
      return { nearestZ: 0, deepestZ: 0 }
    }
    // Return fixed base positions (unwrapped) for consistent scroll bounds reference
    return {
      nearestZ: 0,
      deepestZ: -(this.planes.length - 1) * this.planeGap,
    }
  }

  getDepthProgress(cameraZ) {
    const planeCount = this.planes.length
    if (planeCount <= 1) return 0
    const totalCycleLength = planeCount * this.planeGap
    if (totalCycleLength <= 0) return 0
    // Wrapping progress: maps camera position into [0, 1) within the cycle
    const depth = -cameraZ
    return ((depth / totalCycleLength) % 1 + 1) % 1
  }

  getActivePlaneIndex(cameraZ) {
    if (!this.planes.length) return -1
    // Use virtual index (consistent with blend/visibility) for correct wrap behavior
    const blendData = this.getPlaneBlendData(cameraZ)
    if (!blendData) return -1
    return blendData.blend >= 0.5 ? blendData.nextPlaneIndex : blendData.currentPlaneIndex
  }

  getMoodColorsByIndex(index) {
    if (index < 0 || index >= this.planes.length) return null
    const { backgroundColor, blob1Color, blob2Color } = this.planes[index].userData
    if (!backgroundColor) return null
    return { background: backgroundColor, blob1: blob1Color, blob2: blob2Color }
  }

  getMoodBlendData(cameraZ) {
    if (!this.planes.length) return null
    const safeCameraZ = Number.isFinite(cameraZ) ? cameraZ : 0
    const planeCount = this.planes.length
    const moodSampleZ = safeCameraZ - this.planeGap * this.moodSampleOffset

    if (planeCount <= 1 || this.planeGap <= 0) {
      const singleMood = this.getMoodColorsByIndex(0)
      if (!singleMood) return null
      return { currentMood: singleMood, nextMood: singleMood, blend: 0 }
    }

    // Virtual index with modulo wrapping for infinite loop
    const normalizedDepth = -moodSampleZ / this.planeGap
    const wrappedDepth = ((normalizedDepth % planeCount) + planeCount) % planeCount
    const currentPlaneIndex = Math.floor(wrappedDepth) % planeCount
    const nextPlaneIndex = (currentPlaneIndex + 1) % planeCount
    const blend = wrappedDepth - Math.floor(wrappedDepth)

    const currentMood = this.getMoodColorsByIndex(currentPlaneIndex)
    const nextMood = this.getMoodColorsByIndex(nextPlaneIndex) || currentMood
    if (!currentMood || !nextMood) return null

    return { currentMood, nextMood, blend }
  }

  getPlaneBlendData(cameraZ) {
    if (!this.planes.length) return null
    const planeGap = Math.max(this.planeGap, 0.0001)
    const planeCount = this.planes.length
    const sampledCameraZ = cameraZ - planeGap * this.planeFadeSampleOffset

    // Virtual index with modulo wrapping for infinite loop
    // firstPlaneBaseZ = 0, so normalizedDepth = -sampledCameraZ / planeGap
    const normalizedDepth = -sampledCameraZ / planeGap
    const wrappedDepth = ((normalizedDepth % planeCount) + planeCount) % planeCount
    const currentPlaneIndex = Math.floor(wrappedDepth) % planeCount
    const nextPlaneIndex = (currentPlaneIndex + 1) % planeCount
    const blend = wrappedDepth - Math.floor(wrappedDepth)

    return { currentPlaneIndex, nextPlaneIndex, blend }
  }

  getTextureSources() {
    const textureSources = this.planeConfig
      .map((planeDefinition) => planeDefinition.textureSrc)
      .filter(Boolean)
    return [...new Set(textureSources)]
  }

  setPreloadedTextures(texturesBySource) {
    this.texturesBySource = texturesBySource instanceof Map ? texturesBySource : new Map()
  }

  updatePlaneMaterialMode() {
    this.planes.forEach((plane) => {
      if (plane.userData.isShaderMaterial) return
      const planeMaterial = plane.material
      const texture = plane.userData.texture || null
      const hasTexture = Boolean(texture)
      planeMaterial.map = this.useTextures && hasTexture ? texture : null
      planeMaterial.color.set(this.useTextures && hasTexture ? '#ffffff' : plane.userData.baseColor)
      planeMaterial.needsUpdate = true
    })
  }

  updatePlaneVisibility(cameraZ) {
    const blendData = this.getPlaneBlendData(cameraZ)
    if (!blendData) return

    const { currentPlaneIndex, nextPlaneIndex, blend } = blendData

    this.planes.forEach((plane, index) => {
      let targetOpacity = 0
      if (index === currentPlaneIndex) targetOpacity = 1 - blend
      if (index === nextPlaneIndex) targetOpacity = Math.max(targetOpacity, blend)

      if (plane.userData.isShaderMaterial) {
        const currentOpacity = plane.material.uniforms.uOpacity.value
        plane.material.uniforms.uOpacity.value = THREE.MathUtils.lerp(currentOpacity, targetOpacity, this.planeFadeSmoothing)
      } else {
        const currentOpacity = Number.isFinite(plane.material.opacity) ? plane.material.opacity : 0
        plane.material.opacity = THREE.MathUtils.lerp(currentOpacity, targetOpacity, this.planeFadeSmoothing)
        plane.material.needsUpdate = true
      }
    })
  }

  bindPointerEvents() {
    window.addEventListener('pointermove', this.onPointerMove, { passive: true })
    window.addEventListener('pointerleave', this.onPointerLeave, { passive: true })
  }

  updatePlaneMotion(scroll = null) {
    this.pointerCurrent.lerp(this.pointerTarget, this.parallaxSmoothing)

    const velocityMax = Math.max(scroll?.velocityMax || 1, 0.0001)
    const velocityNormalized = THREE.MathUtils.clamp(
      Math.abs(scroll?.velocity || 0) / velocityMax, 0, 1
    )
    const scrollDrift = THREE.MathUtils.clamp((scroll?.velocity || 0) / velocityMax, -1, 1)
    this.targetBreathIntensity = this.breathEnabled
      ? THREE.MathUtils.clamp(velocityNormalized * this.breathGain, 0, 1) : 0
    this.breathIntensity = THREE.MathUtils.lerp(
      this.breathIntensity, this.targetBreathIntensity, this.breathSmoothing
    )
    this.driftTarget = this.gestureParallaxEnabled ? scrollDrift : 0
    this.driftCurrent = THREE.MathUtils.lerp(
      this.driftCurrent, this.driftTarget, this.gestureParallaxSmoothing
    )

    const xSpreadFactor = this.getXSpreadFactor()

    this.planes.forEach((plane, index) => {
      const basePosition = plane.userData.basePosition || { x: 0, y: 0 }
      const xPosition = basePosition.x * xSpreadFactor
      const yPosition = basePosition.y
      const zPosition = plane.userData.wrappedZ !== undefined ? plane.userData.wrappedZ : -index * this.planeGap
      const opacity = Number.isFinite(plane.material.opacity) ? plane.material.opacity : 0
      const depthInfluence = 1 + index * 0.05
      const parallaxInfluence = this.parallaxEnabled ? opacity * depthInfluence : 0

      const parallaxOffsetX = this.pointerCurrent.x * this.parallaxAmountX * parallaxInfluence
      const parallaxOffsetY = this.pointerCurrent.y * this.parallaxAmountY * parallaxInfluence
      const gestureOffsetY = this.driftCurrent * this.gestureParallaxAmountY

      plane.position.x = xPosition + parallaxOffsetX
      plane.position.y = yPosition + parallaxOffsetY + gestureOffsetY
      plane.position.z = zPosition

      const breathInfluence = this.breathEnabled ? this.breathIntensity * opacity : 0
      const tiltX = -this.pointerCurrent.y * this.breathTiltAmount * breathInfluence
      const tiltY = this.pointerCurrent.x * this.breathTiltAmount * breathInfluence
      plane.rotation.x = tiltX
      plane.rotation.y = tiltY
      plane.rotation.z = 0

      const aspectRatio = plane.userData.aspectRatio || 1
      const baseScale = window.innerWidth <= this.mobileBreakpoint ? this.mobilePlaneScale : this.desktopPlaneScale
      const scalePulse = 1 + this.breathScaleAmount * breathInfluence
      plane.scale.x = baseScale * aspectRatio * scalePulse
      plane.scale.y = baseScale * scalePulse
      plane.scale.z = 1
    })
  }

  updateShaderTime(time) {
    this.planes.forEach((plane) => {
      if (plane.userData.isShaderMaterial) {
        plane.material.uniforms.uTime.value = time
      }
    })
  }

  update(camera = null, scroll = null, time = 0) {
    if (!camera) return
    this.updatePlaneVisibility(camera.position.z)
    this.updatePlaneMotion(scroll)
    this.updateShaderTime(time)
  }

  dispose() {
    window.removeEventListener('pointermove', this.onPointerMove)
    window.removeEventListener('pointerleave', this.onPointerLeave)
  }
}

export { Gallery }
