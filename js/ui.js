window.addEventListener('DOMContentLoaded', () => {

    let production = window.cities
    const foodDisplay = document.getElementById('food');
    const productionDisplay = document.getElementById('production');
    function updateUI() {
        const totalFood = window.cities.reduce((sum, city) => sum + city.food, 0);
        const totalProduction = window.cities.reduce((sum, city) => sum + city.production, 0)
        foodDisplay.textContent = totalFood;
        productionDisplay.textContent = totalProduction;
    }
    updateUI();

    const nextTurnBtn = document.getElementById('nextTurn');
    nextTurnBtn.addEventListener('click', () => {
        cities.forEach(city => {
            city.food += (city['population'] * 3) / 2.5;
            console.log('Cidade: ' + city['name'], '-- População: ' + city['population'], '-- Produção: ' + city['production'], '-- Comida: ' + city['food']);
        });
        updateUI();
    });
})