import foolTexture from '../assets/cards/tarot-00-fool.webp';
import hermitTexture from '../assets/cards/tarot-09-hermit.webp';
import artTexture from '../assets/cards/tarot-14-art.webp';
import towerTexture from '../assets/cards/tarot-16-tower.webp';
import starTexture from '../assets/cards/tarot-17-star.webp';
import moonTexture from '../assets/cards/tarot-18-moon.webp';
import aeonTexture from '../assets/cards/tarot-20-aeon.webp';
import universeTexture from '../assets/cards/tarot-21-universe.webp';

type CardImageAsset = typeof foolTexture;

const OPTIMIZED_CARD_IMAGE_MAP: Record<string, CardImageAsset> = {
  '/cards/tarot-00-fool.webp': foolTexture,
  '/cards/tarot-09-hermit.webp': hermitTexture,
  '/cards/tarot-14-art.webp': artTexture,
  '/cards/tarot-16-tower.webp': towerTexture,
  '/cards/tarot-17-star.webp': starTexture,
  '/cards/tarot-18-moon.webp': moonTexture,
  '/cards/tarot-20-aeon.webp': aeonTexture,
  '/cards/tarot-21-universe.webp': universeTexture,
};

export function getOptimizedCardImage(src?: string | null): CardImageAsset | undefined {
  if (!src) {
    return undefined;
  }

  return OPTIMIZED_CARD_IMAGE_MAP[src];
}
