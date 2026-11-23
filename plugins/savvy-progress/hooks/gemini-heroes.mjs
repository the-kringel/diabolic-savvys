// Every Gemini hero: the Neon ravers, the Hydrogen water crew and the Argon lab. Pure
// pixel art on the crab's 30x28 grid, shared by the mod and docs/gen-lineup.js.
import { NEON, NEON_COLOR, NEON_CSS, NEON_TIERS } from './neon.mjs'

export { NEON_CSS }

const FOAM = '#F2FCFF'
const ICE = '#BDEBFF'
const SKY = '#62CFF7'
const AZURE = '#1EA0E6'
const DEEP = '#0F6FC0'
const NAVY = '#0A447F'
const AQUA = '#5CF0E6'

const COAT = '#F5F7FB'
const SHADE = '#CBD2DE'
const LINE = '#8B95A8'
const FRAME = '#2C3648'
const LENS = '#A5ECFF'
const LILAC = '#C9A6FF'
const VIOLET = '#8E5BFF'
const GLOW = '#EBDDFF'
const EYE = '#1F1E1D'

const HYDROGEN_TIERS = ['hydrogen-low', 'hydrogen-medium', 'hydrogen-high', 'hydrogen-xhigh']
const ARGON_TIERS = ['argon-low', 'argon-medium', 'argon-high']

export const GEMINI_TIERS = [...NEON_TIERS, ...HYDROGEN_TIERS, ...ARGON_TIERS]

export const GEMINI_COLOR = {
  ...NEON_COLOR,
  'hydrogen-low': '#1E9BD7',
  'hydrogen-medium': '#2E8BE0',
  'hydrogen-high': '#4A7FE0',
  'hydrogen-xhigh': '#0E9DAE',
  'argon-low': '#7C86E0',
  'argon-medium': '#9B72E6',
  'argon-high': '#C25AE6',
}

// neon-high → ['Gemini Neon', 'high'], for planned tasks that have no run yet.
export const GEMINI_MODEL = Object.fromEntries(
  GEMINI_TIERS.map(tier => {
    const [family = '', effort = ''] = tier.split('-')
    return [tier, [`Gemini ${family.charAt(0).toUpperCase()}${family.slice(1)}`, effort]]
  }),
)

// gemini-4-hydrogen-high → savvy-hydrogen-high; a model with no hero keeps the generic worker.
export const geminiWorkerType = model => {
  const m = /^gemini-[\d.]+-(neon|hydrogen|argon)-(low|medium|high|xhigh)\b/i.exec(String(model))
  const tier = m ? `${m[1]}-${m[2]}`.toLowerCase() : ''
  return GEMINI_TIERS.includes(tier) ? `savvy-${tier}` : 'savvy-gemini'
}

const boots = (f, a, b) => {
  f(7, 24, 2, 2, a, 'la')
  f(17, 24, 2, 2, a, 'la')
  f(11, 24, 2, 2, b, 'lb')
  f(21, 24, 2, 2, b, 'lb')
}

const labCoat = (f, pen) => {
  f(7, 16, 7, 6, COAT)
  f(16, 16, 7, 6, COAT)
  f(7, 21, 7, 1, SHADE)
  f(16, 21, 7, 1, SHADE)
  f(13, 16, 1, 6, SHADE)
  f(16, 16, 1, 6, SHADE)
  f(9, 18, 3, 1, LINE)
  f(10, 17, 1, 1, pen)
}

const goggles = (f, stamp, lens) =>
  stamp(f, 7, 11, ['KKKKKKKKKKKKKKKK', 'KLEELKKKKKKLEELK', 'KLEELKKKKKKLEELK', 'KKKKKKKKKKKKKKKK'], { K: FRAME, L: lens, E: EYE })

