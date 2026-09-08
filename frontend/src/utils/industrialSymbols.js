/**
 * Industrial Standard Vector Symbols Library.
 * Contains GHS Chemical Hazard Pictograms & ISO 7000 / ISO 780 Packaging Handling Symbols.
 * Clean, monochrome-ready scalable vector paths for thermal label printing (203.2 DPI).
 */

export const INDUSTRIAL_SYMBOLS = {
  // === GHS CHEMICAL HAZARD PICTOGRAMS (Diamond / Square rotated 45 deg) ===
  ghs_flammable: {
    id: 'ghs_flammable',
    name: 'GHS Flammable',
    category: 'GHS Hazard',
    icon: '🔥',
    viewBox: '0 0 100 100',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="20mm" height="20mm">
      <polygon points="50,4 96,50 50,96 4,50" fill="none" stroke="#000000" stroke-width="5" stroke-linejoin="round"/>
      <!-- Flame Symbol -->
      <path d="M50,22 C48,28 42,34 42,42 C42,45 44,48 47,49 C46,44 48,40 52,38 C51,43 54,47 55,51 C57,48 58,44 57,40 C63,45 66,52 64,60 C61,72 49,78 38,72 C41,70 43,67 43,63 C43,59 40,56 38,55 C37,59 35,63 36,68 C30,64 27,56 29,48 C30,44 33,40 36,37 C35,41 37,44 40,46 C39,38 43,30 50,22 Z" fill="#000000"/>
      <path d="M50,55 C46,55 43,58 43,63 C43,69 49,73 54,71 C52,69 51,66 52,63 C52,61 54,59 55,57 C53,56 51,55 50,55 Z" fill="#ffffff"/>
    </svg>`
  },

  ghs_toxic: {
    id: 'ghs_toxic',
    name: 'GHS Toxic',
    category: 'GHS Hazard',
    icon: '☠️',
    viewBox: '0 0 100 100',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="20mm" height="20mm">
      <polygon points="50,4 96,50 50,96 4,50" fill="none" stroke="#000000" stroke-width="5" stroke-linejoin="round"/>
      <!-- Skull & Crossbones -->
      <path d="M28,68 L72,32 M72,68 L28,32" stroke="#000000" stroke-width="6" stroke-linecap="round"/>
      <circle cx="26" cy="30" r="3.5" fill="#000000"/>
      <circle cx="74" cy="30" r="3.5" fill="#000000"/>
      <circle cx="26" cy="70" r="3.5" fill="#000000"/>
      <circle cx="74" cy="70" r="3.5" fill="#000000"/>
      <!-- Skull Base -->
      <path d="M50,25 C38,25 32,34 32,44 C32,51 36,56 41,58 L41,64 L59,64 L59,58 C64,56 68,51 68,44 C68,34 62,25 50,25 Z" fill="#000000"/>
      <!-- Eye Sockets & Nose (White Knockout) -->
      <ellipse cx="43" cy="42" rx="4" ry="5.5" fill="#ffffff"/>
      <ellipse cx="57" cy="42" rx="4" ry="5.5" fill="#ffffff"/>
      <polygon points="50,49 47,55 53,55" fill="#ffffff"/>
      <!-- Teeth -->
      <rect x="44" y="60" width="2.5" height="4" fill="#ffffff"/>
      <rect x="48.75" y="60" width="2.5" height="4" fill="#ffffff"/>
      <rect x="53.5" y="60" width="2.5" height="4" fill="#ffffff"/>
    </svg>`
  },

  ghs_corrosive: {
    id: 'ghs_corrosive',
    name: 'GHS Corrosive',
    category: 'GHS Hazard',
    icon: '🧪',
    viewBox: '0 0 100 100',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="20mm" height="20mm">
      <polygon points="50,4 96,50 50,96 4,50" fill="none" stroke="#000000" stroke-width="5" stroke-linejoin="round"/>
      <!-- Test Tubes Pouring Liquid -->
      <rect x="25" y="28" width="18" height="6" rx="2" transform="rotate(35 25 28)" fill="#000000"/>
      <rect x="57" y="38" width="18" height="6" rx="2" transform="rotate(-35 57 38)" fill="#000000"/>
      <!-- Drops & Surface Reaction -->
      <circle cx="39" cy="46" r="2" fill="#000000"/>
      <circle cx="61" cy="46" r="2" fill="#000000"/>
      <!-- Surface Bar -->
      <rect x="25" y="58" width="24" height="6" fill="#000000"/>
      <polygon points="33,58 37,54 41,58" fill="#ffffff"/>
      <!-- Hand Reacting -->
      <path d="M52,65 C55,62 58,62 62,64 L75,64 L75,70 L64,70 C60,70 56,68 52,65 Z" fill="#000000"/>
    </svg>`
  },

  ghs_exclamation: {
    id: 'ghs_exclamation',
    name: 'GHS Exclamation',
    category: 'GHS Hazard',
    icon: '⚠️',
    viewBox: '0 0 100 100',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="20mm" height="20mm">
      <polygon points="50,4 96,50 50,96 4,50" fill="none" stroke="#000000" stroke-width="5" stroke-linejoin="round"/>
      <!-- Exclamation Mark -->
      <path d="M46,26 L54,26 L53,56 L47,56 Z" fill="#000000"/>
      <circle cx="50" cy="68" r="5" fill="#000000"/>
    </svg>`
  },

  ghs_health_hazard: {
    id: 'ghs_health_hazard',
    name: 'GHS Health Hazard',
    category: 'GHS Hazard',
    icon: '👤',
    viewBox: '0 0 100 100',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="20mm" height="20mm">
      <polygon points="50,4 96,50 50,96 4,50" fill="none" stroke="#000000" stroke-width="5" stroke-linejoin="round"/>
      <!-- Head & Torso with Burst Star -->
      <circle cx="50" cy="30" r="7" fill="#000000"/>
      <path d="M35,62 C35,46 65,46 65,62 L65,72 L35,72 Z" fill="#000000"/>
      <!-- Explosion Star in Chest -->
      <polygon points="50,47 52,54 59,51 54,56 60,60 53,60 50,67 47,60 40,60 46,56 41,51 48,54" fill="#ffffff"/>
    </svg>`
  },

  ghs_oxidizing: {
    id: 'ghs_oxidizing',
    name: 'GHS Oxidizing',
    category: 'GHS Hazard',
    icon: '⭕',
    viewBox: '0 0 100 100',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="20mm" height="20mm">
      <polygon points="50,4 96,50 50,96 4,50" fill="none" stroke="#000000" stroke-width="5" stroke-linejoin="round"/>
      <!-- Flame over Circle -->
      <circle cx="50" cy="58" r="14" fill="none" stroke="#000000" stroke-width="5"/>
      <path d="M50,24 C45,30 42,37 45,43 C46,41 49,38 52,40 C50,45 54,49 55,53 C59,47 62,40 58,34 C55,29 50,24 50,24 Z" fill="#000000"/>
    </svg>`
  },

  // === ISO 7000 / ISO 780 PACKAGING HANDLING SYMBOLS ===
  fragile: {
    id: 'fragile',
    name: 'Fragile (Handle with Care)',
    category: 'ISO 7000 Packaging',
    icon: '🍷',
    viewBox: '0 0 100 100',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="20mm" height="20mm">
      <!-- Wine Glass with Crack -->
      <path d="M30,16 L70,16 L70,36 C70,52 56,58 53,60 L53,80 L66,80 L66,85 L34,85 L34,80 L47,80 L47,60 C44,58 30,52 30,36 Z" fill="#000000"/>
      <!-- Crack Lightning Cutout -->
      <polygon points="50,18 45,30 53,35 48,48 54,46 48,34 54,28" fill="#ffffff"/>
    </svg>`
  },

  this_side_up: {
    id: 'this_side_up',
    name: 'This Side Up',
    category: 'ISO 7000 Packaging',
    icon: '⬆️',
    viewBox: '0 0 100 100',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="20mm" height="20mm">
      <!-- Dual Upward Arrows -->
      <g fill="#000000">
        <!-- Left Arrow -->
        <polygon points="34,16 22,34 30,34 30,72 38,72 38,34 46,34"/>
        <!-- Right Arrow -->
        <polygon points="66,16 54,34 62,34 62,72 70,72 70,34 78,34"/>
        <!-- Bottom Base Bar -->
        <rect x="18" y="78" width="64" height="6" rx="1"/>
      </g>
    </svg>`
  },

  keep_dry: {
    id: 'keep_dry',
    name: 'Keep Dry',
    category: 'ISO 7000 Packaging',
    icon: '☔',
    viewBox: '0 0 100 100',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="20mm" height="20mm">
      <!-- Umbrella Dome -->
      <path d="M50,22 C26,22 22,46 22,48 L78,48 C78,46 74,22 50,22 Z" fill="#000000"/>
      <!-- Umbrella Handle & Shaft -->
      <rect x="48.5" y="48" width="3" height="30" fill="#000000"/>
      <path d="M50,78 C50,84 42,84 42,80" fill="none" stroke="#000000" stroke-width="3" stroke-linecap="round"/>
      <!-- Raindrops -->
      <path d="M30,12 L28,16 M40,8 L38,13 M60,8 L58,13 M70,12 L68,16" stroke="#000000" stroke-width="2.5" stroke-linecap="round"/>
    </svg>`
  },

  recyclable: {
    id: 'recyclable',
    name: 'Recyclable (Mobius Loop)',
    category: 'ISO 7000 Packaging',
    icon: '♻️',
    viewBox: '0 0 100 100',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="20mm" height="20mm">
      <!-- Three Chasing Arrows -->
      <g fill="#000000">
        <!-- Top Arrow -->
        <polygon points="50,12 62,28 54,28 54,34 46,34 46,28 38,28"/>
        <!-- Bottom Right Arrow -->
        <polygon points="76,68 76,48 70,52 65,47 59,53 64,58 58,62"/>
        <!-- Bottom Left Arrow -->
        <polygon points="24,68 42,68 36,62 42,56 36,50 30,56 24,50"/>
        <!-- Connecting Loops -->
        <path d="M46,34 C30,34 26,48 26,52 L32,52 C32,46 38,40 46,40 Z"/>
        <path d="M54,34 C68,34 74,44 74,50 L68,50 C68,44 62,40 54,40 Z"/>
        <path d="M36,68 L64,68 C64,74 58,78 50,78 C42,78 36,74 36,68 Z"/>
      </g>
    </svg>`
  },

  do_not_hook: {
    id: 'do_not_hook',
    name: 'Do Not Use Hooks',
    category: 'ISO 7000 Packaging',
    icon: '🪝',
    viewBox: '0 0 100 100',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="20mm" height="20mm">
      <!-- Hook Shape -->
      <path d="M48,20 L52,20 L52,48 C52,62 66,62 66,50 L60,50 C60,57 56,57 56,48 L56,20 Z" fill="#000000"/>
      <!-- Diagonal Prohibitive Red/Black Cross -->
      <line x1="20" y1="20" x2="80" y2="80" stroke="#000000" stroke-width="6" stroke-linecap="round"/>
      <line x1="80" y1="20" x2="20" y2="80" stroke="#000000" stroke-width="6" stroke-linecap="round"/>
    </svg>`
  }
};

export function getSymbolSvg(symbolId, widthMm = 20, heightMm = 20) {
  const sym = INDUSTRIAL_SYMBOLS[symbolId];
  if (!sym) return null;
  return sym.svg.replace('width="20mm"', `width="${widthMm}mm"`).replace('height="20mm"', `height="${heightMm}mm"`);
}
