/* UNIQO brand lockup - one inline SVG, reused everywhere ([data-logo]).
   Inline (not <img>) so the wordmark uses the page's Playfair Display / Inter
   and recolours via currentColor on light or dark backgrounds. */
(() => {
  const LOGO = `<svg class="logo-svg" viewBox="0 0 244 72" role="img" aria-label="Uniqo — Your Style. Your Rarity.">
    <defs>
      <linearGradient id="uqGold" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#8f6224"/><stop offset=".4" stop-color="#e9c983"/>
        <stop offset=".6" stop-color="#b8873b"/><stop offset="1" stop-color="#f4dfae"/>
      </linearGradient>
    </defs>
    <image href="/assets/mark.svg" x="0" y="4" width="64" height="64"/>
    <text class="lw" x="80" y="45" textLength="152" lengthAdjust="spacing">UNI<tspan class="lq">Q</tspan>O</text>
    <path class="lt" d="M181 50c14 6 34 7 55-6"/>
    <circle cx="236" cy="44" r="1.6" fill="url(#uqGold)"/>
    <text class="lg" x="81" y="64" textLength="150" lengthAdjust="spacing">YOUR STYLE · YOUR RARITY</text>
  </svg>`;
  const paint = () => document.querySelectorAll("[data-logo]:empty").forEach((el) => (el.innerHTML = LOGO));
  window.UQ_LOGO = LOGO;
  paint();
  document.addEventListener("DOMContentLoaded", paint);
})();
