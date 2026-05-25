// workers/src/lib/saturation-terms.ts
/**
 * Brand-anchor terms tracked for corpus-wide saturation.
 *
 * Threshold semantics (occurrences per corpus of 125 posts):
 *   available     0–24    fine to introduce
 *   sparingly    25–74    use only if structurally load-bearing in this section
 *   saturated    75+      DO NOT introduce in new expansions
 *
 * Match rules:
 *   - case-insensitive
 *   - whole-word only (\\b boundaries)
 *   - normalize diacritics (śakti = sakti)
 *   - exact phrase for multi-word terms
 */

export interface SaturationTerm {
  key: string;          // canonical name used as map key
  patterns: string[];   // regex-ready strings (without \\b — added at use)
  category: 'brand-vocab' | 'sanskrit-anchor' | 'concept-frame';
}

export const SATURATION_TERMS: SaturationTerm[] = [
  // Brand-vocab — coined by the Tryambakam Noesis project
  { key: 'kha-ba-la',         patterns: ['kha-ba-la', 'kha ba la'],                          category: 'brand-vocab' },
  { key: 'kratu-purusha',     patterns: ['kratu-purusha', 'kratu purusha', 'kratu-purusa'],  category: 'brand-vocab' },
  { key: 'witness-alchemist', patterns: ['witness-alchemist', 'witness alchemist'],           category: 'brand-vocab' },
  { key: 'lorenz-kundli',     patterns: ['lorenz-kundli', 'lorenz kundli'],                   category: 'brand-vocab' },
  { key: 'noesis-engine',     patterns: ['noesis engine', 'noesis-engine'],                   category: 'brand-vocab' },
  { key: 'self-generating-code-well', patterns: ['self-generating code well', 'code well'],   category: 'brand-vocab' },

  // Sanskrit-anchor — recurring Sanskrit terms
  { key: 'antar-agni',        patterns: ['antar-agni', 'antar agni', 'antaragni'],            category: 'sanskrit-anchor' },
  { key: 'pancha-kosha',      patterns: ['pancha-kosha', 'pancha kosha', 'panchakosha'],      category: 'sanskrit-anchor' },
  { key: 'bali-padyami',      patterns: ['bali padyami', 'bali-padyami'],                     category: 'sanskrit-anchor' },
  { key: 'ukha',              patterns: ['ukha', 'ukhā', 'ukhasambharana'],                   category: 'sanskrit-anchor' },
  { key: 'samvatsara',        patterns: ['samvatsara'],                                       category: 'sanskrit-anchor' },
  { key: 'samskara',          patterns: ['samskara', 'sanskara'],                             category: 'sanskrit-anchor' },
  // NOTE: bare 'tapas' also matches the English food-context loanword (e.g., "tapas plate").
  // Acceptable for this corpus (no Spanish-food content); if the corpus expands to lifestyle/
  // food posts, drop bare 'tapas' and rely on 'tapasya' only.
  { key: 'tapas',             patterns: ['tapas', 'tapasya'],                                 category: 'sanskrit-anchor' },
  { key: 'sakshi',            patterns: ['sakshi', 'sākṣī', 'saksi'],                         category: 'sanskrit-anchor' },
  { key: 'rasayana',          patterns: ['rasayana', 'rasāyana'],                             category: 'sanskrit-anchor' },
  { key: 'prasuti',           patterns: ['prasuti', 'prasūti'],                               category: 'sanskrit-anchor' },
  { key: 'utkrama',           patterns: ['utkrama', 'utkrāma'],                               category: 'sanskrit-anchor' },
  { key: 'vajra',             patterns: ['vajra'],                                            category: 'sanskrit-anchor' },
  { key: 'valmika',           patterns: ['valmika', 'valmīka', 'anthill'],                    category: 'sanskrit-anchor' },
  { key: 'abhri',             patterns: ['abhri'],                                            category: 'sanskrit-anchor' },
  { key: 'vyamamatri',        patterns: ['vyamamatri', 'vyāmamātri'],                         category: 'sanskrit-anchor' },

  // Concept-frame — recurring framing devices
  { key: 'matched-cavity',    patterns: ['matched-cavity', 'matched cavity'],                 category: 'concept-frame' },
  { key: 'engineered-obsolescence', patterns: ['engineered obsolescence'],                    category: 'concept-frame' },
  { key: 'compile-error',     patterns: ['compile-error', 'compile error'],                   category: 'concept-frame' },
  { key: 'consciousness-compiler', patterns: ['consciousness compiler'],                      category: 'concept-frame' },
  { key: 'operator-the-only-remainder', patterns: ['only thing that remains', 'only remainder'], category: 'concept-frame' },
];

/**
 * Tier-boundary thresholds. Names describe the FLOOR of the tier they open.
 *   count <  sparinglyStart       → 'available'
 *   count >= sparinglyStart       → 'sparingly'   (the tier opens at sparinglyStart)
 *   count >= saturatedStart       → 'saturated'   (the tier opens at saturatedStart)
 *
 * Earlier draft named these `available` / `sparingly` which read as the
 * threshold for the SAME-named tier — exactly inverted. Renamed to make
 * the comparison direction unambiguous at use-sites.
 */
export const THRESHOLDS = {
  sparinglyStart: 25,   // >= 25 occurrences → 'sparingly' tier
  saturatedStart: 75,   // >= 75 occurrences → 'saturated' tier
};

export function classify(count: number): 'available' | 'sparingly' | 'saturated' {
  if (count >= THRESHOLDS.saturatedStart) return 'saturated';
  if (count >= THRESHOLDS.sparinglyStart) return 'sparingly';
  return 'available';
}