const HEROES = {
  // Low, the Raindrop Scout: a droplet hood, a raincoat and a small umbrella in the rain.
  'hydrogen-low': (f, _t, { crabBody, stamp }) => {
    crabBody(f, -4)
    stamp(f, 7, 0, ['.......AC', '.......AC', '......AACC', '.....IAACCD', '....IIAACCCD', '...IIAAACCCCD', '..IIAAAACCCCDD', '.IIAAAAACCCCCDD', '.IAAAAAACCCCCCD', '.IAAAAAACCCCCCD', '..DAAAAACCCCDD'], { I: ICE, A: SKY, C: AZURE, D: DEEP })
    f(7, 18, 16, 4, AZURE)
    f(14, 18, 2, 4, DEEP)
    f(7, 21, 16, 1, DEEP)
    stamp(f, 22, 1, ['...AC', '.AAACCD', 'AAAACCCD', 'D.DD.DD'], { A: SKY, C: AZURE, D: DEEP }, 'it')
    f(25, 5, 1, 5, NAVY, 'it')
    f(1, 2, 1, 2, SKY, 'dr')
    f(3, 7, 1, 2, SKY, 'dr2')
    f(0, 10, 1, 2, ICE, 'dr')
    boots(f, DEEP, AZURE)
  },
  // Medium, the Wave Rider: a curling wave for a cap, a wetsuit and a surfboard.
  'hydrogen-medium': (f, _t, { crabBody, stamp }) => {
    crabBody(f, -4)
    stamp(f, 7, 2, ['..........IIII', '........IIAAAAI', '......IIAACCCAI', '....IIAACCDCCI', '...IAACCCDDDD', '..IAACCCDDDDDD', '.IAACCDDDDDDDDD', 'DDDDDDDDDDDDDDDD'], { I: ICE, A: SKY, C: AZURE, D: DEEP })
    f(7, 17, 16, 5, DEEP)
    f(7, 18, 16, 1, SKY)
    f(14, 19, 2, 3, NAVY)
    stamp(f, 24, 0, ['..I..', '.IWI.', '.IWI.', 'IIWII', 'IAWAI', 'IAWAI', 'IAWAI', 'IIWII', '.IWI.', '.IWI.'], { I: ICE, W: DEEP, A: AZURE }, 'it')
    boots(f, NAVY, SKY)
  },
  // High, the Deep Diver: a riveted diving helmet, a swaying lantern and rising bubbles.
  'hydrogen-high': (f, _t, { crabBody, stamp }) => {
    crabBody(f, -4)
    f(7, 15, 16, 7, DEEP)
    f(7, 19, 16, 1, NAVY)
    f(14, 19, 2, 1, ICE)
    stamp(f, 6, 2, ['......NNNNNN', '....NNDDDDDDNN', '...NDDAAAADDDDN', '..NDAWWAAAADDDDN', '..NDAWAAAAADDDDN', '.NDDAAAAAAAADDDDN', '.NDDAAAAAAAADDDDN', '.NDDDDDDDDDDDDDDN', '.RNRNRNRNRNRNRNRN', '.N..............N', '.N..............N', '.N..............N', '.RNRNRNRNRNRNRNRN'], { N: NAVY, D: AZURE, A: SKY, W: FOAM, R: ICE })
    stamp(f, 24, 4, ['.NN.', 'NYYN', 'NYLN', 'NYYN', '.NN.'], { N: NAVY, Y: '#FFD95C', L: '#FFF6C9' }, 'it')
    f(25, 9, 2, 1, NAVY, 'it')
    f(29, 4, 1, 1, SKY, 'bu')
    f(2, 10, 2, 2, ICE, 'bu')
    f(27, 1, 2, 2, ICE, 'bu2')
    f(1, 6, 1, 1, SKY, 'bu2')
    boots(f, NAVY, DEEP)
  },
  // XHigh, the Tide King: an aqua crown, a beard of sea foam, a trident and a rippling tide.
  'hydrogen-xhigh': (f, _t, { crabBody, stamp }) => {
    crabBody(f, -4)
    stamp(f, 8, 3, ['T..T..TT..T..T', 'T..T..TT..T..T', 'TT.TT.TT.TT.TT', 'TTTTTTTTTTTTTT', 'TFTTFTTFTTFTTF', 'DDDDDDDDDDDDDD'], { T: AQUA, F: FOAM, D: DEEP })
    f(7, 9, 16, 1, ICE)
    stamp(f, 9, 15, ['IIFIIFFIIFII', 'IFFIFFFFIFFI', '.IFFFIIFFFI.', '.IFIFFFFIFI.', '..IFFIIFFI..', '...IFFFFI...', '....IIII....'], { I: ICE, F: FOAM })
    stamp(f, 24, 0, ['T.T.T', 'T.T.T', 'TTTTT', '..T..'], { T: AQUA }, 'it')
    f(26, 4, 1, 6, ICE, 'it')
    f(3, 26, 24, 1, SKY, 'rp')
    f(7, 27, 16, 1, AZURE, 'rp')
    boots(f, DEEP, AQUA)
  },
  // Low, the Lab Assistant: safety goggles, a white coat and a clipboard.
  'argon-low': (f, _t, { crabBody, stamp }) => {
    crabBody(f, -4)
    f(11, 5, 8, 1, '#6B4A32')
    f(9, 6, 12, 1, '#6B4A32')
    f(8, 7, 14, 1, '#6B4A32')
    f(7, 8, 16, 3, '#6B4A32')
    f(10, 7, 4, 1, '#8C6647')
    goggles(f, stamp, LENS)
    labCoat(f, VIOLET)
    stamp(f, 24, 2, ['.NNN.', 'BBBBB', 'BWWWB', 'BLLLB', 'BWWWB', 'BLLWB', 'BWWWB', 'BBBBB'], { N: LINE, B: '#8A5A34', W: COAT, L: LINE }, 'it')
    boots(f, FRAME, FRAME)
  },
  // Medium, the Chemist: a hair bun, lilac goggles, a test tube and a bubbling flask.
  'argon-medium': (f, _t, { crabBody, stamp }) => {
    crabBody(f, -4)
    f(13, 3, 4, 2, '#9A4B2C')
    f(11, 5, 8, 1, '#9A4B2C')
    f(9, 6, 12, 1, '#9A4B2C')
    f(8, 7, 14, 1, '#9A4B2C')
    f(7, 8, 16, 3, '#9A4B2C')
    f(14, 3, 1, 1, '#BE6A45')
    goggles(f, stamp, LILAC)
    labCoat(f, AQUA)
    stamp(f, 23, 1, ['..SSS..', '..S.S..', '..S.S..', '.S...S.', '.SVVVS.', 'SVVGVVS', 'SVVVVVS', 'SVGVVVS', 'SSSSSSS'], { S: SHADE, V: VIOLET, G: GLOW }, 'it')
    f(26, 3, 1, 1, GLOW, 'bu')
    f(27, 0, 1, 1, LILAC, 'bu2')
    stamp(f, 3, 6, ['SSSS', 'S..S', 'S..S', 'SGGS', 'SVVS', 'SVVS', 'SVVS', '.SS.'], { S: SHADE, G: GLOW, V: VIOLET }, 'i2')
    boots(f, FRAME, FRAME)
  },
  // High, the Plasma Professor: wild white hair, round glasses and a glowing argon globe.
  'argon-high': (f, _t, { crabBody, stamp }) => {
    crabBody(f, -4)
    // Drawn as runs, not pixels: this much hair would otherwise be the panel's largest costume.
    for (const [x, y, w] of [[9, 1, 1], [13, 1, 2], [18, 1, 1], [6, 2, 1], [9, 2, 2], [12, 2, 4], [17, 2, 2], [21, 2, 1], [6, 3, 2], [9, 3, 11], [21, 3, 2], [7, 4, 15], [6, 5, 18], [7, 6, 16], [6, 7, 18], [7, 8, 17], [6, 9, 2], [9, 9, 11], [21, 9, 2]]) f(x, y, w, 1, '#E6E9F0')
    for (const [x, y] of [[10, 3], [17, 3], [9, 4], [14, 4], [19, 4], [11, 5], [18, 5], [8, 6], [15, 6], [21, 6], [10, 7], [17, 7], [12, 8], [17, 8], [9, 9], [19, 9]]) f(x, y, 1, 1, '#AEB6C6')
    stamp(f, 7, 11, ['.KKKK......KKKK', 'KLEELK....KLEELK', 'KLEELKKKKKKLEELK', '.KKKK......KKKK'], { K: FRAME, L: LENS, E: EYE })
    labCoat(f, LILAC)
    stamp(f, 12, 16, ['VV..VV', 'VVVVVV', 'VV..VV'], { V: VIOLET })
    stamp(f, 23, 0, ['..GGG', '.GVPVG', 'GVPWPVG', 'GPWWWPG', 'GVPWPVG', '.GVPVG', '..GGG'], { G: LILAC, V: VIOLET, P: '#C58CFF', W: '#FFFFFF' }, 'it')
    stamp(f, 25, 7, ['.N.', '.N.', 'NNN'], { N: LINE })
    f(4, 9, 1, 5, LINE)
    stamp(f, 1, 5, ['..Y', '.Y.', 'YY.', '.Y.'], { Y: LILAC }, 'sp')
    boots(f, FRAME, FRAME)
  },
}

