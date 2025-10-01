// js/ui.js
window.addEventListener('DOMContentLoaded', () => {
  const LS_KEY = 'cities_game_v1';

  const foodDisplay = document.getElementById('food');
  const productionDisplay = document.getElementById('production');
  const populationDisplay = document.getElementById('population');
  const moneyDisplay = document.getElementById('money');

  if (typeof window.gameTurn === 'undefined') {
    window.gameTurn = 1;
  }

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

  // Próximo turno (lógica principal estava mais acima; aqui só um listener adicional para atualização visual)
  const nextTurnBtn = document.getElementById('nextTurn');
  if (nextTurnBtn) {
    nextTurnBtn.addEventListener('click', () => {
      if (!window.cities) return;
      window.cities.forEach(city => {
        city.food = (city.food || 0) + ((city.population || 0) * 3) / 2.5;
        city.money = (city.money || 0) + Math.floor((city.population || 0) * 0.5);
        city.production = (city.production || 0) + Math.floor((city.population || 0) * 0.1);
      });
      window.gameTurn++;
      updateUI();
      const panel = document.getElementById('city-panel');
      if (panel && panel.style.display !== 'none') {
        const idx = parseInt(panel.dataset.cityIndex);
        if (!isNaN(idx)) showCityInfo(window.cities[idx], idx);
      }
    });
  }

  // ---- Botão Reiniciar (compatível com 'resetGame' antigo ou 'resetGameMenu' novo) ----
  const resetBtnOld = document.getElementById('resetGame');
  const resetBtnMenu = document.getElementById('resetGameMenu');
  const doReset = () => {
    const ok = confirm('Tem certeza que quer reiniciar o jogo? Isso apagará o progresso salvo e gerará um mapa novo.');
    if (!ok) return;
    try {
      localStorage.removeItem(LS_KEY);
    } catch (e) {
      console.warn('Erro ao limpar save:', e);
    }
    location.reload();
  };
  if (resetBtnOld) resetBtnOld.addEventListener('click', doReset);
  if (resetBtnMenu) resetBtnMenu.addEventListener('click', doReset);

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

  // Build table e modal (mantive sua lógica)
  const BUILD_TABLE = {
    0: [
      { type: 'farm', name: 'Fazenda', cost: 200, turns: 1 },
      { type: 'factory', name: 'Fábrica', cost: 500, turns: 3 },
      { type: 'market', name: 'Comércio', cost: 300, turns: 2 },
      { type: 'house', name: 'Casa', cost: 100, turns: 1 }
    ],
    1: [
      { type: 'lumber', name: 'Serralheria', cost: 250, turns: 2 },
      { type: 'hunting', name: 'Campo de Caça', cost: 150, turns: 1 }
    ],
    2: [{ type: 'mine', name: 'Mina', cost: 400, turns: 3 }],
    4: [
      { type: 'mill', name: 'Moinho', cost: 180, turns: 1 },
      { type: 'fishing', name: 'Pescaria', cost: 200, turns: 2}
    ],
    5: [
      { type: 'well', name: 'Poço', cost: 120, turns: 1 },
      { type: 'house', name: 'Casa', cost: 100, turns: 1 }
    ],
    3: [
      { type: 'fishing', name: 'Pescaria (Mar)', cost: 250, turns: 3}
    ]
  };

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

    // prevenir propagação do clique para fechar overlays por engano
    buildModal.querySelector('#build-modal-card').addEventListener('click', (e) => e.stopPropagation());
    buildModal.addEventListener('click', () => hideBuildModal());
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
      btn.innerHTML = `<div style="font-weight:600">${opt.name}</div><div style="opacity:0.9">${opt.cost}💵 • ${opt.turns}⏳</div>`;

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

  window.onTerritoryTileClick = function (cityIndex, x, y) {
    showBuildModal(cityIndex, x, y);
  };

  if (window.cities && window.cities.length) {
    window.cities.forEach((city, idx) => {
      city.click = () => showCityInfo(city, idx);
    });
  }

  function refreshTopUI() {
    const popEl = document.getElementById('top-pop');
    const foodEl = document.getElementById('top-food');
    const prodEl = document.getElementById('top-production');
    const moneyEl = document.getElementById('top-money');
    const turnEl = document.getElementById('turn-number');

    let totalPop = 0, totalFood = 0, totalProd = 0, totalMoney = 0, turn = window.turn || window.gameTurn || 1;

    if (window.cities && Array.isArray(window.cities)) {
      for (let c of window.cities) {
        totalPop += Number(c.population || c.pop || 0);
        totalFood += Number(c.food || 0);
        totalProd += Number(c.production || c.prod || c.prodution || 0);
        totalMoney += Number(c.money || 0);
      }
    }

    if (popEl) popEl.textContent = Math.floor(totalPop);
    if (foodEl) foodEl.textContent = Math.floor(totalFood);
    if (prodEl) prodEl.textContent = Math.floor(totalProd);
    if (moneyEl) moneyEl.textContent = Math.floor(totalMoney);

    if (turnEl) {
      if (typeof window.gameTurn !== 'undefined') turn = window.gameTurn;
      else if (typeof window.turn !== 'undefined') turn = window.turn;
      turnEl.textContent = turn;
    }
  }

  function wrapUpdateUI() {
    if (typeof window.updateUI === 'function') {
      const orig = window.updateUI;
      window.updateUI = function () {
        try { orig(); } catch (e) { console.warn('updateUI wrapper orig failed', e); }
        try { refreshTopUI(); } catch (e) { console.warn('refreshTopUI failed', e); }
      };
      refreshTopUI();
    } else {
      setTimeout(wrapUpdateUI, 120);
    }
  }
  wrapUpdateUI();

  // Substitui calls diretas sem guarda que causavam erro quando elemento era null
  const nextBtnForRefresh = document.getElementById('nextTurn');
  if (nextBtnForRefresh) nextBtnForRefresh.addEventListener('click', () => { setTimeout(refreshTopUI, 140); });

  const resetForRefresh = document.getElementById('resetGame') || document.getElementById('resetGameMenu');
  if (resetForRefresh) resetForRefresh.addEventListener('click', () => { setTimeout(refreshTopUI, 120); });

  const closeCityPanelEl = document.getElementById('close-city-panel');
  if (closeCityPanelEl) closeCityPanelEl.addEventListener('click', () => {
    const panel = document.getElementById('city-panel');
    if (panel) panel.style.display = 'none';
  });

  (function hookCanvasClickToCityPanel() {
    const cvs = document.getElementById('canvas');
    if (!cvs) return;
    cvs.addEventListener('dblclick', (e) => {
      setTimeout(() => {
        const panel = document.getElementById('city-panel');
        if (panel && panel.dataset && panel.dataset.cityIndex !== undefined) {
          panel.style.display = 'block';
        }
      }, 120);
    });
  })();

  // --- Menu de configurações: prevenir double-bind e prevenir fechamento ao clicar dentro ---
  const settingsBtn = document.getElementById('settingsBtn');
  const settingsMenu = document.getElementById('settings-menu');

  if (settingsBtn && settingsMenu) {
    if (!settingsBtn.dataset.settingsBound) {
      settingsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        settingsMenu.style.display = settingsMenu.style.display === 'flex' ? 'none' : 'flex';
      });
      settingsBtn.dataset.settingsBound = '1';
    }

    if (!settingsMenu.dataset.menuBound) {
      settingsMenu.addEventListener('click', (e) => {
        e.stopPropagation();
      });
      settingsMenu.dataset.menuBound = '1';
    }

    if (!window._settingsWindowBound) {
      window.addEventListener('click', () => {
        settingsMenu.style.display = 'none';
      });
      window._settingsWindowBound = true;
    }
  }

});
