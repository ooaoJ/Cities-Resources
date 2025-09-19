// main.js
window.addEventListener('DOMContentLoaded', () => {
  // Config jogo
  const TICK_MS = 1000; // 1 segundo por tick (opcional)

  /* ---------- Game state helpers ---------- */
  function safeCityForSave(city) {
    // cria cópia sem campos não-serializáveis (territorySet é Set, não serializável)
    const copy = Object.assign({}, city);
    // Remover campos derivados que serão recalculados no load
    delete copy.territorySet;
    return copy;
  }

  function saveGame() {
    try {
      const state = {
        cities: (window.cities || []).map(safeCityForSave),
        // apenas salvar seed se disponível
        seed: window.__MAP_DEBUG?.seed ?? null,
        tileBuildings: window.tileBuildings || {}
      };
      localStorage.setItem('cities_game_v1', JSON.stringify(state));
      //console.log('salvo');
    } catch (e) {
      console.warn('erro salvando', e);
    }
  }

  function loadGame() {
    try {
      const raw = localStorage.getItem('cities_game_v1');
      if (!raw) return false;
      const state = JSON.parse(raw);
      if (state.cities) {
        // restaurar cidades garantindo que propriedades mínimas existam
        window.cities = state.cities.map(c => {
          const city = Object.assign({
            x: 0, y: 0,
            food: 0, production: 0, population: 0, money: 0,
            name: 'Cidade',
            iconKey: 'city1',
            territoryRadius: 2,
            buildings: [],
            buildQueue: []
          }, c);
          // territorySet será recalculado por computeAllTerritories()
          city.territorySet = new Set();
          city.buildings = city.buildings || [];
          city.buildQueue = city.buildQueue || [];
          return city;
        });
      }
      // restaurar tileBuildings (opcional)
      if (state.tileBuildings) {
        window.tileBuildings = state.tileBuildings;
      } else {
        window.tileBuildings = window.tileBuildings || {};
      }

      // after loading cities, recompute territories (map.js exposes computeAllTerritories)
      if (typeof window.computeAllTerritories === 'function') {
        window.computeAllTerritories();
      } else {
        // if not available yet, will be OK — map.js init will compute territories on its load
      }

      return true;
    } catch (e) {
      console.warn('erro carregando', e);
      return false;
    }
  }

  /* ---------- Selection UI (hook from map.js) ---------- */
  // map.js irá expor showCityInfo, mas se não expuser, cria fallback
  if (!window.showCityInfo) {
    window.showCityInfo = function(city) {
      // tenta encontrar painel
      const panel = document.getElementById('city-panel');
      if (!panel) return;
      panel.querySelector('.city-name').textContent = city.name || 'Cidade';
      panel.querySelector('.city-pop').textContent = Math.floor(city.population || 0);
      panel.querySelector('.city-food').textContent = Math.floor(city.food || 0);
      panel.querySelector('.city-prod').textContent = Math.floor(city.production || 0);
      panel.querySelector('.city-money').textContent = Math.floor(city.money || 0);
      panel.dataset.cityIndex = window.cities.indexOf(city);
      panel.style.display = 'block';
    };
  }

  /* ---------- City actions (called by UI) ----------
     Implementações:
       - buildFarm: retrocompatibilidade (construção imediata)
       - queueBuilding: enfileira construção (checagens, débito do custo)
  */
  window.cityAction = window.cityAction || {};

  // manter compatibilidade com o botão "Construir Fazenda" anterior
  window.cityAction.buildFarm = function(index) {
    const c = window.cities[index];
    if (!c) return;
    const cost = 200;
    if ((c.money || 0) < cost) {
      alert('Dinheiro insuficiente!');
      return;
    }
    c.money -= cost;
    // farm aumenta production e food por turno (imediato)
    c.production = (c.production || 0) + 2;
    c.food = (c.food || 0) + 10;
    // persistir e atualizar UI/map
    saveGame();
    if (window.updateUI) window.updateUI();
    if (window.drawMap) window.drawMap();
  };

  // Repetir regras de validação de terrenos (de forma compatível com UI)
  function isTypeAllowedOnTerrain(type, terrain) {
    // terrain codes: 0 grass, 1 forest, 2 mountain, 3 ocean, 4 river, 5 sand
    if (type === 'farm') return terrain === 0 || terrain === 1;
    if (type === 'factory') return terrain === 0;
    if (type === 'market') return terrain === 0;
    if (type === 'lumber') return terrain === 1;
    if (type === 'hunting') return terrain === 1;
    if (type === 'mine') return terrain === 2;
    if (type === 'mill') return terrain === 4 || terrain === 0; // mill UI allowed for river and farm also included elsewhere
    if (type === 'well') return terrain === 5;
    if (type === 'house') return terrain !== 3;
    // fallback: allow
    return true;
  }

  // queueBuilding: enfileira construção para uma cidade (chamada pela UI)
  window.cityAction.queueBuilding = function(cityIndex, x, y, type, cost = 0, turns = 1) {
    const city = window.cities[cityIndex];
    if (!city) return { ok: false, reason: 'Cidade inválida' };

    // checar se tile pertence ao território da cidade
    if (typeof window.isTileInCityTerritory === 'function') {
      if (!window.isTileInCityTerritory(cityIndex, x, y)) {
        return { ok: false, reason: 'Tile fora do território da cidade' };
      }
    } else {
      // fallback: não permitir se não temos função
      return { ok: false, reason: 'Validação de território indisponível' };
    }

    // checar ocupação
    const key = `${x},${y}`;
    const tileBuildings = (typeof window.getTileBuildings === 'function') ? window.getTileBuildings() : (window.tileBuildings || {});
    if (tileBuildings[key]) return { ok: false, reason: 'Já existe uma construção neste tile' };

    // checar terreno / validade
    const terrain = (typeof window.getTerrain === 'function') ? window.getTerrain(x, y) : null;
    if (terrain === null || terrain === undefined) return { ok: false, reason: 'Terreno inválido' };
    if (!isTypeAllowedOnTerrain(type, terrain)) return { ok: false, reason: 'Tipo de construção não permitido neste terreno' };

    // checar recursos (dinheiro) da cidade
    if ((city.money || 0) < (cost || 0)) return { ok: false, reason: 'Dinheiro insuficiente' };

    // debitar custo agora
    city.money = (city.money || 0) - (cost || 0);

    // garantir buildQueue
    city.buildQueue = city.buildQueue || [];

    // garantir que o mesmo tile não esteja já enfileirado
    if (city.buildQueue.find(b => b.x === x && b.y === y)) {
      // refund (se já debitado)
      city.money = (city.money || 0) + (cost || 0);
      return { ok: false, reason: 'Já existe uma construção enfileirada para este tile' };
    }

    // adicionar à fila
    city.buildQueue.push({
      x, y,
      type,
      cost: cost || 0,
      remainingTurns: Math.max(1, Math.floor(turns || 1))
    });

    // salvar e atualizar UI/map
    saveGame();
    if (window.updateUI) window.updateUI();
    if (window.drawMap) window.drawMap();

    return { ok: true };
  };

  /* ---------- Turn tick (chamado pelo botão ou pelo loop) ---------- */
  function gameTick() {
    // exemplo: cada cidade ganha comida = pop * 0.6, ganha money production*0.3
    window.cities.forEach((city, cityIndex) => {
      city.food = (city.food || 0) + (city.population || 0) * 0.6;
      city.money = (city.money || 0) + Math.floor((city.production || 0) * 0.4);
      // consumir comida se desejar (comentado por enquanto)
      // city.food -= city.population * 0.4;

      // processa fila de construção (decrementa remainingTurns)
      if (city.buildQueue && city.buildQueue.length) {
        // iterar ao contrário para permitir splice sem problemas de índice
        for (let i = city.buildQueue.length - 1; i >= 0; i--) {
          const b = city.buildQueue[i];
          b.remainingTurns = (b.remainingTurns || 1) - 1;
          if (b.remainingTurns <= 0) {
            // tentar colocar a construção no mapa usando API do map.js
            const placed = (typeof window.placeBuilding === 'function')
              ? window.placeBuilding(cityIndex, b.x, b.y, b.type)
              : false;

            if (!placed) {
              // se falhar (ocupado / inválido), reembolsar o custo
              city.money = (city.money || 0) + (b.cost || 0);
              // opcional: notificar jogador (a UI pode mostrar isso)
              console.warn(`Falha ao concluir construção ${b.type} em (${b.x},${b.y}). Custo reembolsado.`);
            } else {
              // sucesso: placeBuilding já atualiza city.buildings e city.production/food etc.
              // se for necessário, podemos rodar efeitos adicionais aqui.
            }

            // remover da fila
            city.buildQueue.splice(i, 1);
          }
        }
      }
    });

    if (window.updateUI) window.updateUI();
    if (window.drawMap) window.drawMap();
    saveGame();
  }

  /* ---------- Hook ao botão Próximo Turno ---------- */
  const nextBtn = document.getElementById('nextTurn');
  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      gameTick();
    });
  }

  /* ---------- Autosave / autoplay (opcional) ---------- */
  // carregar estado salvo (se houver)
  const loaded = loadGame();
  if (!loaded) {
    // garantir estrutura inicial se não houver save
    window.cities = window.cities || [{
      x: 50, y: 50,
      food: 10, production: 0, population: 30, money: 1000,
      name: 'Capital', iconKey: 'city1',
      territoryRadius: 2,
      territorySet: new Set(),
      buildings: [],
      buildQueue: []
    }];
  } else {
    // quando carregamos, computeAllTerritories pode já ter sido chamada. 
    // Forçar uma recomputação caso a função exista (garantir territorySet como Set).
    if (typeof window.computeAllTerritories === 'function') window.computeAllTerritories();
  }

  // garantir que arrays existam
  window.cities.forEach(c => {
    c.buildings = c.buildings || [];
    c.buildQueue = c.buildQueue || [];
    c.territoryRadius = c.territoryRadius || 2;
    // territorySet será recalculado por map.js; se não, inicializar vazio
    if (!c.territorySet || !(c.territorySet instanceof Set)) c.territorySet = new Set();
  });

  if (window.updateUI) window.updateUI();
  if (window.drawMap) window.drawMap();

  // opcional: loop automático (descomente se quiser autoplay)
  // setInterval(gameTick, TICK_MS);
});
