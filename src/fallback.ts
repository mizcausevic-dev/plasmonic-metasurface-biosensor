import { shotNumber } from "./model";

const MARKUP = `
  <article class="fallback-card">
    <h2>Static schematic</h2>
    <p>WebGL is unavailable, so the 3D stage is replaced by this diagram. The timeline, spectrum, and captions still follow the same 34-second illustrative model.</p>
    <svg viewBox="0 0 760 460" role="img" aria-label="Side view of the illustrative biosensor optical path">
      <rect width="760" height="460" fill="#0A0C10"/>
      <g data-shot="2" data-shot-also="5">
        <rect x="330" y="28" width="100" height="36" fill="#1a1f27" stroke="#C5C6C7"/>
        <text x="380" y="50" text-anchor="middle" fill="#E6E8EB" font-size="12">Broadband source</text>
        <line x1="300" y1="78" x2="460" y2="78" stroke="#F4F1EA" stroke-width="2"/>
        <polygon points="460,78 448,72 448,84" fill="#F4F1EA"/>
        <polygon points="300,78 312,72 312,84" fill="#F4F1EA"/>
        <text x="380" y="96" text-anchor="middle" fill="#F4F1EA" font-size="11">Incident E polarization</text>
        <line x1="380" y1="64" x2="380" y2="150" stroke="#E7EEF6" stroke-dasharray="4 3"/>
      </g>
      <g data-shot="1">
        <rect x="120" y="150" width="520" height="18" fill="#f4ecdf" opacity="0.85"/>
        <text x="380" y="144" text-anchor="middle" fill="#E6E8EB" font-size="12">PDMS cover</text>
        <rect x="120" y="168" width="16" height="70" fill="#f7f1e8" opacity="0.8"/>
        <rect x="624" y="168" width="16" height="70" fill="#f7f1e8" opacity="0.8"/>
        <text x="150" y="188" fill="#E6E8EB" font-size="12">Inlet</text>
        <text x="560" y="188" fill="#E6E8EB" font-size="12">Outlet</text>
        <polygon points="250,210 270,202 270,218" fill="#F4F1EA"/>
        <polygon points="290,210 310,202 310,218" fill="#F4F1EA"/>
        <text x="330" y="214" fill="#F4F1EA" font-size="12">Flow</text>
      </g>
      <rect x="136" y="168" width="488" height="70" fill="#132238" opacity="0.85"/>
      <text x="380" y="198" text-anchor="middle" fill="#9fd4ff" font-size="11">Aqueous volume, tinted for visibility</text>
      <g data-shot="4">
        <circle cx="300" cy="214" r="5" fill="#d5dde8" stroke="#E6E8EB"/>
        <circle cx="430" cy="206" r="5" fill="#00E5FF" stroke="#E6E8EB"/>
        <path d="M418 228 l6 -10 l6 10" fill="none" stroke="#f3efe6" stroke-width="2"/>
        <text x="470" y="210" fill="#00E5FF" font-size="11">Surface capture</text>
      </g>
      <g data-shot="3">
        <path d="M340 246 h28 a22 22 0 1 0 0.1 0" fill="none" stroke="#FFD166" stroke-width="6" stroke-linecap="round"/>
        <line x1="368" y1="246" x2="392" y2="246" stroke="#D90429" stroke-width="3"/>
        <text x="404" y="250" fill="#D90429" font-size="12">20 nm gap</text>
        <text x="250" y="268" fill="#ffb4a8" font-size="11">+ / − charge, slowed optical cycle</text>
      </g>
      <g data-shot="2">
        <rect x="136" y="246" width="488" height="16" fill="#d5e4f2" opacity="0.9"/>
        <text x="380" y="278" text-anchor="middle" fill="#E6E8EB" font-size="12">Transparent substrate</text>
      </g>
      <g data-shot="5">
        <line x1="380" y1="262" x2="380" y2="330" stroke="#E7EEF6" stroke-dasharray="4 3"/>
        <rect x="352" y="330" width="56" height="16" fill="#d5e6f4" opacity="0.8"/>
        <text x="300" y="342" fill="#E6E8EB" font-size="11">Collection</text>
        <line x1="380" y1="346" x2="380" y2="390" stroke="#E7EEF6"/>
        <line x1="380" y1="390" x2="520" y2="390" stroke="#E7EEF6"/>
        <rect x="520" y="366" width="90" height="48" fill="#1a1f27" stroke="#C5C6C7"/>
        <text x="565" y="394" text-anchor="middle" fill="#E6E8EB" font-size="11">Spectrometer</text>
      </g>
    </svg>
    <ol class="fallback-steps">
      <li data-shot="1"><strong>Channel.</strong> A PDMS cover over an aqueous channel. Lifting the cover in the 3D view is a cutaway. Fluid stays confined in the functioning device.</li>
      <li data-shot="2"><strong>Array and light.</strong> Gold split rings on a transparent substrate. Polarized broadband light arrives from above, with E oriented across the gap for this illustrative design.</li>
      <li data-shot="3"><strong>Gap field.</strong> The 20 nm opening is the specified gap. Charge alternation is an optical cycle slowed for illustration. Crimson marks relative near-field intensity, not emitted light.</li>
      <li data-shot="4"><strong>Capture.</strong> Targets bind only at accessible receptors beside the gap. That changes the local optical environment and redshifts an existing transmission minimum in the schematic model.</li>
      <li data-shot="5"><strong>Readout.</strong> Transmitted light is collected below the substrate. The spectrum is an ensemble of the illuminated region. The binding map is illustrative, not a spectrometer image.</li>
    </ol>
  </article>
`;

export function mountFallback(root: HTMLElement): void {
  root.innerHTML = MARKUP;
  root.hidden = false;
}

export function updateFallback(t: number): void {
  const shot = String(shotNumber(t));
  document.querySelectorAll<HTMLElement>("#fallback [data-shot]").forEach((el) => {
    el.classList.toggle("is-current", el.dataset.shot === shot);
  });
}
