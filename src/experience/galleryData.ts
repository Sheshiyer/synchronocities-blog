/**
 * Gallery plane data — each post is a unique plane in the depth journey.
 * No grouping by card — each post is its own step on the spiral.
 * Cards that repeat (e.g., multiple "0" or "XXI" posts) represent
 * different laps of the spiral, not repetitions.
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
 * Per-post color palette — every post gets unique colors.
 * Posts with card numerals get their tarot palette.
 * Posts without cards get colors derived from their journey position.
 */
const CARD_COLORS: Record<string, {
  color: string
  backgroundColor: string
  blob1Color: string
  blob2Color: string
}> = {
  '0':    { color: '#C5A030', backgroundColor: '#0D1033', blob1Color: '#3A6BD4', blob2Color: '#6B3FA0' },
  'IX':   { color: '#8B7DA8', backgroundColor: '#1A1E2E', blob1Color: '#4A3F6B', blob2Color: '#2D5B45' },
  'XIV':  { color: '#C5A030', backgroundColor: '#1A2E1A', blob1Color: '#2D8B5E', blob2Color: '#6B3FA0' },
  'XVI':  { color: '#C65D3B', backgroundColor: '#1A0E08', blob1Color: '#C65D3B', blob2Color: '#D4A020' },
  'XVII': { color: '#D4B030', backgroundColor: '#0A1530', blob1Color: '#D4B030', blob2Color: '#1A6B8A' },
  'XVIII':{ color: '#8AB0D4', backgroundColor: '#0A0D2E', blob1Color: '#4A3FD4', blob2Color: '#6B3FA0' },
  'XX':   { color: '#D4B030', backgroundColor: '#0D1428', blob1Color: '#2D8B5E', blob2Color: '#6B3FA0' },
  'XXI':  { color: '#C5A030', backgroundColor: '#0A1A1E', blob1Color: '#1A6B5E', blob2Color: '#C5A030' },
}

/**
 * Journey-position color palettes for posts without card mapping.
 * Progresses through the Consciousness Color Spectrum.
 */
const JOURNEY_PALETTES = [
  { color: '#C65D3B', backgroundColor: '#1A0A06', blob1Color: '#C65D3B', blob2Color: '#8B4513' },  // forge/fire
  { color: '#8A9BA8', backgroundColor: '#0E1420', blob1Color: '#3A5DA0', blob2Color: '#1A2D4A' },  // steel/preparation
  { color: '#C5A030', backgroundColor: '#12100A', blob1Color: '#C5A030', blob2Color: '#8B6914' },  // gold/arrival
  { color: '#6B3FA0', backgroundColor: '#0D0A1E', blob1Color: '#6B3FA0', blob2Color: '#3A1D6B' },  // violet/depth
  { color: '#0B50FB', backgroundColor: '#060D2A', blob1Color: '#0B50FB', blob2Color: '#2D0050' },  // indigo/speech
  { color: '#10B5A7', backgroundColor: '#061A18', blob1Color: '#10B5A7', blob2Color: '#0B50FB' },  // teal/expansion
  { color: '#D4A020', backgroundColor: '#141008', blob1Color: '#D4A020', blob2Color: '#C65D3B' },  // amber/satchel
  { color: '#3A6BD4', backgroundColor: '#080D1E', blob1Color: '#3A6BD4', blob2Color: '#10B5A7' },  // blue/initiation
  { color: '#8AB0D4', backgroundColor: '#0A0D2E', blob1Color: '#8AB0D4', blob2Color: '#6B3FA0' },  // moonlight/circle
  { color: '#2D8B5E', backgroundColor: '#0A1A12', blob1Color: '#2D8B5E', blob2Color: '#C5A030' },  // emerald/integration
  { color: '#F0EDE3', backgroundColor: '#0E1014', blob1Color: '#8A9BA8', blob2Color: '#C5A030' },  // parchment/witness
  { color: '#10B5A7', backgroundColor: '#060E14', blob1Color: '#10B5A7', blob2Color: '#0B50FB' },  // completion
]

/**
 * Build gallery plane data from blog posts.
 * Each post is a unique step on the spiral — sorted chronologically.
 */
export function buildGalleryData(
  posts: Array<{
    slug: string
    title: string
    card?: string
    excerpt?: string
    date: string
    featuredImage?: string
  }>
): GalleryPlane[] {
  // Alternating X positions for visual variety
  const xPositions = [-0.9, 0.8, -0.7, 1.0, -0.8, 0.7, -0.6, 0.9, -0.85, 0.75, -0.65, 0.95, -0.75, 0.85, -0.55, 0.9, -0.8, 0.7, -0.9, 0.8]

  // Track how many times each card has appeared for "lap" numbering
  const cardLapCount: Record<string, number> = {}

  return posts.map((post, index) => {
    const cardKey = post.card || ''
    const cardColors = CARD_COLORS[cardKey]

    // Track lap number for repeated cards
    if (cardKey) {
      cardLapCount[cardKey] = (cardLapCount[cardKey] || 0) + 1
    }
    const lap = cardLapCount[cardKey] || 1

    // Get colors: card palette if available, otherwise journey-position palette
    const journeyPalette = JOURNEY_PALETTES[index % JOURNEY_PALETTES.length]
    const colors = cardColors || journeyPalette

    // Build a meaningful label from the post itself
    // The title IS the identity — the card numeral is context
    const cardNumeral = post.card || toRoman(index + 1)
    const thothName = post.card
      ? (CARD_COLORS[post.card] ? getThothName(post.card) : post.title)
      : post.title.split(':')[0] || post.title

    return {
      fallbackColor: colors.color,
      accentColor: colors.color,
      textureSrc: post.featuredImage,
      position: { x: xPositions[index % xPositions.length], y: 0 },
      backgroundColor: colors.backgroundColor,
      blob1Color: colors.blob1Color,
      blob2Color: colors.blob2Color,
      label: {
        numeral: cardNumeral,
        title: post.title,
        thothName: thothName,
        keyword: lap > 1 ? `Lap ${lap}` : '',
        heroPhase: '',
        slug: post.slug,
        excerpt: post.excerpt || '',
      },
    }
  })
}

function toRoman(num: number): string {
  const pairs: [number, string][] = [
    [1000,'M'],[900,'CM'],[500,'D'],[400,'CD'],
    [100,'C'],[90,'XC'],[50,'L'],[40,'XL'],
    [10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I'],
  ]
  let result = ''
  for (const [value, numeral] of pairs) {
    while (num >= value) { result += numeral; num -= value }
  }
  return result
}

function getThothName(card: string): string {
  const names: Record<string, string> = {
    '0': 'The Fool', 'IX': 'The Hermit', 'XIV': 'Art',
    'XVI': 'The Tower', 'XVII': 'The Star', 'XVIII': 'The Moon',
    'XX': 'The Aeon', 'XXI': 'The Universe',
  }
  return names[card] || card
}
