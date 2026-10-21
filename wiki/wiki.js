/**
 * Standalone Cube Dig wiki — content derived from live game data.
 */
import {
  BIOME,
  BUILDINGS,
  DIG_FILTERS,
  DIG_HEADINGS,
  DIG_LAYERS,
  DIG_STANCES,
  MONSTER,
  PRESTIGE_DEPTH_RATIO,
  PRESTIGE_MIN_COLUMNS,
  PUMP_RADIUS,
  REFINE_RECIPES,
  RESOURCE_META,
  SHARD_UPGRADES,
  SMELT_RECIPES,
  TILES,
  UPGRADES,
  WARD_DPS,
  WARD_RADIUS,
  WEATHER,
  WIKI_SECTIONS,
  formatRecipeLine,
  prestigeDepthShards,
} from '../js/data.js';
import { drawBuildingSprite, drawPineTreeSprite } from '../js/sprites.js';

/** Crafted / bag-only icon colors (no dig tile). */
const ITEM_COLORS = {
  wood: { color: '#5a3a22', edge: '#3a2414', hi: '#8a6240' },
  dirt: TILES.dirt,
  stone: TILES.stone,
  coal: TILES.coal,
  copper: TILES.copper,
  iron: TILES.iron,
  gold: TILES.gold,
  crystal: TILES.crystal,
  fragment: TILES.shell,
  copperBar: { color: '#c08050', edge: '#6a3a18', hi: '#e8b888' },
  ironBar: { color: '#9a8a7a', edge: '#4a3a2a', hi: '#d0c0b0' },
  goldBar: { color: '#e8d48a', edge: '#8a6830', hi: '#fff0c0' },
  steelBar: { color: '#7a8898', edge: '#3a4450', hi: '#b0c0d0' },
  crystalLens: { color: '#8ab0d0', edge: '#3a5c7e', hi: '#d0e8f8' },
  copperWire: { color: '#d09050', edge: '#6a3a18', hi: '#f0c080' },
};

const MECHANICS = [
  {
    id: 'digging',
    title: 'Digging',
    blurb: 'Expose faces, hire crew, push toward the cube.',
  },
  {
    id: 'prestige',
    title: 'Prestige',
    blurb: 'Reset the shaft; keep ◆ shards forever.',
  },
  {
    id: 'market',
    title: 'Village market',
    blurb: 'Sell bags for coins; Keep + Auto-sell.',
  },
  {
    id: 'crew',
    title: 'Crew & orders',
    blurb: 'Filters, headings, stance, rest.',
  },
  {
    id: 'combat',
    title: 'Horrors & wards',
    blurb: 'Passive defense and crew stances.',
  },
  {
    id: 'weather',
    title: 'Weather & floods',
    blurb: 'Rare storms and shaft pumps.',
  },
  {
    id: 'hazards',
    title: 'Biome hazards',
    blurb: 'Aquifers, lava, gas pockets.',
  },
  {
    id: 'smelting',
    title: 'Smelting & refining',
    blurb: 'Bars, wire, lenses, recipe locks.',
  },
  {
    id: 'layers',
    title: 'Named layers',
    blurb: 'Sod → Core chapter markers.',
  },
  {
    id: 'echo',
    title: 'Echo Sense',
    blurb: 'Listening Post draws a region that contains the cube.',
  },
];

const TILE_ORDER = [
  'grass',
  'dirt',
  'stone',
  'coal',
  'copper',
  'iron',
  'gold',
  'crystal',
  'tree',
  'aquifer',
  'lava',
  'gas',
  'shell',
  'seal',
  'core',
  'empty',
  'sky',
];

const navEl = document.getElementById('wiki-nav');
const mainEl = document.getElementById('wiki-main');
const searchForm = document.getElementById('wiki-search');
const searchInput = document.getElementById('wiki-q');

/** @type {Map<string, HTMLCanvasElement>} */
const iconCache = new Map();

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function link(href, label) {
  return `<a href="${esc(href)}">${esc(label)}</a>`;
}

function drawSwatch(canvas, def, kind = 'tile') {
  const ctx = canvas.getContext('2d');
  const n = 16;
  canvas.width = n;
  canvas.height = n;
  ctx.imageSmoothingEnabled = false;
  const base = def?.color || '#666';
  const edge = def?.edge || base;
  const hi = def?.hi || base;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, n, n);
  ctx.fillStyle = hi;
  ctx.fillRect(0, 0, n, 2);
  ctx.fillRect(0, 0, 2, n);
  ctx.fillStyle = edge;
  ctx.fillRect(0, n - 3, n, 3);
  ctx.fillRect(n - 3, 0, 3, n);
  if (kind === 'bar') {
    ctx.fillStyle = hi;
    ctx.fillRect(3, 5, 10, 6);
    ctx.fillStyle = edge;
    ctx.fillRect(3, 10, 10, 1);
  } else if (kind === 'wire') {
    ctx.strokeStyle = hi;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(2, 8);
    ctx.quadraticCurveTo(8, 2, 14, 8);
    ctx.quadraticCurveTo(8, 14, 2, 8);
    ctx.stroke();
  } else if (kind === 'lens') {
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.arc(8, 8, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = edge;
    ctx.stroke();
  } else if (kind === 'tree') {
    ctx.clearRect(0, 0, n, n);
    // Sky pad peek so the pine reads like surface trees in-game
    ctx.fillStyle = '#6a9ec8';
    ctx.fillRect(0, 0, n, n);
    drawPineTreeSprite(ctx, 0, 0, n);
  }
}

/** Fixed phase so animated buildings look “alive” but stay cacheable. */
const WIKI_SPRITE_T = 0.52;

