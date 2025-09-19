// Estrutura para armazenar fila de construções por tile
let buildQueue = {};

function queueBuilding(tile, buildingType) {
    if (!tile) {
        alert("Nenhum tile selecionado!");
        return;
    }

    // Se o tile já tem algo em construção
    if (buildQueue[tile.id]) {
        alert("Esse tile já está construindo algo!");
        return;
    }

    // Definir tempo de construção (exemplo)
    let turnsRequired = 3;
    buildQueue[tile.id] = {
        type: buildingType,
        turnsLeft: turnsRequired
    };

    alert(`${buildingType} em construção! (${turnsRequired} turnos restantes)`);
}

// Chamado a cada turno
function processTurn() {
    for (let tileId in buildQueue) {
        let construction = buildQueue[tileId];
        construction.turnsLeft--;

        if (construction.turnsLeft <= 0) {
            // Construção concluída
            finishBuilding(tileId, construction.type);
            delete buildQueue[tileId];
        }
    }

    // Outras lógicas de turno (produção, movimento, etc)
}

function finishBuilding(tileId, buildingType) {
    let tile = getTileById(tileId); // Função que retorna o objeto tile
    tile.building = buildingType;
    alert(`${buildingType} concluído no tile ${tileId}!`);
}