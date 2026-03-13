/** Major Arcana — 22 archetypal positions on the spiral */
export interface MajorArcana {
  number: number;
  numeral: string;
  name: string;
  thothName: string; // Crowley's Thoth deck name (sometimes differs)
  element: string;
  keyword: string;
  heroPhase: string; // Hero's Journey phase mapping
  compass: 'STABILIZE' | 'HEAL' | 'CREATE' | 'MUTATE' | null;
  color: string; // Primary color association
  angle: number; // Position on the circle (0-360 degrees)
}

export const MAJOR_ARCANA: MajorArcana[] = [
  { number: 0, numeral: '0', name: 'The Fool', thothName: 'The Fool', element: 'Air', keyword: 'Leap', heroPhase: 'Ordinary World', compass: null, color: '#F0EDE3', angle: 0 },
  { number: 1, numeral: 'I', name: 'The Magus', thothName: 'The Magus', element: 'Air', keyword: 'Will', heroPhase: 'Call to Adventure', compass: 'MUTATE', color: '#C5A017', angle: 16.36 },
  { number: 2, numeral: 'II', name: 'The Priestess', thothName: 'The Priestess', element: 'Water', keyword: 'Intuition', heroPhase: 'Supernatural Aid', compass: 'HEAL', color: '#0B50FB', angle: 32.73 },
  { number: 3, numeral: 'III', name: 'The Empress', thothName: 'The Empress', element: 'Earth', keyword: 'Abundance', heroPhase: 'Threshold Guardian', compass: 'STABILIZE', color: '#10B5A7', angle: 49.09 },
  { number: 4, numeral: 'IV', name: 'The Emperor', thothName: 'The Emperor', element: 'Fire', keyword: 'Authority', heroPhase: 'Crossing Threshold', compass: 'CREATE', color: '#C65D3B', angle: 65.45 },
  { number: 5, numeral: 'V', name: 'The Hierophant', thothName: 'The Hierophant', element: 'Earth', keyword: 'Teaching', heroPhase: 'Meeting the Mentor', compass: 'STABILIZE', color: '#C5A017', angle: 81.82 },
  { number: 6, numeral: 'VI', name: 'The Lovers', thothName: 'The Lovers', element: 'Air', keyword: 'Union', heroPhase: 'Tests & Allies', compass: 'MUTATE', color: '#F0EDE3', angle: 98.18 },
  { number: 7, numeral: 'VII', name: 'The Chariot', thothName: 'The Chariot', element: 'Water', keyword: 'Victory', heroPhase: 'Crossing Threshold', compass: 'HEAL', color: '#0B50FB', angle: 114.55 },
  { number: 8, numeral: 'VIII', name: 'Adjustment', thothName: 'Adjustment', element: 'Air', keyword: 'Balance', heroPhase: 'Tests & Allies', compass: 'MUTATE', color: '#10B5A7', angle: 130.91 },
  { number: 9, numeral: 'IX', name: 'The Hermit', thothName: 'The Hermit', element: 'Earth', keyword: 'Solitude', heroPhase: 'Approach to Innermost Cave', compass: 'STABILIZE', color: '#8A9BA8', angle: 147.27 },
  { number: 10, numeral: 'X', name: 'Fortune', thothName: 'Fortune', element: 'Fire', keyword: 'Cycles', heroPhase: 'Approach to Innermost Cave', compass: 'CREATE', color: '#2D0050', angle: 163.64 },
  { number: 11, numeral: 'XI', name: 'Lust', thothName: 'Lust', element: 'Fire', keyword: 'Passion', heroPhase: 'Tests & Allies', compass: 'CREATE', color: '#C65D3B', angle: 180 },
  { number: 12, numeral: 'XII', name: 'The Hanged Man', thothName: 'The Hanged Man', element: 'Water', keyword: 'Surrender', heroPhase: 'Refusal of the Call', compass: 'HEAL', color: '#0B50FB', angle: 196.36 },
  { number: 13, numeral: 'XIII', name: 'Death', thothName: 'Death', element: 'Water', keyword: 'Transformation', heroPhase: 'The Ordeal', compass: 'HEAL', color: '#070B1D', angle: 212.73 },
  { number: 14, numeral: 'XIV', name: 'Art', thothName: 'Art', element: 'Fire', keyword: 'Integration', heroPhase: 'The Ordeal', compass: 'CREATE', color: '#2D0050', angle: 229.09 },
  { number: 15, numeral: 'XV', name: 'The Devil', thothName: 'The Devil', element: 'Earth', keyword: 'Bondage', heroPhase: 'The Ordeal', compass: 'STABILIZE', color: '#070B1D', angle: 245.45 },
  { number: 16, numeral: 'XVI', name: 'The Tower', thothName: 'The Tower', element: 'Fire', keyword: 'Rupture', heroPhase: 'Approach to Innermost Cave', compass: 'CREATE', color: '#C65D3B', angle: 261.82 },
  { number: 17, numeral: 'XVII', name: 'The Star', thothName: 'The Star', element: 'Air', keyword: 'Hope', heroPhase: 'Return with Elixir', compass: 'MUTATE', color: '#C5A017', angle: 278.18 },
  { number: 18, numeral: 'XVIII', name: 'The Moon', thothName: 'The Moon', element: 'Water', keyword: 'Illusion', heroPhase: 'Road Back', compass: 'HEAL', color: '#0B50FB', angle: 294.55 },
  { number: 19, numeral: 'XIX', name: 'The Sun', thothName: 'The Sun', element: 'Fire', keyword: 'Reward', heroPhase: 'The Reward', compass: 'CREATE', color: '#C5A017', angle: 310.91 },
  { number: 20, numeral: 'XX', name: 'The Aeon', thothName: 'The Aeon', element: 'Fire', keyword: 'Judgement', heroPhase: 'Resurrection', compass: 'CREATE', color: '#2D0050', angle: 327.27 },
  { number: 21, numeral: 'XXI', name: 'The Universe', thothName: 'The Universe', element: 'Earth', keyword: 'Completion', heroPhase: 'Return with Elixir', compass: 'STABILIZE', color: '#10B5A7', angle: 343.64 },
];

/** Four Suits — content domain filters */
export interface Suit {
  name: string;
  element: string;
  compass: string;
  domain: string;
  color: string;
}

export const SUITS: Suit[] = [
  { name: 'Wands', element: 'Fire', compass: 'CREATE', domain: 'Making, building, creating — the act of authorship', color: '#C65D3B' },
  { name: 'Cups', element: 'Water', compass: 'HEAL', domain: 'Inner work, integration, emotional archaeology', color: '#0B50FB' },
  { name: 'Swords', element: 'Air', compass: 'MUTATE', domain: 'Intellectual precision, cutting through, analysis', color: '#8A9BA8' },
  { name: 'Disks', element: 'Earth', compass: 'STABILIZE', domain: 'Grounding, material reality, place, body', color: '#10B5A7' },
];

/** Get card by numeral (e.g., "XVI") */
export function getCardByNumeral(numeral: string): MajorArcana | undefined {
  return MAJOR_ARCANA.find(card => card.numeral === numeral);
}

/** Get card by number (e.g., 16) */
export function getCardByNumber(num: number): MajorArcana | undefined {
  return MAJOR_ARCANA.find(card => card.number === num);
}

/** Get cards by compass direction */
export function getCardsByCompass(compass: string): MajorArcana[] {
  return MAJOR_ARCANA.filter(card => card.compass === compass);
}