function drawBuildingIcon(canvas, id) {
  const ctx = canvas.getContext('2d');
  const n = 16;
  canvas.width = n;
  canvas.height = n;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, n, n);
  drawBuildingSprite(ctx, 0, 0, n, {
    id,
    def: BUILDINGS[id],
    // Representative working / lit frames for machines
    mineIdle: false,
    smeltIdle: false,
    pumpWorking: true,
    t: WIKI_SPRITE_T,
    outline: true,
  });
}

function iconDataUrl(key, def, kind = 'tile') {
  const cacheKey = `${kind}:${key}`;
  if (iconCache.has(cacheKey)) return iconCache.get(cacheKey);
  const c = document.createElement('canvas');
  if (kind === 'building') {
    drawBuildingIcon(c, key);
  } else {
    drawSwatch(c, def, kind);
  }
  const url = c.toDataURL('image/png');
  iconCache.set(cacheKey, url);
  return url;
}

function tileIcon(id) {
  const def = TILES[id];
  if (!def) return '';
  const kind = id === 'tree' ? 'tree' : 'tile';
  return `<img class="icon" src="${iconDataUrl(id, def, kind)}" alt="" width="40" height="40" />`;
}

function itemIconKind(id) {
  if (id === 'copperWire') return 'wire';
  if (id === 'crystalLens') return 'lens';
  if (id.endsWith('Bar')) return 'bar';
  return 'tile';
}

function itemIcon(id) {
  const def = ITEM_COLORS[id] || { color: '#888', edge: '#444', hi: '#bbb' };
  return `<img class="icon" src="${iconDataUrl(id, def, itemIconKind(id))}" alt="" width="40" height="40" />`;
}

function buildingIcon(id) {
  if (!BUILDINGS[id]) return '';
  return `<img class="icon" src="${iconDataUrl(id, null, 'building')}" alt="" width="40" height="40" />`;
}

function itemLink(id) {
  const name = RESOURCE_META[id]?.name || id;
  return link(`#/item/${id}`, name);
}

function tileLink(id) {
  const name = TILES[id]?.name || id;
  return link(`#/tile/${id}`, name);
}

function buildingLink(id) {
  const name = BUILDINGS[id]?.name || id;
  return link(`#/building/${id}`, name);
}

function formatDrops(drops) {
  if (!drops || !Object.keys(drops).length) return '—';
  return Object.entries(drops)
    .map(([k, n]) => `${n}× ${itemLink(k)}`)
    .join(', ');
}

function formatCost(cost) {
  if (!cost || !Object.keys(cost).length) return '—';
  return Object.entries(cost)
    .map(([k, v]) => {
      if (k === 'coins') return `${v} coins`;
      return `${v}× ${itemLink(k)}`;
    })
    .join(', ');
}

function recipeUsesItem(recipe, id) {
  return !!(recipe.inputs?.[id] || recipe.output?.[id]);
}

function smeltRecipesFor(id) {
  return SMELT_RECIPES.filter((r) => recipeUsesItem(r, id));
}

function refineRecipesFor(id) {
  return REFINE_RECIPES.filter((r) => recipeUsesItem(r, id));
}

function upgradesNeeding(id) {
  return UPGRADES.filter((u) => {
    if (id === 'ironBar' && u.needsBars) return true;
    if (id === 'steelBar' && u.needsSteel) return true;
    if (id === 'crystalLens' && u.needsLens) return true;
    if (id === 'copperWire' && u.needsWire) return true;
    return false;
  });
}

function buildingsCosting(id) {
  return Object.values(BUILDINGS).filter((b) => (b.cost || {})[id]);
}

function tilesDropping(id) {
  return Object.entries(TILES)
    .filter(([, t]) => t.drops && t.drops[id])
    .map(([tid]) => tid);
}

