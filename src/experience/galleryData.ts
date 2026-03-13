/**
 * Gallery plane data — maps blog posts to depth gallery planes.
 * Each plane carries:
 *   - TN brand colors for mood-reactive GLSL background
 *   - Card metadata for the CardLabel overlay
 *   - Position for parallax offset
 *   - slug for navigation
 *
 * Colors are derived from the Consciousness Color Spectrum (Goethe's Zur Farbenlehre).
 * The Kha arc gradient (Void Black → Witness Violet → Flow Indigo) traces the depth path.
 */

export interface GalleryPlane {
  fallbackColor: string
  accentColor: string
  textureSrc?: string
  position: { x: number; y: number }
  backgroundColor: string
  blob1Color: string
  blob2Color: string
  label: {
    numeral: string
    title: string
    thothName: string
    keyword: string
    heroPhase: string
    slug: string
    excerpt: string
  }
}

/**
 * Build gallery plane data from blog posts.
 * Posts should be sorted by their card number / journey order.
 */
export function buildGalleryData(
  posts: Array<{
    slug: string
    title: string
    card?: string
    excerpt?: string
    date: string
  }>
): GalleryPlane[] {
  // Card metadata lookup
  const cardMeta: Record<string, {
    numeral: string
    thothName: string
    keyword: string
    heroPhase: string
    color: string
    backgroundColor: string
    blob1Color: string
    blob2Color: string
  }> = {
    '0': {
      numeral: '0', thothName: 'The Fool', keyword: 'Leap',
      heroPhase: 'Ordinary World', color: '#F0EDE3',
      backgroundColor: '#070B1D', blob1Color: '#2D0050', blob2Color: '#0B50FB',
    },
    'IX': {
      numeral: 'IX', thothName: 'The Hermit', keyword: 'Solitude',
      heroPhase: 'Approach to Innermost Cave', color: '#8A9BA8',
      backgroundColor: '#0E1428', blob1Color: '#8A9BA8', blob2Color: '#2D0050',
    },
    'XIV': {
      numeral: 'XIV', thothName: 'Art', keyword: 'Integration',
      heroPhase: 'The Ordeal', color: '#2D0050',
      backgroundColor: '#2D0050', blob1Color: '#C5A017', blob2Color: '#10B5A7',
    },
    'XVI': {
      numeral: 'XVI', thothName: 'The Tower', keyword: 'Rupture',
      heroPhase: 'Approach to Innermost Cave', color: '#C65D3B',
      backgroundColor: '#1A0A08', blob1Color: '#C65D3B', blob2Color: '#C5A017',
    },
    'XVII': {
      numeral: 'XVII', thothName: 'The Star', keyword: 'Hope',
      heroPhase: 'Return with Elixir', color: '#C5A017',
      backgroundColor: '#0E1428', blob1Color: '#C5A017', blob2Color: '#0B50FB',
    },
    'XVIII': {
      numeral: 'XVIII', thothName: 'The Moon', keyword: 'Illusion',
      heroPhase: 'Road Back', color: '#0B50FB',
      backgroundColor: '#070B1D', blob1Color: '#0B50FB', blob2Color: '#2D0050',
    },
    'XX': {
      numeral: 'XX', thothName: 'The Aeon', keyword: 'Judgement',
      heroPhase: 'Resurrection', color: '#2D0050',
      backgroundColor: '#0E1428', blob1Color: '#2D0050', blob2Color: '#10B5A7',
    },
    'XXI': {
      numeral: 'XXI', thothName: 'The Universe', keyword: 'Completion',
      heroPhase: 'Return with Elixir', color: '#10B5A7',
      backgroundColor: '#070B1D', blob1Color: '#10B5A7', blob2Color: '#C5A017',
    },
  }

  // Default for posts without card mapping
  const defaultMeta = {
    numeral: '?', thothName: 'Unknown', keyword: 'Mystery',
    heroPhase: 'The Journey', color: '#8A9BA8',
    backgroundColor: '#070B1D', blob1Color: '#2D0050', blob2Color: '#0B50FB',
  }

  // Alternating X positions for visual variety
  const xPositions = [-0.9, 0.8, -0.7, 1.0, -0.8, 0.7, -0.6, 0.9]

  return posts.map((post, index) => {
    const meta = cardMeta[post.card || ''] || defaultMeta
    return {
      fallbackColor: meta.color,
      accentColor: meta.color,
      position: { x: xPositions[index % xPositions.length], y: 0 },
      backgroundColor: meta.backgroundColor,
      blob1Color: meta.blob1Color,
      blob2Color: meta.blob2Color,
      label: {
        numeral: meta.numeral,
        title: post.title,
        thothName: meta.thothName,
        keyword: meta.keyword,
        heroPhase: meta.heroPhase,
        slug: post.slug,
        excerpt: post.excerpt || '',
      },
    }
  })
}
