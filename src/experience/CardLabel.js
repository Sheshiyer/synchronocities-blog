/**
 * CardLabel — Tarot card overlay that replaces the Codrops color-spec Label.
 * Shows card numeral, thothName, keyword, and hero phase as the user scrolls
 * through the depth gallery.
 */
class CardLabel {
  constructor(gallery) {
    this.gallery = gallery
    this.overlayElement = null
    this.numeralElement = null
    this.nameElement = null
    this.keywordElement = null
    this.phaseElement = null
    this.activePlaneIndex = -1
  }

  createElement() {
    const element = document.createElement('section')
    element.className = 'card-label-overlay'
    element.innerHTML = `
      <div class="card-label-overlay__left">
        <p class="card-label-overlay__numeral"></p>
        <p class="card-label-overlay__name"></p>
      </div>
      <div class="card-label-overlay__right">
        <p class="card-label-overlay__keyword"></p>
        <p class="card-label-overlay__phase"></p>
      </div>
    `
    return {
      element,
      numeralElement: element.querySelector('.card-label-overlay__numeral'),
      nameElement: element.querySelector('.card-label-overlay__name'),
      keywordElement: element.querySelector('.card-label-overlay__keyword'),
      phaseElement: element.querySelector('.card-label-overlay__phase'),
    }
  }

  init() {
    if (this.overlayElement) return

    const { element, numeralElement, nameElement, keywordElement, phaseElement } = this.createElement()

    this.overlayElement = element
    this.numeralElement = numeralElement
    this.nameElement = nameElement
    this.keywordElement = keywordElement
    this.phaseElement = phaseElement
    this.overlayElement.style.opacity = '0'

    document.body.append(this.overlayElement)
  }

  getTargetPlaneIndex(cameraZ) {
    const blendData = this.gallery.getPlaneBlendData(cameraZ)
    if (!blendData) return -1
    return blendData.blend >= 0.5 ? blendData.nextPlaneIndex : blendData.currentPlaneIndex
  }

  applyPlaneContent(planeIndex) {
    const plane = this.gallery.planes[planeIndex]
    if (!plane || this.activePlaneIndex === planeIndex) return

    const label = plane.userData.label || {}

    this.numeralElement.textContent = label.numeral || ''
    this.nameElement.textContent = label.thothName || label.title || ''
    this.keywordElement.textContent = label.keyword || ''
    this.phaseElement.textContent = label.heroPhase || ''

    this.activePlaneIndex = planeIndex
  }

  resize() {}

  update(camera = null) {
    if (!camera || !this.overlayElement) return

    const targetPlaneIndex = this.getTargetPlaneIndex(camera.position.z)
    if (targetPlaneIndex < 0) {
      this.overlayElement.style.opacity = '0'
      return
    }

    this.applyPlaneContent(targetPlaneIndex)
    this.overlayElement.style.opacity = '1'
  }

  render() {}

  dispose() {
    this.overlayElement?.remove()
    this.overlayElement = null
    this.numeralElement = null
    this.nameElement = null
    this.keywordElement = null
    this.phaseElement = null
    this.activePlaneIndex = -1
  }
}

export { CardLabel }