function parseRoute() {
  const raw = (location.hash || '#/').replace(/^#\/?/, '');
  const parts = raw.split('/').filter(Boolean);
  if (!parts.length) return { page: 'home' };
  const [a, b] = parts;
  if (a === 'search') return { page: 'search', q: decodeURIComponent(b || '') };
  if (a === 'tiles') return { page: 'tiles' };
  if (a === 'tile' && b) return { page: 'tile', id: b };
  if (a === 'items') return { page: 'items' };
  if (a === 'item' && b) return { page: 'item', id: b };
  if (a === 'buildings') return { page: 'buildings' };
  if (a === 'building' && b) return { page: 'building', id: b };
  if (a === 'upgrades') return { page: 'upgrades' };
  if (a === 'upgrade' && b) return { page: 'upgrade', id: b };
  if (a === 'shards') return { page: 'shards' };
  if (a === 'shard' && b) return { page: 'shard', id: b };
  if (a === 'mechanics') return { page: 'mechanics' };
  if (a === 'mechanic' && b) return { page: 'mechanic', id: b };
  if (a === 'guide' && b) return { page: 'guide', id: b };
  return { page: 'home' };
}

function crumbs(...pairs) {
  const bits = [[`#/`, 'Home'], ...pairs];
  return `<nav class="wiki-crumbs">${bits
    .map(([href, label], i) =>
      i === bits.length - 1 ? `<span>${esc(label)}</span>` : link(href, label)
    )
    .join(' · ')}</nav>`;
}

function renderNav(active) {
  const mechLinks = MECHANICS.map(
    (m) =>
      `<li><a href="#/mechanic/${m.id}" class="${active === `mechanic:${m.id}` ? 'is-active' : ''}">${esc(m.title)}</a></li>`
  ).join('');
  const guideLinks = WIKI_SECTIONS.map(
    (s) =>
      `<li><a href="#/guide/${s.id}" class="${active === `guide:${s.id}` ? 'is-active' : ''}">${esc(s.title)}</a></li>`
  ).join('');

  navEl.innerHTML = `
    <h2>Browse</h2>
    <ul>
      <li><a href="#/" class="${active === 'home' ? 'is-active' : ''}">Main page</a></li>
      <li><a href="#/tiles" class="${active === 'tiles' ? 'is-active' : ''}">Tiles</a></li>
      <li><a href="#/items" class="${active === 'items' ? 'is-active' : ''}">Items</a></li>
      <li><a href="#/buildings" class="${active === 'buildings' ? 'is-active' : ''}">Buildings</a></li>
      <li><a href="#/upgrades" class="${active === 'upgrades' ? 'is-active' : ''}">Run upgrades</a></li>
      <li><a href="#/shards" class="${active === 'shards' ? 'is-active' : ''}">Shard upgrades</a></li>
      <li><a href="#/mechanics" class="${active === 'mechanics' ? 'is-active' : ''}">Mechanics</a></li>
    </ul>
    <h2>Mechanics</h2>
    <ul>${mechLinks}</ul>
    <h2>Field guide</h2>
    <ul>${guideLinks}</ul>
  `;
}

function cardGrid(cards) {
  const html = Array.isArray(cards) ? cards.join('') : cards || '';
  return `<div class="wiki-grid">${html}</div>`;
}

function tileCard(id) {
  const t = TILES[id];
  if (!t) return '';
  return `<a class="wiki-card" href="#/tile/${esc(id)}">${tileIcon(id)}<strong>${esc(t.name)}</strong><span>${t.diggable ? `Hardness ${t.hardness}` : 'Not diggable'}</span></a>`;
}

function itemCard(id) {
  const m = RESOURCE_META[id];
  if (!m) return '';
  const sell = m.sell > 0 ? `${m.sell}c base` : 'Not sold';
  return `<a class="wiki-card" href="#/item/${esc(id)}">${itemIcon(id)}<strong>${esc(m.name)}</strong><span>${sell}</span></a>`;
}

function buildingCard(id) {
  const b = BUILDINGS[id];
  if (!b) return '';
  return `<a class="wiki-card" href="#/building/${esc(id)}">${buildingIcon(id)}<strong>${esc(b.name)}</strong><span>${esc(b.role)}</span></a>`;
}

function pageHome() {
  const highlights = [
    tileCard('dirt'),
    tileCard('iron'),
    tileCard('seal'),
    itemCard('ironBar'),
    itemCard('copperWire'),
    buildingCard('smelter'),
    buildingCard('pump'),
    buildingCard('ward'),
  ].join('');

  return `
    ${crumbs(['#/', 'Main page'])}
    <h1>The Cube Dig Wiki</h1>
    <p class="wiki-lead">
      Dig, sell, hire, refine, and crack the buried cube. This field guide lists every tile, bag item,
      building, and loop — with icons from the same pixel sprites as the dig.
    </p>
    <section class="wiki-section" id="tutorial">
      <h2>Tutorial</h2>
      <p>A cube is buried under the village. Dig to it. Crack it. That welcome is the first popup, and it says the top left shows the next step. The chop tip says the same.</p>
      <p>On the first dig, each menu appears after the job that needs it:</p>
      <ol>
        <li>Click a ${tileLink('tree')} on the surface to chop it. The wood goes in your bag.</li>
        <li>${link('#/mechanic/market', 'Market')} (key 2) appears once wood is in the bag. Sell it.</li>
        <li>Dig down for ${itemLink('stone')}. The stone chip appears. Build is still closed.</li>
        <li>${link('#/buildings', 'Build')} (key 1) lists a ${buildingLink('grove')}. Place it on the surface.</li>
        <li>${link('#/mechanic/crew', 'Crew')} (key 3) appears. Hire a digger and set them to Trees.</li>
      </ol>
      <p>
        After that, the rest of the first dig opens one system at a time: a Shack and the Shop once a digger is chopping trees,
        a ${buildingLink('smelter')} when coal, copper, or iron shows,
        a shaft pump when a storm warns or an aquifer shows,
        a chapel if a digger is hurt, a ward when horrors appear, a drill and refinery after the first iron bar,
        a listening post once the shaft is underway, then Echo and Widen as depth nears the prestige line.
        The first prestige opens every menu and keeps them open. Dig filters and Toward core still wait until fog reveals those tiles.
      </p>
      <p>
        Dig by clicking an exposed face: a tile touching open shaft or sky.
        The cursor tip names the tile, its hit points, whether you can dig it, and what it drops.
        The cursor tip names the tile under the pointer: name, hit points, whether you can dig it, and drops.
        On a first dig the next step sits in the top left until that job is done. Hire and Trees are shown once. After that the corner stays quiet until a specific job, such as a smelter. Once depth reaches the prestige line, the top left asks you to widen the shaft to ${PRESTIGE_MIN_COLUMNS} columns, then says prestige is ready. The status line under the bags reports what just happened.
        More on ${link('#/mechanic/digging', 'digging')}.
      </p>
      <p>
        Menus, once each has appeared: 1 Build (place), 2 Market (sell), 3 Crew (hire and orders), 4 Shop (run upgrades), 5 Echo (prestige and ◆).
        A hidden menu’s number key does nothing. Pause freezes the dig. Guide, beside Pause, opens this wiki and hard reset.
      </p>
      <p>Grass and dirt clear with no bag drop. Wood and stone are the early materials.</p>
      <p>
        Later, smelt ore at a ${buildingLink('smelter')}. Iron-bound pick level 6 scratches a seal; Steel tools only speed the hits.
        ${link('#/mechanic/prestige', 'Prestige')} is in Echo at ${Math.round(PRESTIGE_DEPTH_RATIO * 100)}% depth with a ${PRESTIGE_MIN_COLUMNS}-wide shaft.
        Echo lists the ◆ that reset pays — deeper and wider shafts pay more. The next dig starts with 4 ${itemLink('wood')} and 2 ${itemLink('stone')}.
      </p>
    </section>
    <div class="wiki-toc">
      <strong>Contents</strong>
      <ol>
        <li>${link('#/tiles', 'Tiles')}</li>
        <li>${link('#/items', 'Items')}</li>
        <li>${link('#/buildings', 'Buildings')}</li>
        <li>${link('#/upgrades', 'Run upgrades')} · ${link('#/shards', 'Shards')}</li>
        <li>${link('#/mechanics', 'Mechanics')}</li>
      </ol>
    </div>
    <section class="wiki-section">
      <h2>Start here</h2>
      <p>
        Chop ${tileLink('tree')} → sell ${itemLink('wood')} → dig ${itemLink('stone')} →
        place a ${buildingLink('grove')} → set crew to trees → dig a shaft →
        build a ${buildingLink('smelter')} → prestige for ◆.
        The full dock stays open after the first prestige.
        Named layers on the HUD: ${DIG_LAYERS.map((l) => esc(l.name)).join(' → ')}.
      </p>
      <ul>
        ${WIKI_SECTIONS.slice(0, 4)
          .map((s) => `<li>${link(`#/guide/${s.id}`, s.title)} — ${esc(s.paragraphs[0])}</li>`)
          .join('')}
      </ul>
    </section>
    <section class="wiki-section">
      <h2>Featured entries</h2>
      ${cardGrid(highlights)}
    </section>
  `;
}

function pageTiles() {
  return `
    ${crumbs(['#/tiles', 'Tiles'])}
    <h1>Tiles</h1>
    <p class="wiki-lead">World blocks you dig, plant, or leave as shaft / sky.</p>
    ${cardGrid(TILE_ORDER.filter((id) => TILES[id]).map(tileCard).join(''))}
  `;
}

function pageTile(id) {
  const t = TILES[id];
  if (!t) return notFound('Tile', id);
  const hazardNote =
    id === 'aquifer'
      ? `Breaching dumps ~${BIOME.AQUIFER_FLOOD} flood volume into the shaft.`
      : id === 'lava'
        ? `Standing beside revealed lava drains ~${BIOME.LAVA_BURN_PER_SEC}/s vitality; breach hit ${BIOME.LAVA_BREACH_DAMAGE}.`
        : id === 'gas'
          ? `Explodes in r${BIOME.GAS_RADIUS}: ${BIOME.GAS_DAMAGE} vitality + cracks neighbors.`
          : null;

  return `
    ${crumbs(['#/tiles', 'Tiles'], [`#/tile/${id}`, t.name])}
    <aside class="wiki-infobox">
      ${tileIcon(id)}
      <h2>${esc(t.name)}</h2>
      <dl>
        <dt>Id</dt><dd><code>${esc(id)}</code></dd>
        <dt>Diggable</dt><dd>${t.diggable ? 'Yes' : 'No'}</dd>
        <dt>Hardness</dt><dd>${t.hardness ?? 0}</dd>
        <dt>Drops</dt><dd>${formatDrops(t.drops)}</dd>
        <dt>Shards</dt><dd>${t.shards ? `+${t.shards}◆` : '—'}</dd>
        ${t.hazard ? `<dt>Hazard</dt><dd>${esc(t.hazard)}</dd>` : ''}
      </dl>
    </aside>
    <h1>${esc(t.name)}</h1>
    <p class="wiki-lead">${t.diggable ? 'A diggable block in the shaft.' : 'Non-diggable world tile.'}</p>
    <section class="wiki-section">
      <h2>Notes</h2>
      <ul>
        <li>Hardness is the base hit points at dig power 1. Stone, coal, iron, gold, and crystal past depth 10 gain a little more, and the cursor shows remaining over that full bar. Pick tier and shards raise scratch gates.</li>
        ${hazardNote ? `<li>${esc(hazardNote)}</li>` : ''}
        ${id === 'core' ? '<li>Core usually needs prestige ×5 and pick/seal investment.</li>' : ''}
        ${id === 'seal' ? '<li>Seals drop ◆. Prestige ×1 unlocks the attempt and trims hit points on a new dig. Scratching one needs Iron-bound pick level 6 with no shards — Seal splitter or Inheritance can lower that. Steel tools and Heavier pick only speed the hits.</li>' : ''}
        ${id === 'tree' ? `<li>Chop for wood; ${buildingLink('grove')} replants on the sky pad.</li>` : ''}
        ${id === 'dirt' || id === 'grass' ? '<li>Clears the tile. No bag drop.</li>' : ''}
      </ul>
    </section>
    <section class="wiki-section">
      <h2>See also</h2>
      <ul>
        <li>${link('#/items', 'Items')}</li>
        <li>${link('#/mechanic/hazards', 'Biome hazards')}</li>
        <li>${link('#/mechanic/digging', 'Digging')}</li>
      </ul>
    </section>
  `;
}

function pageItems() {
  return `
    ${crumbs(['#/items', 'Items'])}
    <h1>Items</h1>
    <p class="wiki-lead">Bag resources — dig drops and craft outputs. Coins only come from selling. ${itemLink('fragment')} is not the same as ${link('#/shards', '◆ shards')}.</p>
    ${cardGrid(Object.keys(RESOURCE_META).map(itemCard).join(''))}
  `;
}

function pageItem(id) {
  const m = RESOURCE_META[id];
  if (!m) return notFound('Item', id);
  const sources = tilesDropping(id);
  const smelt = smeltRecipesFor(id);
  const refine = refineRecipesFor(id);
  const ups = upgradesNeeding(id);
  const blds = buildingsCosting(id);

  return `
    ${crumbs(['#/items', 'Items'], [`#/item/${id}`, m.name])}
    <aside class="wiki-infobox">
      ${itemIcon(id)}
      <h2>${esc(m.name)}</h2>
      <dl>
        <dt>Id</dt><dd><code>${esc(id)}</code></dd>
        <dt>Sell</dt><dd>${m.sell > 0 ? `${m.sell}c base` : 'Cannot sell'}</dd>
      </dl>
    </aside>
    <h1>${esc(m.name)}</h1>
    <p class="wiki-lead">${
      id === 'fragment'
        ? 'Bag item from the cube shell (and seals). Sell for coins or spend on buildings — not the same as ◆ shards.'
        : 'Bag stock used for buildings, upgrades, and market sales.'
    }</p>
    ${
      id === 'fragment'
        ? `<section class="wiki-section"><h2>Not shards</h2>
          <p><strong>Fragments</strong> live in bags and reset on prestige. <strong>◆ Shards</strong> are a separate prestige currency (HUD) from seals, the core, and depth grants — spent on ${link('#/shards', 'permanent upgrades')}.</p>
          <p>Shell drops fragments only. Seals drop both. Core drops ◆ only.</p>
        </section>`
        : ''
    }
    <section class="wiki-section">
      <h2>Sources</h2>
      ${
        sources.length
          ? `<ul>${sources.map((tid) => `<li>${tileLink(tid)}</li>`).join('')}</ul>`
          : '<p class="wiki-muted">Crafted or special — not a direct tile drop.</p>'
      }
    </section>
    ${
      smelt.length || refine.length
        ? `<section class="wiki-section"><h2>Recipes</h2><ul>${[
            ...smelt.map((r) => `<li>Smelter: ${esc(formatRecipeLine(r))} (${link('#/building/smelter', 'Smelter')})</li>`),
            ...refine.map((r) => `<li>Refinery: ${esc(formatRecipeLine(r))} (${link('#/building/refinery', 'Refinery')})</li>`),
          ].join('')}</ul></section>`
        : ''
    }
    ${
      ups.length
        ? `<section class="wiki-section"><h2>Upgrades that consume this</h2><ul>${ups
            .map((u) => `<li>${link(`#/upgrade/${u.id}`, u.name)}</li>`)
            .join('')}</ul></section>`
        : ''
    }
    ${
      blds.length
        ? `<section class="wiki-section"><h2>Buildings that cost this</h2><ul>${blds
            .map((b) => `<li>${buildingLink(b.id)} — ${formatCost(b.cost)}</li>`)
            .join('')}</ul></section>`
        : ''
    }
    <section class="wiki-section">
      <h2>See also</h2>
      <ul>
        <li>${link('#/mechanic/market', 'Village market')}</li>
        <li>${link('#/mechanic/smelting', 'Smelting & refining')}</li>
      </ul>
    </section>
  `;
}

function pageBuildings() {
  return `
    ${crumbs(['#/buildings', 'Buildings'])}
    <h1>Buildings</h1>
    <p class="wiki-lead">Place from Build (or starter village props). Demolish refunds 50%.</p>
    ${cardGrid(Object.keys(BUILDINGS).map(buildingCard).join(''))}
  `;
}

function pageBuilding(id) {
  const b = BUILDINGS[id];
  if (!b) return notFound('Building', id);
  const recipes =
    id === 'smelter'
      ? SMELT_RECIPES
      : id === 'refinery'
        ? REFINE_RECIPES
        : null;

  return `
    ${crumbs(['#/buildings', 'Buildings'], [`#/building/${id}`, b.name])}
    <aside class="wiki-infobox">
      ${buildingIcon(id)}
      <h2>${esc(b.name)}</h2>
      <dl>
        <dt>Role</dt><dd>${esc(b.role)}</dd>
        <dt>Cost</dt><dd>${formatCost(b.cost)}</dd>
        ${b.max != null ? `<dt>Max</dt><dd>${b.max}</dd>` : ''}
        ${b.starter ? '<dt>Starter</dt><dd>Yes</dd>' : ''}
      </dl>
    </aside>
    <h1>${esc(b.name)}</h1>
    <p class="wiki-lead">${esc(b.blurb)}</p>
    ${
      recipes
        ? `<section class="wiki-section"><h2>Recipes</h2>
          <p>Click a placed ${esc(b.name.toLowerCase())} to lock Auto, a single recipe, or Off (saves coal).</p>
          <table class="wiki-table"><thead><tr><th>Recipe</th><th>Line</th></tr></thead>
          <tbody>${recipes
            .map(
              (r) =>
                `<tr><td>${esc(r.label)}</td><td>${esc(formatRecipeLine(r))}</td></tr>`
            )
            .join('')}</tbody></table></section>`
        : ''
    }
    ${
      id === 'pump'
        ? `<section class="wiki-section"><h2>Range</h2><p>Base dry radius ${PUMP_RADIUS}. ${link('#/upgrade/pump_coil', 'Pump coils')} add +1 per level.</p></section>`
        : ''
    }
    ${
      id === 'ward'
        ? `<section class="wiki-section"><h2>Combat</h2><p>Base radius ${WARD_RADIUS}, DPS ${WARD_DPS}. ${link('#/upgrade/bright_wards', 'Bright wards')} boost both. See ${link('#/mechanic/combat', 'Horrors & wards')}.</p></section>`
        : ''
    }
    <section class="wiki-section">
      <h2>See also</h2>
      <ul>
        <li>${link('#/items', 'Items')}</li>
        <li>${link('#/mechanic/digging', 'Digging')}</li>
      </ul>
    </section>
  `;
}

function pageUpgrades() {
  const rows = UPGRADES.map(
    (u) => `<tr>
      <td>${link(`#/upgrade/${u.id}`, u.name)}</td>
      <td>${esc(u.blurb)}</td>
      <td>${u.baseCost}c · max ${u.max}</td>
    </tr>`
  ).join('');
  return `
    ${crumbs(['#/upgrades', 'Run upgrades'])}
    <h1>Run upgrades</h1>
    <p class="wiki-lead">Bought with coins (and sometimes bars / wire / lenses). Reset on prestige.</p>
    <table class="wiki-table">
      <thead><tr><th>Upgrade</th><th>Effect</th><th>Cost</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function pageUpgrade(id) {
  const u = UPGRADES.find((x) => x.id === id);
  if (!u) return notFound('Upgrade', id);
  const needs = [];
  if (u.needsBars) needs.push(itemLink('ironBar'));
  if (u.needsSteel) needs.push(itemLink('steelBar'));
  if (u.needsLens) needs.push(itemLink('crystalLens'));
  if (u.needsWire) needs.push(itemLink('copperWire'));
  return `
    ${crumbs(['#/upgrades', 'Run upgrades'], [`#/upgrade/${id}`, u.name])}
    <h1>${esc(u.name)}</h1>
    <p class="wiki-lead">${esc(u.blurb)}</p>
    <section class="wiki-section">
      <h2>Details</h2>
      <ul>
        <li>Base cost ${u.baseCost} coins (scales per level).</li>
        <li>Max level ${u.max}.</li>
        ${needs.length ? `<li>Also consumes: ${needs.join(', ')} (1 + level each buy).</li>` : ''}
        <li>Resets when you prestige — shard upgrades do not.</li>
      </ul>
    </section>
  `;
}

function pageShards() {
  const rows = SHARD_UPGRADES.map(
    (u) => `<tr>
      <td>${link(`#/shard/${u.id}`, u.name)}</td>
      <td>${esc(u.blurb)}</td>
      <td>${u.cost}◆ · max ${u.max}</td>
    </tr>`
  ).join('');
  return `
    ${crumbs(['#/shards', 'Shard upgrades'])}
    <h1>Shard upgrades</h1>
    <p class="wiki-lead">Permanent ◆ purchases. Survive prestige; wiped only by hard reset. ◆ is not ${itemLink('fragment')} — fragments are a sellable bag item.</p>
    <table class="wiki-table">
      <thead><tr><th>Upgrade</th><th>Effect</th><th>Cost</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function pageShard(id) {
  const u = SHARD_UPGRADES.find((x) => x.id === id);
  if (!u) return notFound('Shard upgrade', id);
  return `
    ${crumbs(['#/shards', 'Shard upgrades'], [`#/shard/${id}`, u.name])}
    <h1>${esc(u.name)}</h1>
    <p class="wiki-lead">${esc(u.blurb)}</p>
    <section class="wiki-section">
      <h2>Details</h2>
      <ul>
        <li>Base cost ${u.cost}◆ (scales).</li>
        <li>Max level ${u.max}.</li>
        <li>Earn ◆ from seals, core, and prestige depth grants — see ${link('#/mechanic/prestige', 'Prestige')}.</li>
      </ul>
    </section>
  `;
}

function pageMechanics() {
  return `
    ${crumbs(['#/mechanics', 'Mechanics'])}
    <h1>Mechanics</h1>
    <p class="wiki-lead">How the dig loops fit together.</p>
    ${cardGrid(
      MECHANICS.map(
        (m) =>
          `<a class="wiki-card" href="#/mechanic/${esc(m.id)}"><strong>${esc(m.title)}</strong><span>${esc(m.blurb)}</span></a>`
      ).join('')
    )}
  `;
}

function mechanicBody(id) {
  switch (id) {
    case 'digging':
      return `
        <p>On a first dig the dock stays closed until you chop, sell wood, dig stone, and place a grove. Crew orders start at Idle and Trees. The first prestige leaves every menu open. Fog still hides dig targets until those tiles are revealed.</p>
        <p>Click exposed diggable faces or hire crew. Dig power rises from Heavier pick, Steel tools, and Echo muscle. Blast charges sometimes crack an adjacent tile when a block breaks (you, crew, or a drill). Gold, crystal, and shell need Iron-bound pick before they can be scratched. A seal needs Iron-bound pick level 6 (Seal splitter or Inheritance can lower that). Steel tools only speed the hits. Prestige trims seal and core hit points on a new dig; it does not raise the scratch gate. The core also needs prestige ×5.</p>
        <ul>
          <li>The cursor tip names the tile under the pointer (name, hit points, whether you can dig it, drops). On a first dig the next step sits in the top left until that job is done, then the corner stays quiet until a specific job. Once depth reaches the prestige line, the top left asks you to widen the shaft to ${PRESTIGE_MIN_COLUMNS} columns. The status line reports what just happened.</li>
          <li>Drag diggers on the map. After resting at a shack, they return to their last dig stand; tree cutters walk to the nearest tree.</li>
          <li>${buildingLink('mine')} drills prefer deeper tiles, then creep down the shaft (fog OK; skip cube layers).</li>
          <li>Filters & headings live in Crew → Orders.</li>
        </ul>`;
    case 'prestige':
      return `
        <p>Unlock at ${Math.round(PRESTIGE_DEPTH_RATIO * 100)}% depth with a ${PRESTIGE_MIN_COLUMNS}-wide open shaft.</p>
        <ul>
          <li>Resets coins, crew, buildings, and the map. Keeps ◆ and shard upgrades.</li>
          <li>The next dig starts with 4 wood and 2 stone. ${link('#/shard/perm_start', 'Inheritance')} adds 2 wood and 1 stone per level (iron bars from level 2) to this dig as soon as you buy it, and again on each reset.</li>
          <li>Depth grant: a 3-wide shaft pays ${prestigeDepthShards(PRESTIGE_DEPTH_RATIO, 1)}◆ at the unlock and ${prestigeDepthShards(1, 1)}◆ at the core. A wide shaft (about twice that dug volume) pays ${prestigeDepthShards(PRESTIGE_DEPTH_RATIO, 2)}◆ and ${prestigeDepthShards(1, 2)}◆. The Echo page shows the live grant.</li>
          <li>${tileLink('seal')} +1◆, ${tileLink('core')} +4◆.</li>
        </ul>`;
    case 'market':
      return `
        <p>On a first dig, Market appears once wood is in the bag, and that row is the only one until stone and ores show up. The ${buildingLink('market')} starts each dig. Digging never awards coins — only selling does.</p>
        <ul>
          <li>Keep N + Auto-sell: surplus above Keep sells on blur / tick.</li>
          <li>${link('#/upgrade/sell_bonus', 'Market tip')} raises prices.</li>
          <li>Bars and lenses sell for more than raw ore.</li>
        </ul>`;
    case 'crew':
      return `
        <p>On a first dig, Crew appears after a Grove house. Orders start with Idle and Trees. Dirt, stone, and Anything appear once a digger is chopping trees. Widen appears with Echo. Flee and Stand ground appear with horrors. After the first prestige every order is listed; Toward core still waits until fog reveals the core.</p>
        <p>Hire diggers (cap from shacks + shards). New hires start <strong>Idle</strong> until you set a dig target. Out of energy, they walk to their shack (or the cottage) and refill only once they arrive. Vitality drains from digging, flood, lava, and horrors — ${buildingLink('chapel')} heals vitality while they rest in range. After that, diggers return to the face they left; tree cutters walk to the nearest tree instead.</p>
        <p>A Seal or Core order will not swing at a face the pick cannot scratch. The status bar and the selected digger’s orders name the missing Iron-bound level (6 with no shards). Steel tools do not open it.</p>
        <h3>Filters</h3>
        <ul>${DIG_FILTERS.map((f) => `<li><strong>${esc(f.label)}</strong> — ${esc(f.blurb)}</li>`).join('')}</ul>
        <h3>Headings</h3>
        <ul>${DIG_HEADINGS.map((h) => `<li><strong>${esc(h.label)}</strong> — ${esc(h.blurb)}</li>`).join('')}</ul>
        <h3>Stance</h3>
        <ul>${DIG_STANCES.map((s) => `<li><strong>${esc(s.label)}</strong> — ${esc(s.blurb)}</li>`).join('')}</ul>`;
    case 'combat':
      return `
        <p>Deep horrors spawn past ~${Math.round(MONSTER.spawnDepthRatio * 100)}% depth near the cube. They hunt diggers (${MONSTER.vitalityDamage} vitality per hit).</p>
        <ul>
          <li>${buildingLink('ward')} burns hosts in range (base r${WARD_RADIUS}, ${WARD_DPS} DPS).</li>
          <li>${link('#/upgrade/bright_wards', 'Bright wards')} need ${itemLink('crystalLens')}.</li>
          <li>Stance Stand ground: diggers deal ~${MONSTER.militiaDamage} when struck. Flee runs toward rest when a horror is within ~${MONSTER.fleeRange} tiles.</li>
        </ul>`;
    case 'weather':
      return `
        <p>Long clear skies, short telegraph, then rain. Flood fills connected basins from the bottom.</p>
        <ul>
          <li>Clear roughly ${WEATHER.CLEAR_MIN}–${WEATHER.CLEAR_MAX}s; rain ${WEATHER.RAIN_MIN}–${WEATHER.RAIN_MAX}s.</li>
          <li>${buildingLink('pump')} drains basins and keeps a dry pocket (r${PUMP_RADIUS}+ coils).</li>
          <li>Standing in flood wears vitality — diggers flee wet ground.</li>
        </ul>`;
    case 'hazards':
      return `
        <ul>
          <li>${tileLink('aquifer')} — flood on breach. On a first dig, seeing one opens the ${buildingLink('pump')} in Build.</li>
          <li>${tileLink('lava')} — burn while adjacent.</li>
          <li>${tileLink('gas')} — explosion on crack.</li>
        </ul>
        <p>See also ${link('#/mechanic/weather', 'Weather & floods')}.</p>`;
    case 'smelting':
      return `
        <p>${buildingLink('smelter')} and ${buildingLink('refinery')} sit on the sky pad. Select a building to lock its recipe, or <strong>Off</strong> to pause and save coal / inputs. Crafts are slow; a progress bar appears above while working.</p>
        <p>${link('#/upgrade/smelt_rate', 'Hotter furnace')} speeds both plants (+30% craft speed per level, max 6).</p>
        <h3>Smelter (~7s base)</h3>
        <ul>${SMELT_RECIPES.map((r) => `<li>${esc(formatRecipeLine(r))}</li>`).join('')}</ul>
        <h3>Refinery (~10s base)</h3>
        <ul>${REFINE_RECIPES.map((r) => `<li>${esc(formatRecipeLine(r))}</li>`).join('')}</ul>
        <p>Iron bars buy ${link('#/upgrade/pick_tier', 'Iron-bound pick')} — level 6 scratches a seal, and Seal splitter or Inheritance can lower that. Steel bars buy ${link('#/upgrade/steel_tools', 'Steel tools')}, which speed hits and do not raise scratch.</p>`;
    case 'layers':
      return `
        <p>HUD chapter beside Depth:</p>
        <table class="wiki-table"><thead><tr><th>Layer</th><th>Depth ≤</th></tr></thead>
        <tbody>${DIG_LAYERS.map(
          (l) =>
            `<tr><td>${esc(l.name)}</td><td>${Math.round(l.maxDepth * 100)}%</td></tr>`
        ).join('')}</tbody></table>`;
    case 'echo':
      return `
        <p>Build a ${buildingLink('listening')} for Echo Sense tier 1: a wide pulse that contains the cube somewhere inside it (not at the center), plus a rough camp bearing. No fog clear.</p>
        <ul>
          <li>${link('#/shard/perm_sense', 'Echo Sense')} shard upgrades shrink that region. The cube stays inside.</li>
          <li>${link('#/upgrade/focus_optics', 'Focus optics')} shrinks the region a little more. Needs ${itemLink('crystalLens')}.</li>
          <li>Toward core stays locked in Crew until fog reveals the core tile. Echo Sense does not unlock it.</li>
        </ul>`;
    default:
      return null;
  }
}

function pageMechanic(id) {
  const m = MECHANICS.find((x) => x.id === id);
  const body = mechanicBody(id);
  if (!m || !body) return notFound('Mechanic', id);
  return `
    ${crumbs(['#/mechanics', 'Mechanics'], [`#/mechanic/${id}`, m.title])}
    <h1>${esc(m.title)}</h1>
    <p class="wiki-lead">${esc(m.blurb)}</p>
    <section class="wiki-section">${body}</section>
  `;
}

function pageGuide(id) {
  const s = WIKI_SECTIONS.find((x) => x.id === id);
  if (!s) return notFound('Guide', id);
  return `
    ${crumbs(['#/', 'Home'], [`#/guide/${id}`, s.title])}
    <h1>${esc(s.title)}</h1>
    <section class="wiki-section">
      ${s.paragraphs.map((p) => `<p>${esc(p)}</p>`).join('')}
    </section>
  `;
}

function searchIndex() {
  /** @type {{href:string,title:string,blurb:string,icon:string}[]} */
  const out = [];
  for (const id of TILE_ORDER) {
    const t = TILES[id];
    if (!t) continue;
    out.push({
      href: `#/tile/${id}`,
      title: t.name,
      blurb: `Tile · hardness ${t.hardness}`,
      icon: tileIcon(id),
    });
  }
  for (const id of Object.keys(RESOURCE_META)) {
    out.push({
      href: `#/item/${id}`,
      title: RESOURCE_META[id].name,
      blurb: 'Item',
      icon: itemIcon(id),
    });
  }
  for (const id of Object.keys(BUILDINGS)) {
    out.push({
      href: `#/building/${id}`,
      title: BUILDINGS[id].name,
      blurb: BUILDINGS[id].role,
      icon: buildingIcon(id),
    });
  }
  for (const u of UPGRADES) {
    out.push({ href: `#/upgrade/${u.id}`, title: u.name, blurb: u.blurb, icon: '' });
  }
  for (const u of SHARD_UPGRADES) {
    out.push({ href: `#/shard/${u.id}`, title: u.name, blurb: u.blurb, icon: '' });
  }
  for (const m of MECHANICS) {
    out.push({ href: `#/mechanic/${m.id}`, title: m.title, blurb: m.blurb, icon: '' });
  }
  for (const s of WIKI_SECTIONS) {
    out.push({
      href: `#/guide/${s.id}`,
      title: s.title,
      blurb: s.paragraphs[0],
      icon: '',
    });
  }
  return out;
}