export const GEMINI_HEROES = { ...NEON, ...HEROES }

// Periods divide one second, as in CRAB_CSS, and nothing flashes more than twice a second.
export const ELEMENT_CSS = `<style>
.c-hydrogen-xhigh .it{filter:drop-shadow(0 0 1px #5CF0E6)}.c-argon-high .it{filter:drop-shadow(0 0 1px #C9A6FF)}
.c-hydrogen-low.run .it,.c-hydrogen-medium.run .it,.c-argon-medium.run .it{transform-origin:50% 100%;animation:hsway 1s ease-in-out infinite}
.c-hydrogen-high.run .it{transform-origin:50% 0;animation:hsway 1s ease-in-out infinite}
.c-hydrogen-xhigh.run .it{animation:thrust .5s ease-in-out infinite}
.c-argon-low.run .it{transform-origin:50% 100%;animation:tap 1s steps(1) infinite}
.c-argon-medium.run .i2{transform-origin:50% 100%;animation:hsway 1s ease-in-out infinite -.5s}
.c-argon-high.run .it{animation:glow 1s ease-in-out infinite}
.run .dr{animation:hdrop 1s linear infinite}.run .dr2{animation:hdrop 1s linear infinite -.5s}
.run .bu{animation:hbub 1s ease-out infinite}.run .bu2{animation:hbub 1s ease-out infinite -.5s}
.run .rp{transform-origin:50% 50%;animation:hrip 1s ease-in-out infinite}
.run .sp{animation:blink .5s steps(1) infinite}
@keyframes hsway{0%,100%{transform:rotate(-7deg)}50%{transform:rotate(7deg)}}
@keyframes hdrop{0%{transform:translateY(-2px);opacity:0}30%{opacity:1}100%{transform:translateY(4px);opacity:0}}
@keyframes hbub{0%{transform:translateY(2px);opacity:.2}50%{opacity:1}100%{transform:translateY(-4px);opacity:0}}
@keyframes hrip{50%{transform:scaleX(.82)}}
</style>`

export const GEMINI_CSS = `${NEON_CSS}${ELEMENT_CSS}`
