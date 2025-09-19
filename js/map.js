window.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');

    // Configurações do mapa
    const mapWidth = 10;
    const mapHeight = 10;
    let map = [];
    let cellSize;

    // Configuração da cidade
    window.cities =  [{x: Math.floor(mapWidth / 2), y: Math.floor(mapHeight / 2), food: 10, production: 0, population: 30, name: 'capital'}];

    // Gerar mapa aleatório
    for (let y = 0; y < mapHeight; y++) {
        let row = [];
        for (let x = 0; x < mapWidth; x++) {
            row.push(Math.floor(Math.random() * 4));
        }
        map.push(row);
    }

    // Função para desenhar o mapa
    function drawMap() {
        // Calcula o tamanho da célula baseado na menor dimensão
        cellSize = Math.min(canvas.width / mapWidth, canvas.height / mapHeight);

        // Limpar tela antes de desenhar
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        for (let y = 0; y < map.length; y++) {
            for (let x = 0; x < map[y].length; x++) {
                let terrain = map[y][x];
                switch (terrain) {
                    case 0: ctx.fillStyle = 'green'; break;      // grama
                    case 1: ctx.fillStyle = 'darkgreen'; break;  // floresta
                    case 2: ctx.fillStyle = 'gray'; break;       // montanha
                    case 3: ctx.fillStyle = 'blue'; break;       // água
                }
                ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
            }
        }

        ctx.fillStyle = 'red';
        window.cities.forEach(city => {
            ctx.fillRect(city.x * cellSize, city.y * cellSize, cellSize, cellSize);
        })

    }

    // Ajustar canvas a tela
    function resizeCanvas() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        drawMap();
    }

    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();
});
