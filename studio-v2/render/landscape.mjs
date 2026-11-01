// Layered 1920x1080 SVG world for the GSAP water-cycle composition.
// Keeps every id/class the timeline animates at the same coordinates,
// adds depth: gradients, hazy ridge, snow caps, mountain facets, halo,
// cloud shadows, foam crests, ocean depth band, birds, river-mouth rocks.
const P = { accent: '#0a766b' };
const rnd = (i, a = 1) => a * (0.5 + ((i * 2654435761) % 1000) / 1000);

const defs = `<defs>
 <linearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#bfe3f0"/><stop offset=".62" stop-color="#eaf6f8"/><stop offset="1" stop-color="#fdf6e0"/></linearGradient>
 <linearGradient id="mountFarGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c3dadd"/><stop offset=".55" stop-color="#a9c8cd"/><stop offset="1" stop-color="#8fb3b9"/></linearGradient>
 <linearGradient id="mountNearGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8fbcbe"/><stop offset=".5" stop-color="#79a8ab"/><stop offset="1" stop-color="#5f8f94"/></linearGradient>
 <linearGradient id="hillGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8fb89d"/><stop offset="1" stop-color="#6f9a80"/></linearGradient>
 <linearGradient id="oceanGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7fbcc5"/><stop offset=".3" stop-color="#5f9eaa"/><stop offset="1" stop-color="#4b8693"/></linearGradient>
 <radialGradient id="sunHalo"><stop offset="0" stop-color="#f6cf7a" stop-opacity=".55"/><stop offset=".6" stop-color="#f6cf7a" stop-opacity=".22"/><stop offset="1" stop-color="#f6cf7a" stop-opacity="0"/></radialGradient>
 <radialGradient id="horizonGlow"><stop offset="0" stop-color="#fbe7b8" stop-opacity=".5"/><stop offset="1" stop-color="#fbe7b8" stop-opacity="0"/></radialGradient>
</defs>`;

// ---- depth layers behind the original mountains ---------------------------
const horizonGlow = `<ellipse cx="1560" cy="780" rx="560" ry="240" fill="url(#horizonGlow)"/>`;
const ridge = `<path d="M-100 720 L140 500 L360 660 L620 440 L880 660 L1160 470 L1420 650 L1700 450 L2020 680 L2020 1100 L-100 1100 Z" fill="#d7e8ea" opacity=".55"/>`;

// ---- original silhouette geometry, richer fills ---------------------------
const mountainsFar = `<path d="M-100 800 L260 520 L480 690 L720 470 L1000 720 L1240 500 L1520 700 L1780 480 L2020 720 L2020 1100 L-100 1100 Z" fill="url(#mountFarGrad)"/>`;
const snow = [[260, 520], [720, 470], [1240, 500], [1780, 480]].map(([x, y]) => `<path d="M${x - 36} ${y + 50} L${x} ${y} L${x + 36} ${y + 50} L${x + 16} ${y + 36} L${x} ${y + 52} L${x - 16} ${y + 36} Z" fill="#f6fbfb" opacity=".9"/>`).join('');
const mountainsNear = `<path d="M-100 860 L180 640 L420 780 L640 600 L900 800 L1160 640 L1400 820 L1660 660 L2020 840 L2020 1100 L-100 1100 Z" fill="url(#mountNearGrad)"/>`;
const facetsLit = [[180, 640, -100, 860], [640, 600, 420, 780], [1160, 640, 900, 800], [1660, 660, 1400, 820]].map(([px, py, vx, vy]) => `<path d="M${px} ${py} L${vx} ${vy} L${vx} 1100 L${px} 1100 Z" fill="#93c0c1" opacity=".35"/>`).join('');
const facets = [[180, 640, 420, 780], [640, 600, 900, 800], [1160, 640, 1400, 820], [1660, 660, 2020, 840]].map(([px, py, vx, vy]) => `<path d="M${px} ${py} L${vx} ${vy} L${vx} 1100 L${px} 1100 Z" fill="#5f8b8e" opacity=".42"/>`).join('');
const hills = `<path d="M-100 920 Q300 820 700 890 T1400 880 T2020 900 L2020 1100 L-100 1100 Z" fill="url(#hillGrad)"/>`;

const foam = [0, 1, 2, 3].map(j => `<path d="M${190 + j * 60} ${942 + j * 38} q30 -12 62 -3" fill="none" stroke="#eafcff" stroke-width="4" stroke-linecap="round" opacity="${.7 - j * .1}"/><path d="M${980 + j * 40} ${942 + j * 38} q30 -12 62 -3" fill="none" stroke="#eafcff" stroke-width="3.5" stroke-linecap="round" opacity="${.6 - j * .1}"/>`).join('');
const ocean = `
 <rect x="-100" y="930" width="2200" height="260" fill="url(#oceanGrad)"/>
 <rect x="-100" y="930" width="2200" height="60" fill="#74b3bd" opacity=".7"/>
 <rect x="-100" y="1060" width="2200" height="130" fill="#427c88" opacity=".55"/>
 <g id="wavelet">${[0, 1, 2, 3].map(j => `<path d="M-80 ${950 + j * 38} Q120 ${930 + j * 38} 320 ${950 + j * 38} T720 ${950 + j * 38} T1120 ${950 + j * 38} T1520 ${950 + j * 38} T2020 ${950 + j * 38}" fill="none" stroke="#bfe3ea" stroke-width="${7 - j}" opacity="${.5 - j * .08}"/>`).join('')}${foam}</g>`;

