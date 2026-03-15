import * as THREE from 'three'
import { Trail } from './Trail.js'
import { TrailHeadParticles } from './TrailHeadParticles.js'

const FULL_CIRCLE_RADIANS = Math.PI * 2

class TrailController {
  constructor({ gallery }) {
    this.trail = new Trail()
    this.trailHeadParticles = new TrailHeadParticles()
    this.gallery = gallery
    this.trailHeadPosition = new THREE.Vector3()
    this.timer = new THREE.Timer()

    this.configuration = {
      isEnabled: true,
      pathSettings: {
        startXPosition: -0.96,
        startYPosition: -1.05,
        horizontalWidth: 3,
        horizontalCycles: 1.85,
        verticalAmplitude: 0.78,
        verticalCycles: 2.1,
        distanceAheadOfCamera: 1.65,
        baseDepthOffset: 4.78,
        depthSpan: 6.52,
        progressDepthOffset: -0.1,
      },
      responsiveSettings: {
        mobileBreakpoint: 768,
        mobileWidthScale: 0.35,
        mobileStartXOffset: 0.35,
      },
      pointSettings: {
        minimumPointCount: 14,
        maximumPointCount: 220,
        reverseLengthScale: 0.55,
        initialSeedPointCount: 10,
        initialSeedStepZ: 0.12,
        trimPerFrameForward: 4,
        trimPerFrameReverse: 32,
      },
      opacitySettings: {
        baseOpacity: 0.51,
        idleOpacityAtStart: 0.55,
        idleProgressThreshold: 0.01,
        startVisibilityBias: 0.1,
        edgeFadeStart: 0.04,
        edgeFadeEnd: 0.2,
        opacitySmoothing: 0.12,
      },
      visualSettings: {
        trailColor: '#C5A017',
        glowColor: '#2D0050',
        glowIntensity: 1.35,
        curveTension: 0.67,
        pointSmoothing: 0.53,
      },
      specialEffectsSettings: {
        showHeadParticles: true,
      },
      directionChangeEpsilon: 0.0005,
    }

    this.runtimeState = {
      hasSeededInitialPoints: false,
      hasUserMovedFromStart: false,
      previousProgress: null,
      previousDirection: 0,
      currentOpacity: this.configuration.opacitySettings.baseOpacity,
    }

    this.applyVisualSettings()
  }

  applyVisualSettings() {
    const { visualSettings, opacitySettings } = this.configuration
    this.trail.material.color.set(visualSettings.trailColor)
    this.trail.material.emissive.set(visualSettings.glowColor)
    this.trail.material.emissiveIntensity = visualSettings.glowIntensity
    this.trail.material.opacity = opacitySettings.baseOpacity
    this.trail.material.needsUpdate = true
    this.trail.curveTension = visualSettings.curveTension
    this.trail.pointSmoothing = visualSettings.pointSmoothing
    this.trailHeadParticles.particles.forEach((particle) => {
      particle.mesh.material.color.set(visualSettings.trailColor)
    })
  }

  init(scene, camera) {
    scene.add(this.trail.object)
    scene.add(this.trailHeadParticles.object)
    this.seedInitialPoints(camera)
  }

  dispose() {
    this.trail.dispose()
    this.trailHeadParticles.dispose()
    this.runtimeState.hasSeededInitialPoints = false
    this.runtimeState.hasUserMovedFromStart = false
    this.runtimeState.previousProgress = null
    this.runtimeState.previousDirection = 0
  }

  update(camera = null, scroll = null, time = null) {
    if (!camera) return
    if (Number.isFinite(time)) {
      this.timer.update(time)
    } else {
      this.timer.update()
    }
    const deltaSeconds = this.timer.getDelta()

    this.trail.object.visible = this.configuration.isEnabled
    const shouldShowHeadParticles =
      this.configuration.isEnabled && this.configuration.specialEffectsSettings.showHeadParticles
    this.trailHeadParticles.setEnabled(shouldShowHeadParticles)
    if (!this.configuration.isEnabled) return

    const currentProgress = this.getProgress(camera, scroll)
    if (currentProgress > this.configuration.opacitySettings.idleProgressThreshold) {
      this.runtimeState.hasUserMovedFromStart = true
    }

    const currentDirection = this.getDirection(currentProgress)
    const hasDirectionReversed =
      currentDirection !== 0 &&
      this.runtimeState.previousDirection !== 0 &&
      currentDirection !== this.runtimeState.previousDirection

    this.updateLength(currentProgress, currentDirection || this.runtimeState.previousDirection)
    const trailHeadPosition = this.computeHeadPosition(camera.position.z, currentProgress)
    this.updateOpacity(currentProgress)

    if (hasDirectionReversed) {
      this.trail.reset()
      const restartLeadPosition = trailHeadPosition.clone()
      restartLeadPosition.z += currentDirection * this.configuration.pointSettings.initialSeedStepZ
      this.trail.addPoint(restartLeadPosition)
    }

    this.trail.addPoint(trailHeadPosition)

    if (currentDirection !== 0) {
      this.runtimeState.previousDirection = currentDirection
    }
    this.runtimeState.previousProgress = currentProgress

    this.trailHeadParticles.update(
      deltaSeconds,
      trailHeadPosition,
      this.runtimeState.currentOpacity,
      true
    )
  }

