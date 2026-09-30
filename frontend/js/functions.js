/**
 * Builds the "energy gained" display element (signed number + bolt icon) used for a single
 * player's result row in both the last-game summary and the game history list.
 * @param {number} energyGained The net energy change to display.
 * @returns {HTMLDivElement} The element ready to be appended to a player row.
 */
function createEnergyGainedElement(energyGained) {
    const energyGainedElement = document.createElement("div");
    energyGainedElement.textContent = (energyGained > -1 ? "+" : "") + energyGained;

    const zapIcon = document.createElement("i");
    zapIcon.className = "fa-solid fa-bolt";
    zapIcon.style.color = "rgb(255, 212, 59)";
    energyGainedElement.append(zapIcon);

    return energyGainedElement;
}

export {createEnergyGainedElement};
