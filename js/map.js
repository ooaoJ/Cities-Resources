window.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');

    // ========== CONFIGURAÇÃO ==========
    const mapWidth = 100;
    const mapHeight = 100;

    // tamanho da célula base (pixels) - ajuste para mudar resolução do mapa
    const baseCellSize = 20;
    let zoom = 1;
    let cellSize = baseCellSize * zoom;

    // limites de zoom
    const MIN_ZOOM = 0.25;
    const MAX_ZOOM = 3.0;

    // câmera em pixels (pos. do canto superior esquerdo do mapa)
    const camera = { x: 0, y: 0 };

    // containers do mundo
    let map = [];
    const heightMap = [];
    const riverMap = Array.from({length: mapHeight}, () => Array(mapWidth).fill(false));

    // cidades (inicializa capital no centro)
    window.cities = [{
        x: Math.floor(mapWidth / 2),
        y: Math.floor(mapHeight / 2),
        food: 10, production: 0, population: 30, name: 'capital'
    }];

    // seed determinística (troque por número fixo se quiser mapas repetíveis)
    const seed = Math.floor(Math.random() * 1e9);
    function mulberry32(a) {
        return function() {
            var t = a += 0x6D2B79F5;
            t = Math.imul(t ^ t >>> 15, t | 1);
            t ^= t + Math.imul(t ^ t >>> 7, t | 61);
            return ((t ^ t >>> 14) >>> 0) / 4294967296;
        }
    }
    const rng = mulberry32(seed);

    // ========== NOISE (value noise + bilinear) ==========
    function rand2i(x, y) {
        const n = (x * 374761393 + y * 668265263) ^ seed;
        const r = mulberry32(n)();
        return r * 2 - 1; // -1..1
    }
    function smoothstep(t) { return t * t * (3 - 2 * t); }
    function smoothNoise(x, y) {
        const xf = Math.floor(x), yf = Math.floor(y);
        const fracX = x - xf, fracY = y - yf;
        const v00 = rand2i(xf, yf);
        const v10 = rand2i(xf+1, yf);
        const v01 = rand2i(xf, yf+1);
        const v11 = rand2i(xf+1, yf+1);
        const sx = smoothstep(fracX), sy = smoothstep(fracY);
        const ix0 = v00 * (1 - sx) + v10 * sx;
        const ix1 = v01 * (1 - sx) + v11 * sx;
        return ix0 * (1 - sy) + ix1 * sy;
    }
    function fractalNoise(x, y, octaves = 4, persistence = 0.5, scale = 8) {
        let amplitude = 1, frequency = 1/scale, max = 0, total = 0;
        for (let o = 0; o < octaves; o++) {
            total += smoothNoise(x * frequency, y * frequency) * amplitude;
            max += amplitude;
            amplitude *= persistence;
            frequency *= 2;
        }
        return total / max; // aproximadamente -1..1
    }

    // ========== GERAR heightMap & biomas ==========
    for (let y = 0; y < mapHeight; y++) {
        heightMap[y] = [];
        for (let x = 0; x < mapWidth; x++) {
            const nx = x / mapWidth * mapWidth;
            const ny = y / mapHeight * mapHeight;
            let h = fractalNoise(nx, ny, 5, 0.5, 12);
            // bias para criar continentes (menos terra nos cantos)
            const dx = (x - mapWidth/2)/(mapWidth/2);
            const dy = (y - mapHeight/2)/(mapHeight/2);
            const distCenter = Math.sqrt(dx*dx + dy*dy);
            h = h - (distCenter * 0.6);
            const v = Math.max(0, Math.min(1, (h + 1) / 2));
            heightMap[y][x] = v;
        }
    }

    // gera rios simples a partir de pontos altos
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
                    let best = {x, y, h: heightMap[y][x]};
                    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
                        const nx = x + ox, ny = y + oy;
                        if (nx < 0 || ny < 0 || nx >= mapWidth || ny >= mapHeight) continue;
                        if (heightMap[ny][nx] < best.h) best = {x: nx, y: ny, h: heightMap[ny][nx]};
                    }
                    if (best.x === x && best.y === y) {
                        const dirs = [{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}];
                        const d = dirs[Math.floor(rng()*dirs.length)];
                        x = Math.max(0, Math.min(mapWidth-1, x + d.x));
                        y = Math.max(0, Math.min(mapHeight-1, y + d.y));
                    } else {
                        x = best.x; y = best.y;
                    }
                    if (x === 0 || y === 0 || x === mapWidth-1 || y === mapHeight-1) break;
                }
                break;
            }
        }
    }
    const riverCount = Math.max(1, Math.floor((mapWidth * mapHeight) / 600));
    for (let i = 0; i < riverCount; i++) makeRiver();

    // popula map (biomas) a partir do heightMap e riverMap
    for (let y = 0; y < mapHeight; y++) {
        const row = [];
        for (let x = 0; x < mapWidth; x++) {
            const h = heightMap[y][x];
            if (riverMap[y][x] && h > 0.25) { row.push(4); continue; } // rio
            if (h < 0.30) row.push(3);   // água
            else if (h < 0.33) row.push(5); // praia
            else if (h < 0.60) row.push(0); // grama
            else if (h < 0.75) row.push(1); // floresta
            else row.push(2);               // montanha
        }
        map.push(row);
    }

    // Se a cidade estiver na água, move para a terra mais próxima
    function moveCityToLand(city) {
        if (map[city.y][city.x] !== 3 && map[city.y][city.x] !== 4) return;
        const q = [];
        const seen = new Set();
        q.push({x: city.x, y: city.y});
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
                q.push({x: nx, y: ny});
            }
        }
    }
    window.cities.forEach(moveCityToLand);

    // ========== MINIMAP STATE ==========
    const minimap = { x: 0, y: 0, width: 0, height: 0, tileSize: 1, padding: 6 };

    function pointInMinimap(px, py) {
        return px >= minimap.x && px <= minimap.x + minimap.width && py >= minimap.y && py <= minimap.y + minimap.height;
    }

    // ========== CAMERA & CLAMP / ZOOM helpers ==========
    function getMinZoomToFill() {
        // calcula zoom minimo necessário para que o mapa ocupe ao menos largura OU altura da tela
        const minZoomWidth  = canvas.width  / (mapWidth  * baseCellSize);
        const minZoomHeight = canvas.height / (mapHeight * baseCellSize);
        return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.max(minZoomWidth, minZoomHeight)));
    }

    function clampCamera() {
        const mapPixelWidth  = mapWidth * cellSize;
        const mapPixelHeight = mapHeight * cellSize;

        // se o mapa for menor que a viewport, centraliza (camera pode ser negativa)
        if (mapPixelWidth <= canvas.width) {
            camera.x = (mapPixelWidth - canvas.width) / 2;
        } else {
            camera.x = Math.max(0, Math.min(camera.x, mapPixelWidth - canvas.width));
        }

        if (mapPixelHeight <= canvas.height) {
            camera.y = (mapPixelHeight - canvas.height) / 2;
        } else {
            camera.y = Math.max(0, Math.min(camera.y, mapPixelHeight - canvas.height));
        }
    }

    // centraliza câmera numa célula do mapa
    function centerCameraOnCell(cellX, cellY) {
        cellSize = baseCellSize * zoom;
        camera.x = (cellX + 0.5) * cellSize - canvas.width / 2;
        camera.y = (cellY + 0.5) * cellSize - canvas.height / 2;
        clampCamera();
    }

    // ========== INPUT: PAN (mouse/touch) ==========
    let isDragging = false;
    let dragStart = { x: 0, y: 0 };
    let cameraStart = { x: 0, y: 0 };

    canvas.addEventListener('mousedown', (e) => {
        const rect = canvas.getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;
        // clique no minimapa centraliza
        if (pointInMinimap(cx, cy)) {
            const tileX = Math.floor((cx - minimap.x) / minimap.tileSize);
            const tileY = Math.floor((cy - minimap.y) / minimap.tileSize);
            centerCameraOnCell(tileX, tileY);
            drawMap();
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
        drawMap();
    });

    window.addEventListener('mouseup', () => {
        isDragging = false;
        canvas.style.cursor = 'default';
    });

    // toque (mobile)
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
                drawMap();
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
        drawMap();
    }, { passive: true });

    window.addEventListener('touchend', () => { isDragging = false; });

    // ========== ZOOM (roda do mouse) ==========
    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;

        // se rodou sobre minimapa, ignora (opcional)
        if (pointInMinimap(cx, cy)) return;

        const zoomFactor = e.deltaY < 0 ? 1.12 : 0.88;
        const desiredZoom = zoom * zoomFactor;

        const minAllowed = getMinZoomToFill();
        const newZoom = Math.max(minAllowed, Math.min(MAX_ZOOM, desiredZoom));

        // manter o ponto do cursor estável
        const mapX = (camera.x + cx) / (cellSize);
        const mapY = (camera.y + cy) / (cellSize);

        zoom = newZoom;
        cellSize = baseCellSize * zoom;

        camera.x = mapX * cellSize - cx;
        camera.y = mapY * cellSize - cy;

        clampCamera();
        drawMap();
    }, { passive: false });

    // ========== RENDER (desenha apenas o que é visível) ==========
    function drawMap() {
        cellSize = baseCellSize * zoom;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const startX = Math.floor(camera.x / cellSize);
        const startY = Math.floor(camera.y / cellSize);
        const endX = Math.ceil((camera.x + canvas.width) / cellSize);
        const endY = Math.ceil((camera.y + canvas.height) / cellSize);

        for (let y = startY; y < endY; y++) {
            if (y < 0 || y >= mapHeight) continue;
            for (let x = startX; x < endX; x++) {
                if (x < 0 || x >= mapWidth) continue;
                const terrain = map[y][x];
                switch (terrain) {
                    case 0: ctx.fillStyle = '#6BBF59'; break; // grama
                    case 1: ctx.fillStyle = '#2E8B57'; break; // floresta
                    case 2: {
                        const h = heightMap[y][x];
                        if (h > 0.92) ctx.fillStyle = '#FFFFFF';
                        else if (h > 0.85) ctx.fillStyle = '#BDBDBD';
                        else ctx.fillStyle = '#8D8D8D';
                        break;
                    }
                    case 3: ctx.fillStyle = '#0c3197ff'; break; // água
                    case 4: ctx.fillStyle = '#1565C0'; break; // rio
                    case 5: ctx.fillStyle = '#F1E0A9'; break; // praia
                    default: ctx.fillStyle = 'magenta';
                }
                const pad = Math.max(0, Math.floor(cellSize * 0.06));
                const drawX = Math.round(x * cellSize - camera.x) + pad;
                const drawY = Math.round(y * cellSize - camera.y) + pad;
                ctx.fillRect(drawX, drawY, Math.round(cellSize) - pad*2, Math.round(cellSize) - pad*2);
            }
        }

        // desenha cidades
        window.cities.forEach(city => {
            const cx = Math.round(city.x * cellSize - camera.x + cellSize / 2);
            const cy = Math.round(city.y * cellSize - camera.y + cellSize / 2);
            const r = Math.max(3, cellSize * 0.35);
            if (cx + r < 0 || cy + r < 0 || cx - r > canvas.width || cy - r > canvas.height) return;
            ctx.beginPath();
            ctx.fillStyle = '#FF5252';
            ctx.strokeStyle = '#220000';
            ctx.lineWidth = Math.max(1, cellSize * 0.06);
            ctx.arc(cx, cy, r/2, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = 'rgba(255,255,255,0.9)';
            ctx.font = `${Math.max(10, cellSize * 0.4)}px Arial`;
            ctx.textAlign = 'center';
            ctx.fillText(city.name, cx, cy - r);
        });

        // minimapa por cima
        drawMinimap();
    }

    // ========== MINIMAPA ==========
    function drawMinimap() {
        // dimensionamento: queremos que o minimapa caiba confortavelmente
        const maxSize = Math.min(220, Math.max(100, Math.min(canvas.width, canvas.height) * 0.22));
        const tileSize = Math.max(1, Math.floor(maxSize / Math.max(mapWidth, mapHeight)));
        const miniWidth = tileSize * mapWidth;
        const miniHeight = tileSize * mapHeight;
        const margin = 10;
        const miniX = canvas.width - miniWidth - margin;
        const miniY = canvas.height - miniHeight - margin;

        minimap.x = miniX;
        minimap.y = miniY;
        minimap.width = miniWidth;
        minimap.height = miniHeight;
        minimap.tileSize = tileSize;

        ctx.save();
        // fundo leve
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = 'rgba(25,25,25,0.65)';
        ctx.fillRect(miniX - minimap.padding, miniY - minimap.padding, miniWidth + minimap.padding*2, miniHeight + minimap.padding*2);
        ctx.globalAlpha = 1;

        // tiles do minimapa
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

        // cidades no minimapa
        window.cities.forEach(city => {
            const px = miniX + city.x * tileSize + tileSize/2;
            const py = miniY + city.y * tileSize + tileSize/2;
            ctx.beginPath();
            ctx.fillStyle = '#FF5252';
            ctx.arc(px, py, Math.max(1, tileSize * 0.35), 0, Math.PI*2);
            ctx.fill();
        });

        // retângulo da viewport no minimapa
        const viewTileX = camera.x / cellSize;
        const viewTileY = camera.y / cellSize;
        const viewTileW = canvas.width / cellSize;
        const viewTileH = canvas.height / cellSize;

        const rectX = miniX + viewTileX * tileSize;
        const rectY = miniY + viewTileY * tileSize;
        const rectW = viewTileW * tileSize;
        const rectH = viewTileH * tileSize;

        ctx.strokeStyle = 'rgba(255,255,255,0.95)';
        ctx.lineWidth = 2;
        ctx.strokeRect(rectX, rectY, rectW, rectH);

        // contorno
        ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.lineWidth = 2;
        ctx.strokeRect(miniX - minimap.padding, miniY - minimap.padding, miniWidth + minimap.padding*2, miniHeight + minimap.padding*2);

        ctx.restore();
    }

    // ========== RESIZE & INICIALIZAÇÃO ==========
    function resizeCanvas() {
        // tamanho do canvas
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;

        // garante zoom mínimo quando redimensiona
        const minAllowed = getMinZoomToFill();
        if (zoom < minAllowed) {
            // preservar centro visual antes de ajustar zoom
            const oldCellSize = cellSize;
            const centerMapX = (camera.x + canvas.width / 2) / oldCellSize;
            const centerMapY = (camera.y + canvas.height / 2) / oldCellSize;
            zoom = minAllowed;
            cellSize = baseCellSize * zoom;
            camera.x = centerMapX * cellSize - canvas.width / 2;
            camera.y = centerMapY * cellSize - canvas.height / 2;
        }

        clampCamera();
        drawMap();
    }
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    // centraliza inicialmente na capital
    if (window.cities && window.cities.length) {
        centerCameraOnCell(window.cities[0].x, window.cities[0].y);
    }

    // export debug (útil pra inspecionar)
    window.__MAP_DEBUG = { seed, heightMap, riverMap, map, camera, baseCellSize, zoom, minimap };

    // ========== EXPORT (opcional: gerar / salvar mapa) ==========
    // Você pode acessar window.__MAP_DEBUG para inspecionar os dados no console.
});
