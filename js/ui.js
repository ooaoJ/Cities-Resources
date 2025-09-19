// js/ui.js
window.addEventListener('DOMContentLoaded', () => {
  const LS_KEY = 'cities_game_v1';

  const foodDisplay = document.getElementById('food');
  const productionDisplay = document.getElementById('production');
  const populationDisplay = document.getElementById('population');
  const moneyDisplay = document.getElementById('money');

  function updateUI() {
    if (!window.cities) return;

    const totalFood = window.cities.reduce((sum, city) => sum + (city.food || 0), 0);
    const totalProduction = window.cities.reduce((sum, city) => sum + (city.production || 0), 0);
    const totalPopulation = window.cities.reduce((sum, city) => sum + (city.population || 0), 0);
    const totalMoney = window.cities.reduce((sum, city) => sum + (city.money || 0), 0);

    if (foodDisplay) foodDisplay.textContent = Math.floor(totalFood);
    if (productionDisplay) productionDisplay.textContent = Math.floor(totalProduction);
    if (populationDisplay) populationDisplay.textContent = Math.floor(totalPopulation);
    if (moneyDisplay) moneyDisplay.textContent = Math.floor(totalMoney);

    // atualizar fila do painel de cidade, se aberto
    const panel = document.getElementById('city-panel');
    if (panel && panel.style.display !== 'none') {
      const idx = parseInt(panel.dataset.cityIndex);
      if (!isNaN(idx)) {
        const city = window.cities[idx];
        const queueElId = 'city-build-queue';
        let qEl = panel.querySelector('#' + queueElId);
        if (!qEl) {
          qEl = document.createElement('div');
          qEl.id = queueElId;
          qEl.style.marginTop = '8px';
          qEl.style.fontSize = '13px';
          panel.appendChild(qEl);
        }
        qEl.innerHTML = '';
        if (city.buildQueue && city.buildQueue.length) {
          const title = document.createElement('div');
          title.textContent = 'Fila de Construção:';
          title.style.fontWeight = '600';
          title.style.marginBottom = '6px';
          qEl.appendChild(title);
          city.buildQueue.forEach((b, i) => {
            const item = document.createElement('div');
            item.textContent = `${b.type} — ${b.remainingTurns} turn(s) restantes`;
            item.style.marginBottom = '4px';
            qEl.appendChild(item);
          });
        } else {
          qEl.textContent = 'Nenhuma construção em andamento.';
        }
      }
    }
  }

  window.updateUI = updateUI;
  updateUI();

  // Próximo turno: (mantive a lógica, mas main.js faz o processamento principal)
  const nextTurnBtn = document.getElementById('nextTurn');
  if (nextTurnBtn) {
    nextTurnBtn.addEventListener('click', () => {
      if (!window.cities) return;
      window.cities.forEach(city => {
        city.food = (city.food || 0) + ((city.population || 0) * 3) / 2.5;
        city.money = (city.money || 0) + Math.floor((city.population || 0) * 0.5);
        city.production = (city.production || 0) + Math.floor((city.population || 0) * 0.1);
      });
      updateUI();
      const panel = document.getElementById('city-panel');
      if (panel && panel.style.display !== 'none') {
        const idx = parseInt(panel.dataset.cityIndex);
        if (!isNaN(idx)) showCityInfo(window.cities[idx], idx);
      }
    });
  }

  // ---- Botão Reiniciar Jogo ----
  const resetBtn = document.getElementById('resetGame');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      const ok = confirm('Tem certeza que quer reiniciar o jogo? Isso apagará o progresso salvo e gerará um mapa novo.');
      if (!ok) return;
      try {
        // remover save existente
        localStorage.removeItem(LS_KEY);
      } catch (e) {
        console.warn('Erro ao limpar save:', e);
      }
      // recarregar a página para map.js criar um novo seed/mapa
      location.reload();
    });
  }

  // Painel da cidade
  const cityPanel = document.getElementById('city-panel');
  function showCityInfo(city, idx) {
    if (!cityPanel || !city) return;

    cityPanel.style.display = 'block';
    cityPanel.dataset.cityIndex = idx;

    const nameEl = cityPanel.querySelector('.city-name');
    const popEl = cityPanel.querySelector('.city-pop');
    const foodEl = cityPanel.querySelector('.city-food');
    const prodEl = cityPanel.querySelector('.city-prod');
    const moneyEl = cityPanel.querySelector('.city-money');

    if (nameEl) nameEl.textContent = city.name || 'Cidade';
    if (popEl) popEl.textContent = city.population || 0;
    if (foodEl) foodEl.textContent = Math.floor(city.food || 0);
    if (prodEl) prodEl.textContent = Math.floor(city.production || 0);
    if (moneyEl) moneyEl.textContent = Math.floor(city.money || 0);

    updateUI();
  }

  window.showCityInfo = showCityInfo;

  // fechar painel
  const closeBtn = document.getElementById('close-city-panel');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      if (cityPanel) cityPanel.style.display = 'none';
    });
  }

  // Construir fazenda: chama cityAction (main.js fará a integração com map.js)
  const buildFarmBtn = document.getElementById('build-farm');
  if (buildFarmBtn) {
    buildFarmBtn.addEventListener('click', () => {
      if (!cityPanel) return;
      const idx = parseInt(cityPanel.dataset.cityIndex);
      if (isNaN(idx)) return;
      if (window.cityAction && typeof window.cityAction.buildFarm === 'function') {
        window.cityAction.buildFarm(idx);
        if (window.showCityInfo) showCityInfo(window.cities[idx], idx);
        if (window.updateUI) window.updateUI();
      }
    });
  }

  // mapa de opções por terreno
  const BUILD_TABLE = {
    0: [ // grass
      { type: 'farm', name: 'Fazenda', cost: 200, turns: 1 },
      { type: 'factory', name: 'Fábrica', cost: 500, turns: 3 },
      { type: 'market', name: 'Comércio', cost: 300, turns: 2 }
    ],
    1: [ // forest
      { type: 'lumber', name: 'Serralheria', cost: 250, turns: 2 },
      { type: 'hunting', name: 'Campo de Caça', cost: 150, turns: 1 }
    ],
    2: [ // mountain
      { type: 'mine', name: 'Mina', cost: 400, turns: 3 }
    ],
    4: [ // river
      { type: 'mill', name: 'Moinho', cost: 180, turns: 1 },
      { type: 'farm', name: 'Fazenda', cost: 200, turns: 1 }
    ],
    5: [ // sand / desert
      { type: 'well', name: 'Poço', cost: 120, turns: 1 },
      { type: 'house', name: 'Casa', cost: 100, turns: 1 }
    ],
    3: [ // ocean - poucas opções (ou nenhuma)
      { type: 'house', name: 'Casa', cost: 100, turns: 1 }
    ]
  };

  // cria modal (DOM) uma vez
  let buildModal = null;
  function createBuildModal() {
    if (buildModal) return;
    buildModal = document.createElement('div');
    buildModal.id = 'build-modal';
    buildModal.style.position = 'fixed';
    buildModal.style.left = '0';
    buildModal.style.top = '0';
    buildModal.style.width = '100%';
    buildModal.style.height = '100%';
    buildModal.style.display = 'none';
    buildModal.style.alignItems = 'center';
    buildModal.style.justifyContent = 'center';
    buildModal.style.padding = '20px';
    buildModal.style.zIndex = 9999;
    buildModal.innerHTML = `
      <div style="position:absolute;left:0;top:0;width:100%;height:100%;background:rgba(0,0,0,0.45)"></div>
      <div id="build-modal-card" style="position:relative;min-width:320px;background:#121212;color:#fff;padding:16px;border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,0.6);">
        <div id="build-modal-title" style="font-weight:700;margin-bottom:8px">Construir</div>
        <div id="build-modal-body" style="display:flex;flex-direction:column;gap:8px;max-height:400px;overflow:auto;padding:20px"></div>
        <div style="display:flex;justify-content:flex-end;margin-top:12px;">
          <button id="build-modal-cancel" style="background:#ccc;border:none;padding:8px 12px;border-radius:6px;cursor:pointer;color:#111">Cancelar</button>
        </div>
      </div>
    `;
    document.body.appendChild(buildModal);

    buildModal.querySelector('#build-modal-cancel').addEventListener('click', () => {
      hideBuildModal();
    });
  }

  function showBuildModal(cityIndex, x, y) {
    createBuildModal();
    const terrain = (typeof window.getTerrain === 'function') ? window.getTerrain(x, y) : null;
    const options = BUILD_TABLE[terrain] || BUILD_TABLE[0];
    buildModal.style.display = 'flex';
    const title = buildModal.querySelector('#build-modal-title');
    title.textContent = `Construir em (${x}, ${y}) — Terreno: ${terrainLabel(terrain)}`;

    const body = buildModal.querySelector('#build-modal-body');
    body.innerHTML = '';

    options.forEach(opt => {
      const btn = document.createElement('button');
      btn.style.display = 'flex';
      btn.style.justifyContent = 'space-between';
      btn.style.alignItems = 'center';
      btn.style.padding = '8px';
      btn.style.borderRadius = '8px';
      btn.style.border = '1px solid rgba(255,255,255,0.06)';
      btn.style.background = '#1e1e1e';
      btn.style.color = '#fff';
      btn.style.cursor = 'pointer';
      btn.innerHTML = `<div style="font-weight:600">${opt.name}</div><div style="opacity:0.9">C:${opt.cost} • ${opt.turns}T</div>`;

      btn.addEventListener('click', () => {
        const res = window.cityAction && window.cityAction.queueBuilding
          ? window.cityAction.queueBuilding(cityIndex, x, y, opt.type, opt.cost, opt.turns)
          : { ok: false, reason: 'queueBuilding não disponível' };
        if (!res.ok) {
          alert(res.reason || 'Não foi possível enfileirar construção.');
        } else {
          hideBuildModal();
          if (window.updateUI) window.updateUI();
        }
      });

      body.appendChild(btn);
    });

    // se não houver opções, mostra mensagem
    if (!options.length) {
      body.textContent = 'Nenhuma construção disponível neste terreno.';
    }
  }

  function hideBuildModal() {
    if (!buildModal) return;
    buildModal.style.display = 'none';
  }

  function terrainLabel(code) {
    switch (code) {
      case 0: return 'Grama';
      case 1: return 'Floresta';
      case 2: return 'Montanha';
      case 3: return 'Oceano';
      case 4: return 'Rio';
      case 5: return 'Areia';
      default: return 'Desconhecido';
    }
  }

  // hook que o map.js chama ao clicar num tile do território
  window.onTerritoryTileClick = function(cityIndex, x, y) {
    // abrir modal para o jogador escolher construção
    showBuildModal(cityIndex, x, y);
  };

  // conectar clique nas cidades (se já existirem)
  if (window.cities && window.cities.length) {
    window.cities.forEach((city, idx) => {
      city.click = () => showCityInfo(city, idx);
    });
  }
});
