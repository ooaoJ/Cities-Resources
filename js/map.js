// js/map.js
// Substitua seu map.js por este arquivo.
// Requer: <canvas id="canvas"></canvas> no HTML.
// Assets esperados em: assets/tiles/*.png (grass.png, forest.png, sand.png, mountain.png, ocean.png, river.png, city1.png)

window.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('canvas');
  if (!canvas) {
    console.error('Canvas #canvas não encontrado');
    return;
  }
  const ctx = canvas.getContext('2d');

  // ========== CONFIGURAÇÃO ==========
  const mapWidth = 100;
  const mapHeight = 100;

  const baseCellSize = 20;
  let zoom = 1;
  let cellSize = baseCellSize * zoom;

  const MIN_ZOOM = 0.25;
  const MAX_ZOOM = 3.0;

  const camera = { x: 0, y: 0 };

  const map = [];
  const heightMap = [];
  const riverMap = Array.from({ length: mapHeight }, () => Array(mapWidth).fill(false));

  // --- tentar ler save do localStorage (para reaplicar seed e cidades se existir) ---
  const LS_KEY = 'cities_game_v1';
  let savedState = null;
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) savedState = JSON.parse(raw);
  } catch (e) {
    console.warn('Erro lendo save do localStorage:', e);
  }

  // seed: usar o seed salvo (se existir) para gerar o mesmo mapa após F5
  const seed = (savedState && savedState.seed !== undefined && savedState.seed !== null)
    ? Number(savedState.seed)
    : Math.floor(Math.random() * 1e9);

  // função RNG determinística
  function mulberry32(a) {
    return function () {
      var t = a += 0x6D2B79F5;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }
  }
  const rng = mulberry32(seed);

  // Se no save já existirem cidades, use-as; caso contrário, crie a capital padrão
  // Garantir que cada cidade tenha campos mínimos e territorySet construído depois
  window.cities = [];
  if (savedState && Array.isArray(savedState.cities) && savedState.cities.length) {
    // clone e normalize (não confie em territorySet serializado)
    window.cities = savedState.cities.map(c => {
      const nc = Object.assign({}, c);
      // segurança: remover referências estranhas
      nc.territoryRadius = nc.territoryRadius || 2;
      nc.buildings = nc.buildings || [];
      nc.buildQueue = nc.buildQueue || [];
      // territorySet será recalculado mais abaixo
      nc.territorySet = new Set();
      return nc;
    });
  } else {
    window.cities = [{
      x: Math.floor(mapWidth / 2),
      y: Math.floor(mapHeight / 2),
      food: 10,
      production: 0,
      population: 30,
      money: 1000,
      name: 'Capital',
      iconKey: 'city1',
      territoryRadius: 2,
      territorySet: new Set(),
      buildings: [],
      buildQueue: []
    }];
  }

  // guarda edificações por tile: key = "x,y" -> { type: 'farm'|'mine'|..., cityIndex }
  window.tileBuildings = window.tileBuildings || {};

  // se o save tinha informação em city.buildings, reconstruir tileBuildings para renderizar corretamente
  (function rebuildTileBuildingsFromCities() {
    window.tileBuildings = {}; // reset
    window.cities.forEach((city, ci) => {
      if (Array.isArray(city.buildings)) {
        city.buildings.forEach(b => {
          if (b && typeof b.x === 'number' && typeof b.y === 'number' && b.type) {
            const key = `${b.x},${b.y}`;
            // proteger contra sobreposição: última prevalece
            window.tileBuildings[key] = { type: b.type, cityIndex: ci };
          }
        });
      }
    });
  })();

  // exportar seed em debug para main.js salvar corretamente (main.js já tenta pegar window.__MAP_DEBUG.seed)
  window.__MAP_DEBUG = window.__MAP_DEBUG || {};
  window.__MAP_DEBUG.seed = seed;

  // ========== NOISE ==========
  function rand2i(x, y) {
    const n = (x * 374761393 + y * 668265263) ^ seed;
    const r = mulberry32(n)();
    return r * 2 - 1;
  }
  function smoothstep(t) { return t * t * (3 - 2 * t); }
  function smoothNoise(x, y) {
    const xf = Math.floor(x), yf = Math.floor(y);
    const fracX = x - xf, fracY = y - yf;
    const v00 = rand2i(xf, yf);
    const v10 = rand2i(xf + 1, yf);
    const v01 = rand2i(xf, yf + 1);
    const v11 = rand2i(xf + 1, yf + 1);
    const sx = smoothstep(fracX), sy = smoothstep(fracY);
    const ix0 = v00 * (1 - sx) + v10 * sx;
    const ix1 = v01 * (1 - sx) + v11 * sx;
    return ix0 * (1 - sy) + ix1 * sy;
  }
  function fractalNoise(x, y, octaves = 4, persistence = 0.5, scale = 8) {
    let amplitude = 1, frequency = 1 / scale, max = 0, total = 0;
    for (let o = 0; o < octaves; o++) {
      total += smoothNoise(x * frequency, y * frequency) * amplitude;
      max += amplitude;
      amplitude *= persistence;
      frequency *= 2;
    }
    return total / max;
  }

  // ========== GERAR HEIGHTMAP & BIOMAS ==========
  for (let y = 0; y < mapHeight; y++) {
    heightMap[y] = [];
    for (let x = 0; x < mapWidth; x++) {
      const nx = x / mapWidth * mapWidth;
      const ny = y / mapHeight * mapHeight;
      let h = fractalNoise(nx, ny, 5, 0.5, 12);
      const dx = (x - mapWidth / 2) / (mapWidth / 2);
      const dy = (y - mapHeight / 2) / (mapHeight / 2);
      const distCenter = Math.sqrt(dx * dx + dy * dy);
      h = h - (distCenter * 0.6);
      const v = Math.max(0, Math.min(1, (h + 1) / 2));
      heightMap[y][x] = v;
    }
  }

  function makeRiver() {
    let attempts = 0;
    while (attempts < 400) {
      attempts++;
      const sx = Math.floor(rng() * mapWidth);
      const sy = Math.floor(rng() * mapHeight);
      if (heightMap[sy][sx] > 0.7) {
        let x = sx, y = sy;
        for (let step = 0; step < 1000; step++) {
          riverMap[y][x] = true;
          if (heightMap[y][x] < 0.35) break;
          let best = { x, y, h: heightMap[y][x] };
          for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
            const nx = x + ox, ny = y + oy;
            if (nx < 0 || ny < 0 || nx >= mapWidth || ny >= mapHeight) continue;
            if (heightMap[ny][nx] < best.h) best = { x: nx, y: ny, h: heightMap[ny][nx] };
          }
          if (best.x === x && best.y === y) {
            const dirs = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];
            const d = dirs[Math.floor(rng() * dirs.length)];
            x = Math.max(0, Math.min(mapWidth - 1, x + d.x));
            y = Math.max(0, Math.min(mapHeight - 1, y + d.y));
          } else {
            x = best.x; y = best.y;
          }
          if (x === 0 || y === 0 || x === mapWidth - 1 || y === mapHeight - 1) break;
        }
        break;
      }
    }
  }
  const riverCount = Math.max(1, Math.floor((mapWidth * mapHeight) / 600));
  for (let i = 0; i < riverCount; i++) makeRiver();

  for (let y = 0; y < mapHeight; y++) {
    const row = [];
    for (let x = 0; x < mapWidth; x++) {
      const h = heightMap[y][x];
      if (riverMap[y][x] && h > 0.25) { row.push(4); continue; }
      if (h < 0.30) row.push(3);
      else if (h < 0.33) row.push(5);
      else if (h < 0.60) row.push(0);
      else if (h < 0.75) row.push(1);
      else row.push(2);
    }
    map.push(row);
  }

  function moveCityToLand(city) {
    if (map[city.y][city.x] !== 3 && map[city.y][city.x] !== 4) return;
    const q = [];
    const seen = new Set();
    q.push({ x: city.x, y: city.y });
    seen.add(city.x + ',' + city.y);
    while (q.length) {
      const p = q.shift();
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        if (ox === 0 && oy === 0) continue;
        const nx = p.x + ox, ny = p.y + oy;
        if (nx < 0 || ny < 0 || nx >= mapWidth || ny >= mapHeight) continue;
        if (seen.has(nx + ',' + ny)) continue;
        seen.add(nx + ',' + ny);
        if (map[ny][nx] !== 3 && map[ny][nx] !== 4) { city.x = nx; city.y = ny; return; }
        q.push({ x: nx, y: ny });
      }
    }
  }
  window.cities.forEach(moveCityToLand);

  // ========== TERRITORY HELPERS ==========
  function computeCityTerritory(city) {
    const radius = city.territoryRadius || 2;
    const set = new Set();
    for (let oy = -radius; oy <= radius; oy++) {
      for (let ox = -radius; ox <= radius; ox++) {
        const tx = city.x + ox;
        const ty = city.y + oy;
        if (tx < 0 || ty < 0 || tx >= mapWidth || ty >= mapHeight) continue;
        // usar Chebyshev/king distance (pra ficar parecido com civ)
        if (Math.max(Math.abs(ox), Math.abs(oy)) <= radius) {
          set.add(`${tx},${ty}`);
        }
      }
    }
    city.territorySet = set;
    return set;
  }
  function computeAllTerritories() {
    for (let i = 0; i < window.cities.length; i++) {
      computeCityTerritory(window.cities[i]);
    }
  }
  // (re)calcula territórios agora que cidades e mapa foram carregados
  computeAllTerritories();

  // ========== MINIMAP ==========
  const minimap = { x: 0, y: 0, width: 0, height: 0, tileSize: 1, padding: 6 };
  function pointInMinimap(px, py) {
    return px >= minimap.x && px <= minimap.x + minimap.width && py >= minimap.y && py <= minimap.y + minimap.height;
  }

  // ========== HiDPI / Viewport helpers ==========
  let DPR = window.devicePixelRatio || 1;
  function getVWidth() { return canvas.width / DPR; }
  function getVHeight() { return canvas.height / DPR; }

  function getMinZoomToFill() {
    const vw = getVWidth(), vh = getVHeight();
    const minZoomWidth = vw / (mapWidth * baseCellSize);
    const minZoomHeight = vh / (mapHeight * baseCellSize);
    return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.max(minZoomWidth, minZoomHeight)));
  }

  function clampCamera() {
    const vw = getVWidth(), vh = getVHeight();
    const mapPixelWidth = mapWidth * cellSize;
    const mapPixelHeight = mapHeight * cellSize;

    if (mapPixelWidth <= vw) {
      camera.x = (mapPixelWidth - vw) / 2;
    } else {
      camera.x = Math.max(0, Math.min(camera.x, mapPixelWidth - vw));
    }

    if (mapPixelHeight <= vh) {
      camera.y = (mapPixelHeight - vh) / 2;
    } else {
      camera.y = Math.max(0, Math.min(camera.y, mapPixelHeight - vh));
    }
  }

  function centerCameraOnCell(cellX, cellY) {
    cellSize = baseCellSize * zoom;
    const vw = getVWidth(), vh = getVHeight();
    camera.x = (cellX + 0.5) * cellSize - vw / 2;
    camera.y = (cellY + 0.5) * cellSize - vh / 2;
    clampCamera();
  }

  // ========== INPUT PAN ==========
  let isDragging = false;
  let dragStart = { x: 0, y: 0 };
  let cameraStart = { x: 0, y: 0 };

  canvas.addEventListener('mousedown', (e) => {
    const rect = canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    if (pointInMinimap(cx, cy)) {
      const tileX = Math.floor((cx - minimap.x) / minimap.tileSize);
      const tileY = Math.floor((cy - minimap.y) / minimap.tileSize);
      centerCameraOnCell(tileX, tileY);
      markDirty();
      return;
    }
    isDragging = true;
    dragStart = { x: e.clientX, y: e.clientY };
    cameraStart = { x: camera.x, y: camera.y };
    canvas.style.cursor = 'grabbing';
  });

  window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;
    camera.x = cameraStart.x - dx;
    camera.y = cameraStart.y - dy;
    clampCamera();
    markDirty();
  });

  window.addEventListener('mouseup', () => {
    isDragging = false;
    canvas.style.cursor = 'default';
  });

  // touch
  canvas.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
      const t = e.touches[0];
      const rect = canvas.getBoundingClientRect();
      const cx = t.clientX - rect.left;
      const cy = t.clientY - rect.top;
      if (pointInMinimap(cx, cy)) {
        const tileX = Math.floor((cx - minimap.x) / minimap.tileSize);
        const tileY = Math.floor((cy - minimap.y) / minimap.tileSize);
        centerCameraOnCell(tileX, tileY);
        markDirty();
        return;
      }
      isDragging = true;
      dragStart = { x: t.clientX, y: t.clientY };
      cameraStart = { x: camera.x, y: camera.y };
    }
  }, { passive: true });

  canvas.addEventListener('touchmove', (e) => {
    if (!isDragging || e.touches.length !== 1) return;
    const t = e.touches[0];
    const dx = t.clientX - dragStart.x;
    const dy = t.clientY - dragStart.y;
    camera.x = cameraStart.x - dx;
    camera.y = cameraStart.y - dy;
    clampCamera();
    markDirty();
  }, { passive: true });

  window.addEventListener('touchend', () => { isDragging = false; });

  // ========== ZOOM (mouse wheel) ==========
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;

    if (pointInMinimap(cx, cy)) return;

    const zoomFactor = e.deltaY < 0 ? 1.12 : 0.88;
    const desiredZoom = zoom * zoomFactor;

    const minAllowed = getMinZoomToFill();
    const newZoom = Math.max(minAllowed, Math.min(MAX_ZOOM, desiredZoom));

    const oldCellSize = cellSize;
    const mapX = (camera.x + cx) / oldCellSize;
    const mapY = (camera.y + cy) / oldCellSize;

    zoom = newZoom;
    cellSize = baseCellSize * zoom;

    camera.x = mapX * cellSize - cx;
    camera.y = mapY * cellSize - cy;

    clampCamera();
    markDirty();
  }, { passive: false });

  // ========== ASSETS LOADER ==========
  const tileImages = {};
  const tileFiles = {
    0: 'grass.png',
    1: 'forest.png',
    2: 'mountain.png',
    3: 'ocean.png',
    4: 'river.png',
    5: 'sand.png'
  };

  async function loadTiles() {
    const promises = [];
    for (const key in tileFiles) {
      const file = tileFiles[key];
      const img = new Image();
      img.src = `assets/tiles/${file}`;
      tileImages[key] = img;
      promises.push(new Promise((res) => {
        img.onload = () => res();
        img.onerror = () => {
          console.warn('Falha ao carregar tile:', img.src);
          res();
        };
      }));
    }
    await Promise.all(promises);
    tileCache.clear(); // limpar cache quando recarregar imagens
  }

  const cityImages = {};
  async function loadCityIcons(mapObj) {
    const promises = [];
    for (const key in mapObj) {
      const img = new Image();
      img.src = mapObj[key];
      cityImages[key] = img;
      promises.push(new Promise(res => {
        img.onload = () => res();
        img.onerror = () => {
          console.warn('Erro ao carregar ícone de cidade:', img.src);
          res();
        };
      }));
    }
    await Promise.all(promises);
  }

  // cache de tiles redimensionadas (offscreen canvases)
  const tileCache = new Map(); // key = `${key}@${w}x${h}` -> canvas
  function getCachedTile(key, width, height) {
    const cw = Math.max(1, Math.round(width));
    const ch = Math.max(1, Math.round(height));
    const cacheKey = `${key}@${cw}x${ch}`;
    if (tileCache.has(cacheKey)) return tileCache.get(cacheKey);
    const img = tileImages[key];
    if (!img || !img.complete || !img.naturalWidth) return null;
    const off = document.createElement('canvas');
    off.width = cw;
    off.height = ch;
    const octx = off.getContext('2d');
    octx.imageSmoothingEnabled = false;
    octx.drawImage(img, 0, 0, cw, ch);
    tileCache.set(cacheKey, off);
    // limite simples para cache
    if (tileCache.size > 300) {
      const firstKey = tileCache.keys().next().value;
      tileCache.delete(firstKey);
    }
    return off;
  }

  // ========== REDRAW SCHEDULER ==========
  let needsRedraw = true;
  let scheduled = false;
  function markDirty() {
    needsRedraw = true;
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      if (needsRedraw) drawMap();
      needsRedraw = false;
    });
  }

  // export drawMap for other modules
  window.drawMap = drawMap;

  // selected city
  let selectedCity = null;
  window.showCityInfo = function (city) {
    const panel = document.getElementById('city-panel');
    if (!panel) return;
    // se o UI espera (city, idx) - main/ui chamará com idx; aqui vamos apenas preencher dados visuais
    panel.style.display = 'block';
    panel.querySelector('.city-name').textContent = city.name || 'Cidade';
    panel.querySelector('.city-pop').textContent = Math.floor(city.population || 0);
    panel.querySelector('.city-food').textContent = Math.floor(city.food || 0);
    panel.querySelector('.city-prod').textContent = Math.floor(city.production || 0);
    panel.querySelector('.city-money').textContent = Math.floor(city.money || 0);
    panel.dataset.cityIndex = window.cities.indexOf(city);

    // mark the selectedCity reference and redraw to show territory highlight
    selectedCity = city;
    markDirty();
  };

  // double click select city
  canvas.addEventListener('dblclick', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const radius = Math.max(12, cellSize * 0.6);
    selectedCity = null;
    for (const city of window.cities) {
      const sx = city.x * cellSize - camera.x + cellSize / 2;
      const sy = city.y * cellSize - camera.y + cellSize / 2;
      const d = Math.hypot(sx - mx, sy - my);
      if (d <= radius) { selectedCity = city; break; }
    }
    if (selectedCity) window.showCityInfo(selectedCity);
    else {
      const panel = document.getElementById('city-panel');
      if (panel) panel.style.display = 'none';
      selectedCity = null;
    }
    markDirty();
  });

  // placing build mode
  let placingBuild = null; // { cityIndex, type }

  // single click: if placingBuild active, place building if valid
  canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    if (pointInMinimap(mx, my)) return;

    const tileX = Math.floor((camera.x + mx) / cellSize);
    const tileY = Math.floor((camera.y + my) / cellSize);
    if (tileX < 0 || tileY < 0 || tileX >= mapWidth || tileY >= mapHeight) return;

    // primeira checagem: clique em cima de cidade (abrir painel)
    const cityClickRadius = Math.max(12, cellSize * 0.6);
    for (let i = 0; i < window.cities.length; i++) {
      const city = window.cities[i];
      const sx = city.x * cellSize - camera.x + cellSize / 2;
      const sy = city.y * cellSize - camera.y + cellSize / 2;
      const d = Math.hypot(sx - mx, sy - my);
      if (d <= cityClickRadius) {
        if (typeof window.showCityInfo === 'function') {
          try { window.showCityInfo(city, i); } catch (err) { window.showCityInfo(city); }
        }
        selectedCity = city;
        markDirty();
        return;
      }
    }

    if (placingBuild) {
      const success = placeBuilding(placingBuild.cityIndex, tileX, tileY, placingBuild.type);
      if (success) {
        placingBuild = null;
        markDirty();
      } else {
        console.warn('Não foi possível construir aí (tile inválido ou fora do território).');
      }
      return;
    }

    // se não estamos em modo colocação, verificar se clicou em tile de território de alguma cidade
    // e disparar hook para a UI abrir modal
    let ownerIdx = -1;
    for (let i = 0; i < window.cities.length; i++) {
      const c = window.cities[i];
      if (c.territorySet && c.territorySet.has(`${tileX},${tileY}`)) {
        ownerIdx = i;
        break;
      }
    }
    if (ownerIdx >= 0) {
      if (typeof window.onTerritoryTileClick === 'function') {
        window.onTerritoryTileClick(ownerIdx, tileX, tileY);
      } else {
        console.log('Clicked territory tile', ownerIdx, tileX, tileY);
      }
    }
  });

  // ========== RENDER ==========
  function drawMap() {
    cellSize = baseCellSize * zoom;

    const vw = getVWidth(), vh = getVHeight();
    ctx.clearRect(0, 0, vw, vh);

    ctx.imageSmoothingEnabled = false;

    const startX = Math.floor(camera.x / cellSize);
    const startY = Math.floor(camera.y / cellSize);
    const endX = Math.ceil((camera.x + vw) / cellSize);
    const endY = Math.ceil((camera.y + vh) / cellSize);

    for (let y = startY; y < endY; y++) {
      if (y < 0 || y >= mapHeight) continue;
      for (let x = startX; x < endX; x++) {
        if (x < 0 || x >= mapWidth) continue;
        const terrain = map[y][x];

        const pad = Math.max(0, Math.floor(cellSize * 0.06));
        const drawX = Math.round(x * cellSize - camera.x) + pad;
        const drawY = Math.round(y * cellSize - camera.y) + pad;
        const drawW = Math.round(cellSize) - pad * 2;
        const drawH = Math.round(cellSize) - pad * 2;

        const cached = getCachedTile(terrain, drawW, drawH);
        if (cached) {
          ctx.drawImage(cached, drawX, drawY);
        } else {
          const img = tileImages[terrain];
          if (img && img.complete && img.naturalWidth) {
            try {
              ctx.drawImage(img, drawX, drawY, Math.max(1, drawW), Math.max(1, drawH));
            } catch (e) {
              fillTileFallback(ctx, terrain, drawX, drawY, drawW, drawH, x, y);
            }
          } else {
            fillTileFallback(ctx, terrain, drawX, drawY, drawW, drawH, x, y);
          }
        }

        // overlay: if tile é do território de alguma cidade, desenhar tint sutil
        for (let i = 0; i < window.cities.length; i++) {
          const c = window.cities[i];
          if (c.territorySet && c.territorySet.has(`${x},${y}`)) {
            ctx.save();
            ctx.globalAlpha = 0.14;
            if (selectedCity === c) ctx.globalAlpha = 0.26;
            ctx.fillStyle = '#FFEB3B';
            ctx.fillRect(drawX, drawY, Math.max(1, drawW), Math.max(1, drawH));
            ctx.restore();
            break;
          }
        }

        // highlight placing valid tile
        if (placingBuild) {
          const city = window.cities[placingBuild.cityIndex];
          if (city && city.territorySet && city.territorySet.has(`${x},${y}`) && isTileValidForBuildingType(x, y, placingBuild.type)) {
            ctx.save();
            ctx.strokeStyle = 'rgba(0,255,0,0.9)';
            ctx.lineWidth = Math.max(1, cellSize * 0.06);
            ctx.strokeRect(drawX + 2, drawY + 2, Math.max(1, drawW - 4), Math.max(1, drawH - 4));
            ctx.restore();
          }
        }
      }
    }

    // draw buildings
    for (let y = startY; y < endY; y++) {
      if (y < 0 || y >= mapHeight) continue;
      for (let x = startX; x < endX; x++) {
        if (x < 0 || x >= mapWidth) continue;
        const key = `${x},${y}`;
        const b = window.tileBuildings[key];
        if (!b) continue;
        const drawX = Math.round(x * cellSize - camera.x);
        const drawY = Math.round(y * cellSize - camera.y);
        const centerX = drawX + cellSize / 2;
        const centerY = drawY + cellSize / 2;
        const size = Math.max(6, cellSize * 0.45);

        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = Math.max(1, cellSize * 0.03);

        let color = '#8BC34A';
        let letter = '?';
        switch (b.type) {
          case 'farm': color = '#7CB342'; letter = 'F'; break;
          case 'mine': color = '#BDBDBD'; letter = 'M'; break;
          case 'house': color = '#FFB74D'; letter = 'H'; break;
          case 'well': color = '#4FC3F7'; letter = 'W'; break;
          case 'mill': color = '#AED581'; letter = 'L'; break;
          case 'lumber': color = '#A1887F'; letter = 'S'; break;
          case 'hunting': color = '#E57373'; letter = 'C'; break;
          case 'factory': color = '#9E9E9E'; letter = 'P'; break;
          case 'market': color = '#FFD54F'; letter = '$'; break;
          default: color = '#9E9E9E'; letter = (b.type && b.type[0]) ? b.type[0].toUpperCase() : '?';
        }

        ctx.fillStyle = color;
        const bw = Math.max(4, size * 0.8);
        const bh = Math.max(4, size * 0.8);
        ctx.fillRect(-bw/2, -bh/2, bw, bh);
        ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.strokeRect(-bw/2, -bh/2, bw, bh);

        ctx.fillStyle = '#111';
        ctx.font = `${Math.max(8, size * 0.4)}px Arial`;
        ctx.fillText(letter, 0, 0);

        ctx.restore();
      }
    }

    // draw cities
    window.cities.forEach(city => {
      const cx = Math.round(city.x * cellSize - camera.x + cellSize / 2);
      const cy = Math.round(city.y * cellSize - camera.y + cellSize / 2);

      const iconBase = Math.max(12, cellSize * 0.9);
      const key = city.iconKey || 'city1';
      const img = cityImages[key];

      let drawW = iconBase, drawH = iconBase;
      if (img && img.complete && img.naturalWidth) {
        const iw = img.naturalWidth, ih = img.naturalHeight;
        const aspect = iw / ih;
        if (aspect > 1) drawH = iconBase / aspect;
        else drawW = iconBase * aspect;
        ctx.drawImage(img, cx - drawW / 2, cy - drawH / 2, drawW, drawH);
      } else {
        const r = Math.max(6, cellSize * 0.35);
        if (!(cx + r < 0 || cy + r < 0 || cx - r > vw || cy - r > vh)) {
          ctx.beginPath();
          ctx.fillStyle = '#FF5252';
          ctx.strokeStyle = '#220000';
          ctx.lineWidth = Math.max(1, cellSize * 0.06);
          ctx.arc(cx, cy, r / 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      }

      // highlight selected city
      if (selectedCity === city) {
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(255,255,255,0.95)';
        ctx.lineWidth = Math.max(2, cellSize * 0.06);
        const highlightR = Math.max(12, cellSize * 0.8);
        ctx.arc(cx, cy, highlightR / 2 + 4, 0, Math.PI * 2);
        ctx.stroke();
      }

      // name
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.font = `${Math.max(10, cellSize * 0.35)}px Arial`;
      ctx.textAlign = 'center';
      ctx.fillText(city.name, cx, cy - (cellSize * 0.75));
    });

    // minimap
    drawMinimap();

    ctx.imageSmoothingEnabled = true;

    // expose debug each redraw (optional)
    window.__MAP_DEBUG = { seed, heightMap, riverMap, map, camera, baseCellSize, zoom, minimap };
  }

  // fallback color if image missing
  function fillTileFallback(ctx, terrain, x, y, w, h, mapX = 0, mapY = 0) {
    switch (terrain) {
      case 0: ctx.fillStyle = '#6BBF59'; break;
      case 1: ctx.fillStyle = '#2E8B57'; break;
      case 2: {
        const hval = heightMap[mapY] ? heightMap[mapY][mapX] : 0.8;
        if (hval > 0.92) ctx.fillStyle = '#FFFFFF';
        else if (hval > 0.85) ctx.fillStyle = '#BDBDBD';
        else ctx.fillStyle = '#8D8D8D';
        break;
      }
      case 3: ctx.fillStyle = '#0c3197ff'; break;
      case 4: ctx.fillStyle = '#1565C0'; break;
      case 5: ctx.fillStyle = '#F1E0A9'; break;
      default: ctx.fillStyle = 'magenta';
    }
    ctx.fillRect(x, y, Math.max(1, w), Math.max(1, h));
  }

  // ========== MINIMAP ==========
  function drawMinimap() {
    const vw = getVWidth(), vh = getVHeight();
    const maxSize = Math.min(220, Math.max(100, Math.min(vw, vh) * 0.22));
    const tileSize = Math.max(1, Math.floor(maxSize / Math.max(mapWidth, mapHeight)));
    const miniWidth = tileSize * mapWidth;
    const miniHeight = tileSize * mapHeight;
    const margin = 10;
    const miniX = vw - miniWidth - margin;
    const miniY = vh - miniHeight - margin;

    minimap.x = miniX;
    minimap.y = miniY;
    minimap.width = miniWidth;
    minimap.height = miniHeight;
    minimap.tileSize = tileSize;

    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = 'rgba(25,25,25,0.65)';
    ctx.fillRect(miniX - minimap.padding, miniY - minimap.padding, miniWidth + minimap.padding * 2, miniHeight + minimap.padding * 2);
    ctx.globalAlpha = 1;

    for (let y = 0; y < mapHeight; y++) {
      for (let x = 0; x < mapWidth; x++) {
        const t = map[y][x];
        switch (t) {
          case 0: ctx.fillStyle = '#6BBF59'; break;
          case 1: ctx.fillStyle = '#2E8B57'; break;
          case 2: ctx.fillStyle = '#8D8D8D'; break;
          case 3: ctx.fillStyle = '#1976D2'; break;
          case 4: ctx.fillStyle = '#1565C0'; break;
          case 5: ctx.fillStyle = '#F1E0A9'; break;
          default: ctx.fillStyle = 'magenta';
        }
        ctx.fillRect(miniX + x * tileSize, miniY + y * tileSize, tileSize, tileSize);
      }
    }

    window.cities.forEach(city => {
      const px = miniX + city.x * tileSize + tileSize / 2;
      const py = miniY + city.y * tileSize + tileSize / 2;
      ctx.beginPath();
      ctx.fillStyle = '#FF5252';
      ctx.arc(px, py, Math.max(1, tileSize * 0.35), 0, Math.PI * 2);
      ctx.fill();
    });

    const viewTileX = camera.x / cellSize;
    const viewTileY = camera.y / cellSize;
    const viewTileW = vw / cellSize;
    const viewTileH = vh / cellSize;

    const rectX = miniX + viewTileX * tileSize;
    const rectY = miniY + viewTileY * tileSize;
    const rectW = viewTileW * tileSize;
    const rectH = viewTileH * tileSize;

    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = 2;
    ctx.strokeRect(rectX, rectY, rectW, rectH);

    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 2;
    ctx.strokeRect(miniX - minimap.padding, miniY - minimap.padding, miniWidth + minimap.padding * 2, miniHeight + minimap.padding * 2);

    ctx.restore();
  }

  // ========== RESIZE & HiDPI ==========
  function resizeCanvas() {
    DPR = window.devicePixelRatio || 1;
    const cssW = window.innerWidth;
    const cssH = window.innerHeight;
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    canvas.width = Math.max(1, Math.floor(cssW * DPR));
    canvas.height = Math.max(1, Math.floor(cssH * DPR));
    // make drawing use CSS pixels
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    const minAllowed = getMinZoomToFill();
    if (zoom < minAllowed) {
      const oldCellSize = cellSize;
      const centerMapX = (camera.x + cssW / 2) / oldCellSize;
      const centerMapY = (camera.y + cssH / 2) / oldCellSize;
      zoom = minAllowed;
      cellSize = baseCellSize * zoom;
      camera.x = centerMapX * cellSize - cssW / 2;
      camera.y = centerMapY * cellSize - cssH / 2;
    }

    clampCamera();
    markDirty();
  }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  // center on capital initially
  if (window.cities && window.cities.length) {
    centerCameraOnCell(window.cities[0].x, window.cities[0].y);
  }

  // expose debug
  window.__MAP_DEBUG = window.__MAP_DEBUG || {};
  window.__MAP_DEBUG.seed = seed;
  window.__MAP_DEBUG.heightMap = heightMap;
  window.__MAP_DEBUG.riverMap = riverMap;
  window.__MAP_DEBUG.map = map;

  // load assets (non-blocking); redraw when ready
  (async () => {
    await loadTiles();
    await loadCityIcons({ city1: 'assets/tiles/city1.png' });
    markDirty();
  })();

  // reload API
  window.__MAP_RELOAD_ASSETS = async function () {
    await loadTiles();
    await loadCityIcons({ city1: 'assets/tiles/city1.png' });
    tileCache.clear();
    markDirty();
  };

  // helper exposure for main.js/ui
  window.centerCameraOnCell = centerCameraOnCell;
  window.getMapInfo = () => ({ map, heightMap, riverMap, seed });

  // Expor tipo de tile (0..5)
  window.getTerrain = function(x, y) {
    if (x < 0 || y < 0 || x >= mapWidth || y >= mapHeight) return null;
    return map[y][x];
  };

  // ========== BUILDING / PLACEMENT LOGIC ==========
  function isTileValidForBuildingType(x, y, type) {
    const terrain = map[y] && map[y][x];
    if (terrain === undefined) return false;
    if (type === 'farm') {
      return terrain === 0 || terrain === 1; // grass or forest
    } else if (type === 'mine') {
      return terrain === 2; // only mountain
    } else if (type === 'well') {
      return terrain === 5; // only sand/desert (example)
    } else if (type === 'mill') {
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        const nx = x + ox, ny = y + oy;
        if (nx >= 0 && ny >= 0 && nx < mapWidth && ny < mapHeight && map[ny][nx] === 4) return true;
      }
      return false;
    } else if (type === 'house') {
      return terrain !== 3; // not on ocean
    } else if (type === 'lumber' || type === 'hunting') {
      return terrain === 1; // forest
    } else if (type === 'factory' || type === 'market') {
      return terrain === 0; // prefer grass for those
    }
    return false;
  }

  function placeBuilding(cityIndex, x, y, type) {
    if (!window.cities[cityIndex]) return false;
    if (x < 0 || y < 0 || x >= mapWidth || y >= mapHeight) return false;
    const city = window.cities[cityIndex];

    // impedir construir no tile que contém qualquer cidade (incluindo a própria)
    if (window.cities.some(c => c.x === x && c.y === y)) return false;

    if (!city.territorySet || !city.territorySet.has(`${x},${y}`)) return false;
    const key = `${x},${y}`;
    if (window.tileBuildings[key]) return false; // já ocupado
    if (!isTileValidForBuildingType(x, y, type)) return false;

    window.tileBuildings[key] = { type, cityIndex };
    city.buildings = city.buildings || [];
    city.buildings.push({ x, y, type });

    if (type === 'farm') {
      city.production = (city.production || 0) + 2;
      city.food = (city.food || 0) + 10;
    } else if (type === 'mine') {
      city.production = (city.production || 0) + 3;
    } else if (type === 'house') {
      city.population = (city.population || 0) + 1;
    } else if (type === 'well') {
      city.food = (city.food || 0) + 2;
    } else if (type === 'mill') {
      city.production = (city.production || 0) + 1;
    } else if (type === 'lumber') {
      city.production = (city.production || 0) + 1;
    } else if (type === 'hunting') {
      city.food = (city.food || 0) + 5;
    } else if (type === 'factory') {
      city.production = (city.production || 0) + 5;
    } else if (type === 'market') {
      city.money = (city.money || 0) + 10;
    }

    markDirty();
    return true;
  }

  function findNearestValidTileFor(cityIndex, type) {
    const city = window.cities[cityIndex];
    if (!city) return null;
    const rad = city.territoryRadius || 2;
    for (let r = 0; r <= rad; r++) {
      for (let oy = -r; oy <= r; oy++) for (let ox = -r; ox <= r; ox++) {
        const tx = city.x + ox, ty = city.y + oy;
        if (tx < 0 || ty < 0 || tx >= mapWidth || ty >= mapHeight) continue;
        if (!city.territorySet.has(`${tx},${ty}`)) continue;
        if (!window.tileBuildings[`${tx},${ty}`] && isTileValidForBuildingType(tx, ty, type)) return { x: tx, y: ty };
      }
    }
    return null;
  }

  // Expor API para o resto do jogo/UI
  window.startPlacingBuilding = function(cityIndex, type) {
    placingBuild = { cityIndex, type };
    markDirty();
  };
  window.stopPlacingBuilding = function() {
    placingBuild = null;
    markDirty();
  };
  window.placeBuilding = placeBuilding;
  window.findNearestValidTileFor = findNearestValidTileFor;
  window.getTileBuildings = () => window.tileBuildings;
  window.isTileInCityTerritory = (cityIndex, x, y) => {
    const c = window.cities[cityIndex];
    return c && c.territorySet && c.territorySet.has(`${x},${y}`);
  };
  window.getCityTerritory = (cityIndex) => {
    const c = window.cities[cityIndex];
    if (!c) return [];
    return Array.from(c.territorySet).map(s => { const [xx,yy] = s.split(','); return { x: +xx, y: +yy }; });
  };
  window.computeAllTerritories = computeAllTerritories;

  // Hook default — UI deve sobrescrever com função (cityIndex,x,y)
  window.onTerritoryTileClick = window.onTerritoryTileClick || function(cityIndex, x, y) {
    console.log('Territory tile clicked', cityIndex, x, y);
  };

  // initial draw
  markDirty();
});
