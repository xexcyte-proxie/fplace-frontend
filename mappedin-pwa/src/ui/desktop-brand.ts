/** Decorative desktop product illustration; hidden from assistive technology. */
export function renderDesktopBrand(): string {
  return `<aside class="desktop-brand-panel" aria-hidden="true">
    <div class="desktop-brand-panel-top"><span class="desktop-brand-kicker">A little closer to everything.</span><span class="desktop-brand-compass">↗</span></div>
    <div class="desktop-map-art">
      <svg viewBox="0 0 560 400" fill="none" xmlns="http://www.w3.org/2000/svg">
        <g transform="translate(30 35) rotate(-12 250 170)">
          <rect x="15" y="15" width="470" height="310" rx="30" fill="#f4efe6"/>
          <path d="M15 165h470M170 15v310M330 15v310" stroke="#fff" stroke-width="25"/>
          <rect x="39" y="39" width="106" height="100" rx="15" fill="#d5dfd0"/>
          <rect x="196" y="39" width="108" height="100" rx="15" fill="#e6cdb2"/>
          <rect x="356" y="39" width="103" height="100" rx="15" fill="#d5dfd0"/>
          <rect x="39" y="192" width="106" height="107" rx="15" fill="#e6cdb2"/>
          <rect x="196" y="192" width="108" height="107" rx="15" fill="#d5dfd0"/>
          <rect x="356" y="192" width="103" height="107" rx="15" fill="#e6cdb2"/>
          <path d="M92 246h78v-81h237V90" stroke="#e07a33" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="1 13"/>
          <circle cx="92" cy="246" r="21" fill="#e07a33" fill-opacity=".18"/><circle cx="92" cy="246" r="10" fill="#e07a33" stroke="white" stroke-width="4"/>
          <path d="M407 57c-17 0-28 12-28 27 0 20 28 43 28 43s28-23 28-43c0-15-11-27-28-27Z" fill="#175e58"/><circle cx="407" cy="84" r="9" fill="#fff"/>
          <path d="M73 79h38M92 60v38M234 235h34m-17-17v34" stroke="#788871" stroke-width="3" stroke-linecap="round" opacity=".6"/>
        </g>
      </svg>
      <div class="desktop-map-caption"><span class="desktop-map-caption-dot"></span>Every place has a way in.</div>
    </div>
    <div class="desktop-brand-panel-bottom"><h2>Your world.<br>A little more connected.</h2><p>Find your way inside. Discover what’s happening.<br>Feel at home in a new place.</p></div>
  </aside>`;
}