function pageSearch(q) {
  const needle = (q || '').trim().toLowerCase();
  const hits = searchIndex().filter(
    (e) =>
      e.title.toLowerCase().includes(needle) ||
      e.blurb.toLowerCase().includes(needle)
  );
  return `
    ${crumbs(['#/search', 'Search'])}
    <h1>Search${needle ? `: ${esc(q)}` : ''}</h1>
    ${
      !needle
        ? '<p class="wiki-lead">Type a tile, item, or building name.</p>'
        : hits.length
          ? `<ul class="wiki-search-hits">${hits
              .map(
                (h) =>
                  `<li><a href="${esc(h.href)}">${h.icon}<span><strong>${esc(h.title)}</strong><br /><span class="wiki-muted">${esc(h.blurb)}</span></span></a></li>`
              )
              .join('')}</ul>`
          : `<p>No matches for “${esc(q)}”.</p>`
    }
  `;
}

function notFound(kind, id) {
  return `
    ${crumbs(['#/', 'Home'])}
    <h1>Missing ${esc(kind)}</h1>
    <p>No entry for <code>${esc(id)}</code>. Try ${link('#/', 'the main page')} or search.</p>
  `;
}

function render() {
  const route = parseRoute();
  let html = '';
  let active = route.page;
  switch (route.page) {
    case 'home':
      html = pageHome();
      active = 'home';
      break;
    case 'tiles':
      html = pageTiles();
      break;
    case 'tile':
      html = pageTile(route.id);
      active = 'tiles';
      break;
    case 'items':
      html = pageItems();
      break;
    case 'item':
      html = pageItem(route.id);
      active = 'items';
      break;
    case 'buildings':
      html = pageBuildings();
      break;
    case 'building':
      html = pageBuilding(route.id);
      active = 'buildings';
      break;
    case 'upgrades':
      html = pageUpgrades();
      break;
    case 'upgrade':
      html = pageUpgrade(route.id);
      active = 'upgrades';
      break;
    case 'shards':
      html = pageShards();
      break;
    case 'shard':
      html = pageShard(route.id);
      active = 'shards';
      break;
    case 'mechanics':
      html = pageMechanics();
      break;
    case 'mechanic':
      html = pageMechanic(route.id);
      active = `mechanic:${route.id}`;
      break;
    case 'guide':
      html = pageGuide(route.id);
      active = `guide:${route.id}`;
      break;
    case 'search':
      html = pageSearch(route.q);
      break;
    default:
      html = pageHome();
      active = 'home';
  }
  renderNav(active);
  mainEl.innerHTML = html;
  mainEl.focus({ preventScroll: true });
  document.title =
    route.page === 'home'
      ? 'The Cube Dig Wiki'
      : `${mainEl.querySelector('h1')?.textContent || 'Wiki'} · Cube Dig`;
  window.scrollTo(0, 0);
}

searchForm?.addEventListener('submit', (e) => {
  e.preventDefault();
  const q = (searchInput?.value || '').trim();
  location.hash = q ? `#/search/${encodeURIComponent(q)}` : '#/';
});

window.addEventListener('hashchange', render);
if (!location.hash) location.hash = '#/';
else render();