  getProgress(camera, scroll) {
    // Use blend-based progress which wraps correctly for infinite scroll
    const blend = this.gallery.getPlaneBlendData(camera.position.z)
    if (blend) {
      const lastIndex = Math.max(this.gallery.planes.length - 1, 1)
      return THREE.MathUtils.clamp((blend.currentPlaneIndex + blend.blend) / lastIndex, 0, 1)
    }
    return this.gallery.getDepthProgress(camera.position.z)
  }

  computeHeadPosition(cameraZ, progress) {
    const clampedProgress = THREE.MathUtils.clamp(progress, 0, 1)
    const { pathSettings, responsiveSettings } = this.configuration
    const horizontalCycles = Math.max(pathSettings.horizontalCycles, 0.0001)
    const verticalCycles = Math.max(pathSettings.verticalCycles, 0.0001)
    const isMobileViewport =
      typeof window !== 'undefined' && window.innerWidth <= responsiveSettings.mobileBreakpoint
    const responsiveStartXPosition =
      pathSettings.startXPosition + (isMobileViewport ? responsiveSettings.mobileStartXOffset : 0)
    const responsiveHorizontalWidth =
      pathSettings.horizontalWidth * (isMobileViewport ? responsiveSettings.mobileWidthScale : 1)

    const xPosition =
      responsiveStartXPosition +
      Math.sin(clampedProgress * FULL_CIRCLE_RADIANS * horizontalCycles) * responsiveHorizontalWidth
    const yPosition =
      pathSettings.startYPosition +
      Math.sin(clampedProgress * FULL_CIRCLE_RADIANS * verticalCycles) * pathSettings.verticalAmplitude
    const depthProgress =
      pathSettings.progressDepthOffset + clampedProgress * (1 - pathSettings.progressDepthOffset)
    const zPosition =
      cameraZ + pathSettings.distanceAheadOfCamera -
      (pathSettings.baseDepthOffset + depthProgress * pathSettings.depthSpan)

    this.trailHeadPosition.set(xPosition, yPosition, zPosition)
    return this.trailHeadPosition
  }

  seedInitialPoints(camera) {
    if (this.runtimeState.hasSeededInitialPoints || !camera) return

    const startPosition = this.computeHeadPosition(camera.position.z, 0).clone()

    for (
      let index = this.configuration.pointSettings.initialSeedPointCount;
      index >= 0;
      index -= 1
    ) {
      const seedPosition = startPosition.clone()
      seedPosition.z -= index * this.configuration.pointSettings.initialSeedStepZ
      this.trail.addPoint(seedPosition)
    }

    this.runtimeState.hasSeededInitialPoints = true
  }

  getDirection(progress) {
    if (this.runtimeState.previousProgress === null) return 0
    const progressDelta = progress - this.runtimeState.previousProgress
    if (Math.abs(progressDelta) <= this.configuration.directionChangeEpsilon) return 0
    return Math.sign(progressDelta)
  }

  updateLength(progress, direction) {
    const { pointSettings } = this.configuration
    const lengthProgress = direction < 0 ? progress * pointSettings.reverseLengthScale : progress
    this.trail.maxPoints = Math.round(
      THREE.MathUtils.lerp(
        pointSettings.minimumPointCount,
        pointSettings.maximumPointCount,
        THREE.MathUtils.clamp(lengthProgress, 0, 1)
      )
    )
    this.trail.maxTrimPerFrame =
      direction < 0 ? pointSettings.trimPerFrameReverse : pointSettings.trimPerFrameForward
  }

  updateOpacity(progress) {
    const { opacitySettings } = this.configuration
    const startDistance = THREE.MathUtils.clamp(progress + opacitySettings.startVisibilityBias, 0, 1)
    const endDistance = 1 - progress
    const closestEdgeDistance = Math.min(startDistance, endDistance)

    const edgeVisibility = THREE.MathUtils.smoothstep(
      closestEdgeDistance, opacitySettings.edgeFadeStart, opacitySettings.edgeFadeEnd
    )

    const startupVisibility =
      !this.runtimeState.hasUserMovedFromStart && progress <= opacitySettings.idleProgressThreshold
        ? opacitySettings.idleOpacityAtStart : 0

    const visibility = Math.max(edgeVisibility, startupVisibility)
    const targetOpacity = opacitySettings.baseOpacity * visibility

    this.runtimeState.currentOpacity = THREE.MathUtils.lerp(
      this.runtimeState.currentOpacity, targetOpacity, opacitySettings.opacitySmoothing
    )
    this.trail.material.opacity = this.runtimeState.currentOpacity
  }
}

export { TrailController }
