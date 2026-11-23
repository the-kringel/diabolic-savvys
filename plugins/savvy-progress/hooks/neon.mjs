// The Gemini Neon workers: four 90s techno ravers, one per effort level. Pure pixel art
// on the crab's 30x28 grid, shared by the mod and docs/gen-lineup.js.

const LIME = '#B6FF00'
const CYAN = '#00F0FF'
const PINK = '#FF2BD6'
const UV = '#8A2BFF'
const YELLOW = '#FFF200'
const ORANGE = '#FF7A00'
const WHITE = '#FFFFFF'
const DARK = '#14141C'

export const NEON_TIERS = ['neon-low', 'neon-medium', 'neon-high', 'neon-xhigh']

export const NEON_COLOR = {
  'neon-low': '#6FAF00',
  'neon-medium': '#0AA5C2',
  'neon-high': '#E020B0',
  'neon-xhigh': '#9B4DFF',
}

// gemini-4-neon-high → savvy-neon-high; other Gemini models keep the generic worker.
export const geminiWorkerType = model => {
  const m = /^gemini-[\d.]+-neon-(low|medium|high|xhigh)\b/i.exec(String(model))
  return m ? `savvy-neon-${m[1].toLowerCase()}` : 'savvy-gemini'
}

const legWarmers = (f, a, b) => {
  f(7, 24, 2, 2, a, 'la')
  f(17, 24, 2, 2, a, 'la')
  f(11, 24, 2, 2, b, 'lb')
  f(21, 24, 2, 2, b, 'lb')
}