const rocks = `<g fill="#5f7f7c"><ellipse cx="872" cy="930" rx="22" ry="13"/><ellipse cx="902" cy="934" rx="15" ry="9"/><ellipse cx="848" cy="934" rx="12" ry="8"/></g><g fill="#8faeaa" opacity=".55"><ellipse cx="866" cy="925" rx="10" ry="5"/><ellipse cx="899" cy="930" rx="7" ry="4"/></g>`;

const sun = `<g id="sun" transform="translate(1560 210)"><circle r="200" fill="url(#sunHalo)"/><circle r="86" fill="#f2b64a"/><circle r="112" fill="none" stroke="#f2b64a" stroke-width="10" opacity=".35"/><g id="rays">${Array.from({ length: 8 }, (_, i) => { const a = i * Math.PI / 4; return `<path d="M${Math.cos(a) * 130} ${Math.sin(a) * 130} l${Math.cos(a) * 42} ${Math.sin(a) * 42}" stroke="#f2b64a" stroke-width="14" stroke-linecap="round" opacity=".8"/>`; }).join('')}</g></g>`;
const birds = `<path d="M1240 306 q11 -11 22 0 q11 -11 22 0" fill="none" stroke="#46696b" stroke-width="4.5" stroke-linecap="round" opacity=".6"/><path d="M1420 246 q8 -8 16 0 q8 -8 16 0" fill="none" stroke="#46696b" stroke-width="3.5" stroke-linecap="round" opacity=".5"/>`;

// cloud shadow ellipse sits as a sibling of the white body so the
// '#cloud-main g' fill tween never recolors it
const cloudG = (id, x, y, s) => `<g id="${id}" transform="translate(${x} ${y}) scale(${s})"><ellipse cx="0" cy="76" rx="140" ry="20" fill="#7d9da0" opacity=".2"/><g fill="#ffffff"><ellipse cx="-80" cy="14" rx="70" ry="42"/><ellipse cx="10" cy="-16" rx="82" ry="56"/><ellipse cx="92" cy="18" rx="64" ry="40"/><rect x="-150" y="4" width="290" height="60" rx="30"/></g></g>`;

// ---- animated particles: identical coords to the flat build ----------------
const vapor = Array.from({ length: 16 }, (_, i) => {
  const x = 420 + (i % 8) * 130 + rnd(i, 30);
  return `<circle class="vp" id="vp-${i}" cx="${x}" cy="${920 - rnd(i + 3, 30)}" r="${7 + rnd(i + 7, 5)}" fill="#ffffff" opacity="0"/>`;
}).join('');
const rain = Array.from({ length: 22 }, (_, i) => {
  const x = 900 + (i % 11) * 60 + rnd(i, 20);
  return `<path class="rn" id="rn-${i}" d="M${x} ${520 + rnd(i + 5, 30)} l${-14} ${70 + rnd(i + 9, 30)}" stroke="#4a86a0" stroke-width="${5 + rnd(i + 2, 3)}" stroke-linecap="round" opacity="0"/>`;
}).join('');
const ripples = Array.from({ length: 6 }, (_, i) => `<ellipse class="rp" id="rp-${i}" cx="${980 + i * 120}" cy="940" rx="16" ry="6" fill="none" stroke="#d5f0f5" stroke-width="5" opacity="0"/>`).join('');
const river = `<path id="river" d="M340 860 Q560 880 640 900 T900 930" fill="none" stroke="#8fd0dc" stroke-width="26" stroke-linecap="round" stroke-dasharray="40 26" opacity="0"/>`;

const stageLabel = (id, txt, x, y) => `<g id="${id}" opacity="0"><rect x="${x - 165}" y="${y - 40}" width="330" height="76" rx="38" fill="#ffffff" opacity=".94"/><text x="${x}" y="${y + 10}" text-anchor="middle" fill="${P.accent}" font-size="38" font-weight="700">${txt}</text></g>`;
const arrows = `
 <path id="ar-up" d="M1040 930 Q1020 640 1080 450" fill="none" stroke="${P.accent}" stroke-width="10" stroke-linecap="round" stroke-dasharray="620" stroke-dashoffset="620" opacity="0"/>
 <path id="ar-up-head" d="M1062 486 L1080 448 L1106 480" fill="none" stroke="${P.accent}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round" opacity="0"/>
 <path id="ar-dn" d="M1290 450 Q1360 650 1330 900" fill="none" stroke="${P.accent}" stroke-width="10" stroke-linecap="round" stroke-dasharray="620" stroke-dashoffset="620" opacity="0"/>
 <path id="ar-dn-head" d="M1346 858 L1330 902 L1300 872" fill="none" stroke="${P.accent}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round" opacity="0"/>
 <path id="ar-rv" d="M640 905 Q480 910 390 915" fill="none" stroke="${P.accent}" stroke-width="10" stroke-linecap="round" stroke-dasharray="300" stroke-dashoffset="300" opacity="0"/>`;

export function landscapeWorld({ labels = [], arrows: showArrows = true } = {}) {
 const LAB_POS = [[850, 720], [1010, 90], [1440, 700], [300, 860]];
 const stageLayer = labels.map((l, i) => stageLabel(`lab-${i}`, String(l).toUpperCase(), ...(LAB_POS[i] || LAB_POS[0]))).join('');
  return `${defs}${horizonGlow}${ridge}${mountainsFar}${snow}${mountainsNear}${facetsLit}${facets}${hills}${ocean}${rocks}${sun}${birds}
 ${cloudG('cloud-a', 420, 250, 1)}${cloudG('cloud-b', 1050, 160, 0.72)}${cloudG('cloud-main', 1010, 330, 1.15)}
 ${river}${vapor}${rain}${ripples}
 ${showArrows ? arrows : ''}${stageLayer}`;
}
