/**
 * CardLabel — Tarot card overlay that replaces the Codrops color-spec Label.
 * Shows card numeral, thothName, title, excerpt, keyword, hero phase,
 * and a click hint as the user scrolls through the depth gallery.
 */
class CardLabel {
  constructor(gallery) {
    this.gallery = gallery
    this.overlayElement = null
    this.numeralElement = null
    this.nameElement = null
    this.titleElement = null
    this.excerptElement = null
    this.keywordElement = null
    this.phaseElement = null
    this.hintElement = null
    this.activePlaneIndex = -1
  }

  createElement() {
    const element = document.createElement('section')
    element.className = 'card-label-overlay'
    element.innerHTML = `
      <div class="card-label-overlay__left">
        <p class="card-label-overlay__numeral"></p>
        <p class="card-label-overlay__name"></p>
        <h2 class="card-label-overlay__title"></h2>
        <p class="card-label-overlay__excerpt"></p>
      </div>
      <div class="card-label-overlay__right">
        <p class="card-label-overlay__keyword"></p>
        <p class="card-label-overlay__phase"></p>
        <p class="card-label-overlay__hint">click to read · scroll to explore</p>
      </div>
    `
    return {
      element,
      numeralElement: element.querySelector('.card-label-overlay__numeral'),
      nameElement: element.querySelector('.card-label-overlay__name'),
      titleElement: element.querySelector('.card-label-overlay__title'),
      excerptElement: element.querySelector('.card-label-overlay__excerpt'),
      keywordElement: element.querySelector('.card-label-overlay__keyword'),
      phaseElement: element.querySelector('.card-label-overlay__phase'),
      hintElement: element.querySelector('.card-label-overlay__hint'),
    }
  }

  init() {
    if (this.overlayElement) return

    const {
      element, numeralElement, nameElement, titleElement, excerptElement,
      keywordElement, phaseElement, hintElement,
    } = this.createElement()

    this.overlayElement = element
    this.numeralElement = numeralElement
    this.nameElement = nameElement
    this.titleElement = titleElement
    this.excerptElement = excerptElement
    this.keywordElement = keywordElement
    this.phaseElement = phaseElement
    this.hintElement = hintElement
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
    this.nameElement.textContent = label.thothName || ''
    this.titleElement.textContent = label.title || ''
    this.excerptElement.textContent = label.excerpt || ''
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
    this.titleElement = null
    this.excerptElement = null
    this.keywordElement = null
    this.phaseElement = null
    this.hintElement = null
    this.activePlaneIndex = -1
  }
}

export { CardLabel }
