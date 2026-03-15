/**
 * Card Experience Data — unique layout configuration and Easter eggs per card.
 * Sourced from the Mythic Journey travel logs and Fool's Journey entries.
 */

export interface EasterEgg {
  number?: string;
  label: string;
  meaning: string;
}

export interface CardExperience {
  layout: 'cosmic-void' | 'earthquake' | 'water-healing' | 'crescent' | 'hermit-minimal' | 'alchemical' | 'spiral-recursive' | 'four-quadrant';
  location: { name: string; detail: string };
  room?: { number: string; meaning: string };
  easterEggs: EasterEgg[];
  pullQuote: string;
  closingLine: string;
  breathPattern?: string;
  sensoryNote: string;
}

export const CARD_EXPERIENCES: Record<string, CardExperience> = {
  '0': {
    layout: 'cosmic-void',
    location: { name: 'Mumbai → Shenzhen', detail: 'Deep-Trench Forge' },
    easterEggs: [
      { number: '7-1-3', label: 'Breath Cadence', meaning: 'Heat steel, hold at glowing, draw the edge' },
      { label: 'Two Blades', meaning: 'Tongue (speech) and Sacral (commitment) — reforged in deep water' },
      { label: 'Field Toggle', meaning: 'Piloerection as haptic signal — skin-prickle means field is on' },
      { label: 'Gate-52', meaning: 'Stillness — the pause before the blade speaks' },
    ],
    pullQuote: 'The city didn\'t hand me tools; it unlocked the ones inside.',
    closingLine: 'I left deep water carrying two true blades.',
    breathPattern: '7-1-3',
    sensoryNote: 'Heat, humidity, gait as metronome, breath as bellows',
  },

  'IX': {
    layout: 'hermit-minimal',
    location: { name: 'Bangkok, Thailand', detail: 'Noble 33 — Floor 9' },
    room: { number: '95', meaning: '9 (completion) + 5 (change) = 14 (Temperance)' },
    easterEggs: [
      { number: '33', label: 'Noble 33', meaning: 'The Master Teacher — 33 vertebrae, 33 degrees, 33 years' },
      { number: '72', label: 'Hours of Stillness', meaning: '72 names of God — one full cycle of cellular communication' },
      { number: '4:4:4', label: 'Breath Protocol', meaning: 'Box breathing until Gate 52 pulses and time folds' },
      { label: 'WitnessOS', meaning: 'Something benevolent began recording — buffering, not streaming' },
      { label: 'Walls Curved', meaning: 'Stillness so intense the geometry of the room bent' },
    ],
    pullQuote: 'The curriculum was breath, the exam was presence, the diploma was non-attachment.',
    closingLine: '72 hours of stillness… somehow that was the most productive I\'ve ever been.',
    breathPattern: '4:4:4',
    sensoryNote: 'Air-conditioning whispering Gene Keys in morse code. Ceiling curves during stillness.',
  },

  'XIV': {
    layout: 'alchemical',
    location: { name: 'Chiang Mai, Thailand', detail: 'Blue Dream Guesthouse' },
    room: { number: '23', meaning: 'Gate 23.4 — Simplicity as sacred interface. 2+3=5 (Change)' },
    easterEggs: [
      { number: '23', label: 'Room 23', meaning: 'Gate 23 — Simplicity. The enigma code. Sacred interface.' },
      { label: 'Sacred Zip File', meaning: 'Compression of experience into essence — all signal, no fluff' },
      { label: 'Jade Buddha WiFi', meaning: 'Thoughts became monastic. Aura: minimalist jade Buddha with WiFi.' },
      { label: 'Three Rituals', meaning: 'Sacred hour before sunrise · Walk slow enough ground confesses · Journal until silence journals back' },
      { label: 'Ego Resignation', meaning: 'Ego put down its resume mid-journey — no longer applying' },
    ],
    pullQuote: 'I didn\'t need input. I needed compression.',
    closingLine: 'Chiang Mai compressed me like a sacred zip file: all essence, no fluff.',
    sensoryNote: 'Birds and bodhisattvas sharing playlist. Inner diagrams rearranging with each blink.',
  },

  'XVI': {
    layout: 'earthquake',
    location: { name: 'Bangkok, Thailand', detail: 'Rhythm Sukhumvit' },
    room: { number: '44', meaning: 'Angelic support + structural alignment. 13:31 birth time mirrors to 44.' },
    easterEggs: [
      { number: '44', label: 'Room 44', meaning: 'Karmic relationships mastery — angelic architecture in numerical form' },
      { number: '555', label: 'Building 555', meaning: 'Rapid transformation + upheaval as evolution. Change changing change.' },
      { number: '1:30 AM', label: 'Earthquake Time', meaning: 'March 20, 2025 — Bangkok\'s strongest in living memory' },
      { label: 'Thoth Consecration', meaning: 'Purchased Thoth deck on instinct. Pulled Tower card the week before. 24hrs later: earthquake.' },
      { label: 'Internal Dialogue', meaning: 'Brain: Hope the building\'s okay. Body: Sacral humming like subwoofer in cathedral. Higher Self: This is your onboarding.' },
    ],
    pullQuote: '"The Tower," I whispered. "I just pulled that last week…"',
    closingLine: 'The deck wasn\'t cursed. It was consecrated.',
    sensoryNote: 'Earth shaking, lights flickering. Full body sweat. Everything slowed down.',
  },

  'XVII': {
    layout: 'water-healing',
    location: { name: 'Koh Samui, Thailand', detail: 'Island shaped like a teardrop' },
    easterEggs: [
      { label: 'Songkran', meaning: 'Thailand\'s water festival — national-scale emotional cleansing as ritual baptism' },
      { label: 'พิชิต (Pichet)', meaning: 'One who conquers. Transmitted by grandmother with bowl of water — not chosen, received.' },
      { label: 'Karmic Blasters', meaning: 'Water guns rebranded as ancestral karmic blasters. Buckets as emotional reboots.' },
      { label: 'Star in Skin', meaning: 'The Star wasn\'t in the sky. It was in my skin.' },
      { label: 'Armor Drop', meaning: 'Salt in air. Sun as warm cosmic hand. Energetic pressure drop.' },
    ],
    pullQuote: 'I wasn\'t finding myself. I was being witnessed.',
    closingLine: 'Identity isn\'t built. It\'s excavated.',
    sensoryNote: 'Salt water, warm sun, laughter from locals. Healing wavelengths shifting from density.',
  },

  'XVIII': {
    layout: 'crescent',
    location: { name: 'Koh Phangan, Thailand', detail: 'Thong Nai Pan — geography as geometry' },
    easterEggs: [
      { label: 'Thong Nai Pan', meaning: 'Not a beach but a glyph — crescent-shaped bay as geometric ritual space' },
      { number: '59.5', label: 'Gate 59.5', meaning: 'Intimacy and transparency — already open, no penetration needed' },
      { label: 'Walking the Rim', meaning: 'Most magicians stand inside the circle. That night, I walked along its rim.' },
      { label: 'The Conjuration', meaning: 'Didn\'t cast a spell. Became the spell. The tide knew. The trees knew.' },
      { label: 'Carried Geometry', meaning: 'Refracted — like moonlight through water, like thought through stillness' },
    ],
    pullQuote: 'I didn\'t draw a circle to cast a spell. I became the spell by walking its edge.',
    closingLine: 'I carried geometry.',
    sensoryNote: 'Sea lapping at feet. No lights, no loops. Moonlight as soft interrogator.',
  },

  'XX': {
    layout: 'spiral-recursive',
    location: { name: 'Pai, Thailand', detail: 'Shaya Suandoi — Garden on the Hill' },
    room: { number: '10', meaning: 'Completion (1+0=1) — the end that becomes a beginning' },
    easterEggs: [
      { number: '10', label: 'Room 10', meaning: '1+0=1 — recursive beginning. The spiral center dressed in mountains and mist.' },
      { number: '43.4', label: 'Gate 43.4', meaning: 'Mental breakthrough — old modem syncing with future server' },
      { label: 'Ketu Release', meaning: 'Words falling like snake skin. Old labels dying quietly. Shedding what was never yours.' },
      { label: 'Aletheos Streaming', meaning: 'Voice no longer buffering — streaming. Subtle architecture within breath.' },
      { label: 'Furniture Status', meaning: 'Stillness so complete, insects reclassified me as furniture.' },
    ],
    pullQuote: 'You\'re no longer becoming. You\'re remembering.',
    closingLine: 'Judgement wasn\'t scary. It was stunningly gentle.',
    sensoryNote: 'Morning fog scripted like storyboarding. Golden strings as ley lines. Waterfalls teaching through flow.',
  },

  'XXI': {
    layout: 'four-quadrant',
    location: { name: 'Bangkok → Chiang Mai', detail: 'The Y Residence + Rhythm Sukhumvit' },
    room: { number: '707', meaning: 'Triple 7: seeker + staircase + still point. Middle 0 is quantum pause.' },
    easterEggs: [
      { number: '707', label: 'Room 707', meaning: 'The seeker who became the staircase. Crown Chakra vibration on 7th floor.' },
      { number: '55', label: '55 Days', meaning: '5+5=10=1 — the end that begins. Full spiral revolution.' },
      { label: 'The Y', meaning: 'Why (integration) · Fork (choice) · Yod (divine spark) · Yggdrasil (world tree)' },
      { label: 'Four Creatures', meaning: 'Eagle (Bangkok/Tower) · Lion (Samui/Star) · Bull (Phangan/Moon) · Human (ChiangMai+Pai)' },
      { label: 'Second Earthquake', meaning: 'May 11 — Earth bowed goodbye. Same building, different frequency. Spiral, not circle.' },
      { label: 'Doi Suthep', meaning: 'Silent elder. Doesn\'t demand attention — grants presence. Internal bowing.' },
    ],
    pullQuote: 'Some stories don\'t end. They become architecture.',
    closingLine: 'Revolution One: complete.',
    sensoryNote: 'City unfolding like offering board. Doi Suthep rising from mist like guardian.',
  },
};

export function getCardExperience(numeral: string): CardExperience | undefined {
  return CARD_EXPERIENCES[numeral];
}