export const NEON = {
  // Low, the Glowstick Kid: lime bucket hat, whistle on a lanyard, one glow stick.
  'neon-low': (f, _t, { crabBody, stamp }) => {
    crabBody(f, -4)
    stamp(f, 6, 3, ['.....LLLLLLL.....', '....LLPLLLPLL....', '...LLLLLLLLLLL...', '...LLPLLLPLLLL...', '...DDDDDDDDDDD...', '.LLLLLLLLLLLLLLL.', 'LLLLLLLLLLLLLLLLL'], { L: LIME, D: '#5F8F00', P: PINK })
    stamp(f, 11, 15, ['P......P', '.P....P.', '..P..P..', '...YY...', '...YYY..'], { P: PINK, Y: YELLOW })
    f(3, 16, 4, 1, CYAN)
    f(25, 1, 2, 10, LIME, 'it')
    f(25, 2, 1, 7, '#F4FFD0', 'it')
    legWarmers(f, PINK, LIME)
  },
  // Medium, the Acid Raver: cyan cap, acid smiley tee, a glow stick in each claw.
  'neon-medium': (f, _t, { crabBody, stamp }) => {
    crabBody(f, -4)
    stamp(f, 7, 4, ['.....CCCCCC.....', '...CCCCCCCCCC...', '..CCCPCCCCPCCC..', '..CCCCCCCCCCCC..', 'PPPPPPPPPPPPPPPP', 'PYPYPYPYPYPYPYPY'], { C: CYAN, P: PINK, Y: YELLOW })
    stamp(f, 12, 15, ['.YYYY.', 'YKYYKY', 'YYYYYY', 'KYYYYK', 'YKKKKY', '.YYYY.'], { Y: YELLOW, K: DARK })
    f(25, 1, 2, 10, CYAN, 'it')
    f(25, 2, 1, 7, '#D8FDFF', 'it')
    f(4, 5, 2, 9, PINK, 'i2')
    f(4, 6, 1, 6, '#FFD6F6', 'i2')
    legWarmers(f, CYAN, YELLOW)
  },
  // High, the Vinyl DJ: magenta headphones, shutter shades, a spinning record.
  'neon-high': (f, _t, { crabBody, stamp }) => {
    crabBody(f, -4)
    stamp(f, 5, 4, ['.....MMMMMMMMMM.....', '...MM..........MM...', '..M..............M..', '.M................M.', '.M................M.', '.M................M.', 'MMM..............MMM', 'MCM..............MCM', 'MCM..............MCM', 'MCM..............MCM', 'MMM..............MMM'], { M: PINK, C: CYAN })
    stamp(f, 8, 11, ['YYYYYY..YYYYYY', 'YKYKYYYYYYKYKY', 'YKYKYY..YYKYKY', 'YYYYYY..YYYYYY'], { Y: YELLOW, K: DARK })
    f(7, 19, 16, 1, PINK)
    f(7, 20, 16, 1, CYAN)
    stamp(f, 23, 3, ['..CCC..', '.CkkkC.', 'CkKPKkC', 'CkPWPkC', 'CkKPKkC', '.CkkkC.', '..CCC..'], { C: CYAN, k: DARK, K: '#3A3A4C', P: PINK, W: WHITE }, 'it')
    legWarmers(f, PINK, CYAN)
  },
  // XHigh, the Laser Boss: rainbow mohawk, UV goggles, a live equalizer, twin lasers.
  'neon-xhigh': (f, _t, { crabBody, stamp }) => {
    crabBody(f, -4)
    for (const [x, top, c] of [[9, 6, PINK], [11, 3, ORANGE], [13, 1, YELLOW], [15, 0, LIME], [17, 2, CYAN], [19, 5, UV]]) f(x, top, 2, 10 - top, c)
    stamp(f, 7, 10, ['GGGGGGGGGGGGGGGG', 'GVVVVGGGGGGVVVVG', 'GVKKVGGGGGGVKKVG', 'GVKKVGGGGGGVKKVG', 'GGGGGGGGGGGGGGGG'], { G: UV, V: CYAN, K: DARK })
    for (const [x, top, c] of [[9, 18, PINK], [11, 16, ORANGE], [13, 19, YELLOW], [15, 16, LIME], [17, 18, CYAN], [19, 17, UV]]) f(x, top, 2, 21 - top, c, 'eq')
    for (const [x, y] of [[27, 9], [27, 8], [28, 7], [28, 6], [29, 5], [29, 4]]) f(x, y, 1, 1, LIME, 'lz')
    for (const [x, y] of [[2, 13], [2, 12], [1, 11], [1, 10], [0, 9], [0, 8]]) f(x, y, 1, 1, PINK, 'lz')
    f(3, 16, 4, 1, LIME)
    f(23, 12, 4, 1, PINK)
    legWarmers(f, UV, LIME)
  },
}

// Periods divide one second, as in CRAB_CSS, and nothing flashes more than twice a second.
export const NEON_CSS = `<style>
.c-neon-low .it{filter:drop-shadow(0 0 1px #B6FF00)}.c-neon-medium .it{filter:drop-shadow(0 0 1px #00F0FF)}.c-neon-medium .i2{filter:drop-shadow(0 0 1px #FF2BD6)}.c-neon-high .it{filter:drop-shadow(0 0 1px #00F0FF)}.c-neon-xhigh .lz{filter:drop-shadow(0 0 1px #fff)}
.c-neon-low.run .it,.c-neon-medium.run .it{transform-origin:50% 100%;animation:nwave .5s ease-in-out infinite}
.c-neon-medium.run .i2{transform-origin:50% 100%;animation:nwave .5s ease-in-out infinite -.25s}
.c-neon-high.run .it{transform-origin:50% 50%;animation:nspin 1s linear infinite}
.c-neon-xhigh.run .lz{animation:blink .5s steps(1) infinite}
.c-neon-xhigh.run .eq{transform-origin:50% 100%;animation:neq .5s steps(1) infinite}
@keyframes nwave{0%,100%{transform:rotate(-16deg)}50%{transform:rotate(16deg)}}
@keyframes nspin{to{transform:rotate(360deg)}}
@keyframes neq{50%{transform:scaleY(.55)}}
</style>`
