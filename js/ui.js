window.addEventListener('DOMContentLoaded', () => {

    const foodDisplay = document.getElementById('food');
    const productionDisplay = document.getElementById('production');
    const populationDisplay = document.getElementById('population');
    const moneyDisplay = document.getElementById('money');

    function updateUI() {
        const totalFood = window.cities.reduce((sum, city) => sum + city.food, 0);
        const totalProduction = window.cities.reduce((sum, city) => sum + city.production, 0);
        const totalPopulation = window.cities.reduce((sum, city) => sum + city.population, 0);
        const totalMoney = window.cities.reduce((sum, city) => sum + city.money, 0);

        foodDisplay.textContent = totalFood;
        productionDisplay.textContent = totalProduction;
        populationDisplay.textContent = totalPopulation;
        moneyDisplay.textContent = totalMoney;

    }
    updateUI();

    const nextTurnBtn = document.getElementById('nextTurn');
    nextTurnBtn.addEventListener('click', () => {
        cities.forEach(city => {
            city.food += (city['population'] * 3) / 2.5;
            console.log(city);
        });
        updateUI();
    });
})