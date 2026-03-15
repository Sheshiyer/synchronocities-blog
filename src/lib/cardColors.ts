export interface CardPalette {
  backgroundColor: string;
  blob1Color: string;
  blob2Color: string;
  accentColor: string;
  gradientFrom: string;
  gradientVia: string;
  gradientTo: string;
  textureSrc: string;
}

export const CARD_PALETTES: Record<string, CardPalette> = {
  '0': {
    backgroundColor: '#0D1033', blob1Color: '#3A6BD4', blob2Color: '#6B3FA0',
    accentColor: '#C5A030',
    gradientFrom: '#0D1033', gradientVia: '#1A1560', gradientTo: '#6B3FA0',
    textureSrc: '/cards/tarot-00-fool.webp',
  },
  'IX': {
    backgroundColor: '#1A1E2E', blob1Color: '#4A3F6B', blob2Color: '#2D5B45',
    accentColor: '#8B7DA8',
    gradientFrom: '#1A1E2E', gradientVia: '#2A2D44', gradientTo: '#2D5B45',
    textureSrc: '/cards/tarot-09-hermit.webp',
  },
  'XIV': {
    backgroundColor: '#1A2E1A', blob1Color: '#2D8B5E', blob2Color: '#6B3FA0',
    accentColor: '#C5A030',
    gradientFrom: '#1A2E1A', gradientVia: '#1A3D2A', gradientTo: '#2D8B5E',
    textureSrc: '/cards/tarot-14-art.webp',
  },
  'XVI': {
    backgroundColor: '#1A0E08', blob1Color: '#C65D3B', blob2Color: '#D4A020',
    accentColor: '#C65D3B',
    gradientFrom: '#1A0E08', gradientVia: '#2D1510', gradientTo: '#C65D3B',
    textureSrc: '/cards/tarot-16-tower.webp',
  },
  'XVII': {
    backgroundColor: '#0A1530', blob1Color: '#D4B030', blob2Color: '#1A6B8A',
    accentColor: '#D4B030',
    gradientFrom: '#0A1530', gradientVia: '#0E2040', gradientTo: '#1A6B8A',
    textureSrc: '/cards/tarot-17-star.webp',
  },
  'XVIII': {
    backgroundColor: '#0A0D2E', blob1Color: '#4A3FD4', blob2Color: '#6B3FA0',
    accentColor: '#8AB0D4',
    gradientFrom: '#0A0D2E', gradientVia: '#151840', gradientTo: '#4A3FD4',
    textureSrc: '/cards/tarot-18-moon.webp',
  },
  'XX': {
    backgroundColor: '#0D1428', blob1Color: '#2D8B5E', blob2Color: '#6B3FA0',
    accentColor: '#D4B030',
    gradientFrom: '#0D1428', gradientVia: '#1A2040', gradientTo: '#2D8B5E',
    textureSrc: '/cards/tarot-20-aeon.webp',
  },
  'XXI': {
    backgroundColor: '#0A1A1E', blob1Color: '#1A6B5E', blob2Color: '#C5A030',
    accentColor: '#C5A030',
    gradientFrom: '#0A1A1E', gradientVia: '#102A28', gradientTo: '#1A6B5E',
    textureSrc: '/cards/tarot-21-universe.webp',
  },
};

export function getCardPalette(numeral: string): CardPalette | undefined {
  return CARD_PALETTES[numeral];
}
