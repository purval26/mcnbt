// Elements
const fileUpload = document.getElementById('file-upload');
const fileStatus = document.getElementById('file-status');
const mainContent = document.getElementById('main-content');
const tabBtns = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

// Stats Elements
const statHealth = document.getElementById('stat-health');
const statFood = document.getElementById('stat-food');
const statXp = document.getElementById('stat-xp');
const statPos = document.getElementById('stat-pos');
const statDimension = document.getElementById('stat-dimension');
const statGamemode = document.getElementById('stat-gamemode');

// Inventory Elements
const armorSlotsContainer = document.getElementById('armor-slots');
const offhandSlotContainer = document.getElementById('offhand-slot');
const mainInventorySlots = document.getElementById('main-inventory-slots');
const hotbarSlotsContainer = document.getElementById('hotbar-slots');
const enderchestSlotsContainer = document.getElementById('enderchest-slots');
const rawNbtOutput = document.getElementById('raw-nbt-output');

// Tooltip Element
const tooltip = document.getElementById('item-tooltip');
const ttName = document.getElementById('tt-name');
const ttBody = document.getElementById('tt-body');

// Global parsed data
let playerData = null;

// Tab Switching
tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        tabBtns.forEach(b => b.classList.remove('active'));
        tabContents.forEach(c => c.classList.remove('active'));
        
        btn.classList.add('active');
        document.getElementById(btn.dataset.tab).classList.add('active');
    });
});

// File Upload Handling
fileUpload.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    fileStatus.textContent = `Reading ${file.name}...`;

    const reader = new FileReader();
    reader.onload = function(event) {
        const arrayBuffer = event.target.result;
        
        let targetBuffer = arrayBuffer;
        
        // Playerdata is typically GZIP compressed
        try {
            // pako.ungzip handles gzip decompression natively
            const decompressed = pako.ungzip(new Uint8Array(arrayBuffer));
            targetBuffer = decompressed.buffer.slice(
                decompressed.byteOffset, 
                decompressed.byteOffset + decompressed.byteLength
            );
        } catch (err) {
            console.warn("File was not functionally gzipped, attempting raw NBT parse...", err);
        }
        
        parseNBT(targetBuffer);
    };
    reader.readAsArrayBuffer(file);
});

function parseNBT(dataBuffer) {
    nbt.parse(dataBuffer, function(error, data) {
        if (error) {
            fileStatus.textContent = "Error reading NBT data. " + error;
            console.error("NBT parse callback error:", error);
            return;
        }
        
        try {
            // Root tag is usually '' with the compound inside data.value
            playerData = data.value;
            fileStatus.textContent = "Data loaded successfully!";
            
            renderData();
            mainContent.classList.remove('hidden');
        } catch (renderError) {
            fileStatus.textContent = "Error rendering UI: " + renderError.message;
            console.error("Render error:", renderError);
        }
    });
}

// Basic function to get NBT value safely
function getNBTValue(tag) {
    if (!tag) return null;
    return tag.value;
}

// Function to safely extract arrays out of NBT list tags
function getNBTList(tag) {
    if (!tag || !tag.value || !Array.isArray(tag.value.value)) return [];
    return tag.value.value;
}

function renderData() {
    // 1. Stats
    const health = getNBTValue(playerData.Health) || 0;
    statHealth.textContent = parseFloat(health).toFixed(1);

    const foodLevel = getNBTValue(playerData.foodLevel) || 0;
    statFood.textContent = foodLevel;

    const xpLevel = getNBTValue(playerData.XpLevel) || 0;
    statXp.textContent = xpLevel;

    const posTag = getNBTValue(playerData.Pos);
    const posList = posTag && Array.isArray(posTag.value) ? posTag.value : [];
    if (posList.length >= 3) {
        statPos.textContent = `${posList[0].toFixed(1)}, ${posList[1].toFixed(1)}, ${posList[2].toFixed(1)}`;
    } else {
        statPos.textContent = "Unknown";
    }

    const dimension = getNBTValue(playerData.Dimension);
    statDimension.textContent = dimension || "Unknown";

    const gamemode = getNBTValue(playerData.playerGameType);
    const gamemodeNames = ["Survival", "Creative", "Adventure", "Spectator"];
    statGamemode.textContent = (gamemode !== null && gamemodeNames[gamemode]) ? gamemodeNames[gamemode] : gamemode;

    // 2. Raw Output
    rawNbtOutput.textContent = JSON.stringify(playerData, (key, value) => {
        // Handle Int32Array and similar from NBT.js properly for display
        if (value && value.buffer instanceof ArrayBuffer && value.byteLength !== undefined) {
            return `[Buffer ${value.byteLength} bytes]`;
        }
        return value;
    }, 2);

    // 3. Render Inventory
    renderInventoryGroups();
}

/**
 * Empty out UI containers and distribute items based on Slot numbers.
 */
function renderInventoryGroups() {
    // Clear slots
    armorSlotsContainer.innerHTML = '';
    offhandSlotContainer.innerHTML = '';
    mainInventorySlots.innerHTML = '';
    hotbarSlotsContainer.innerHTML = '';
    enderchestSlotsContainer.innerHTML = '';

    // Create Base Empty Slots
    const armorSlots = {};
    for (let i = 103; i >= 100; i--) armorSlots[i] = createSlotEl();
    
    // Add empty backgrounds
    armorSlots[103].classList.add('empty-helmet');
    armorSlots[102].classList.add('empty-chestplate');
    armorSlots[101].classList.add('empty-leggings');
    armorSlots[100].classList.add('empty-boots');

    armorSlotsContainer.appendChild(armorSlots[103]);
    armorSlotsContainer.appendChild(armorSlots[102]);
    armorSlotsContainer.appendChild(armorSlots[101]);
    armorSlotsContainer.appendChild(armorSlots[100]);

    const offhandSlot = createSlotEl();
    offhandSlotContainer.appendChild(offhandSlot);

    const mainSlots = {};
    for (let i = 9; i < 36; i++) {
        mainSlots[i] = createSlotEl();
        mainInventorySlots.appendChild(mainSlots[i]);
    }

    const hotbarSlots = {};
    for (let i = 0; i < 9; i++) {
        hotbarSlots[i] = createSlotEl();
        hotbarSlotsContainer.appendChild(hotbarSlots[i]);
    }

    const enderSlots = {};
    for (let i = 0; i < 27; i++) {
        enderSlots[i] = createSlotEl();
        enderchestSlotsContainer.appendChild(enderSlots[i]);
    }

    // Populate Inventory (Inventory NBT tag)
    const inventoryList = getNBTList(playerData.Inventory);
    inventoryList.forEach(itemTag => {
        const slot = getNBTValue(itemTag.Slot);
        if (slot === null) return;
        
        const itemEl = createItemEl(itemTag);
        
        // Armor (100 - 103)
        if (slot >= 100 && slot <= 103) {
            armorSlots[slot].appendChild(itemEl);
        }
        // Offhand (-106)
        else if (slot === -106) {
            offhandSlot.appendChild(itemEl);
        }
        // Main Inventory (9 - 35)
        else if (slot >= 9 && slot <= 35) {
            mainSlots[slot].appendChild(itemEl);
        }
        // Hotbar (0 - 8)
        else if (slot >= 0 && slot <= 8) {
            hotbarSlots[slot].appendChild(itemEl);
        }
    });

    // Populate EnderChest (EnderItems NBT tag)
    const enderItemList = getNBTList(playerData.EnderItems);
    enderItemList.forEach(itemTag => {
        const slot = getNBTValue(itemTag.Slot);
        if (slot >= 0 && slot < 27) {
            const itemEl = createItemEl(itemTag);
            enderSlots[slot].appendChild(itemEl);
        }
    });

    // Populate Custom Equipment (Often used by Paper/Spigot in place of Inventory armor slots)
    const eq = getNBTValue(playerData.equipment);
    if (eq) {
        const head = getNBTValue(eq.head);
        if (head) armorSlots[103].appendChild(createItemEl(head));
        
        const chest = getNBTValue(eq.chest);
        if (chest) armorSlots[102].appendChild(createItemEl(chest));
        
        const legs = getNBTValue(eq.legs);
        if (legs) armorSlots[101].appendChild(createItemEl(legs));
        
        const feet = getNBTValue(eq.feet);
        if (feet) armorSlots[100].appendChild(createItemEl(feet));
    }
}

function createSlotEl() {
    const el = document.createElement('div');
    el.className = 'mc-slot';
    return el;
}

function createItemEl(itemTag) {
    const el = document.createElement('div');
    el.className = 'mc-item';

    const idRaw = getNBTValue(itemTag.id) || ''; // e.g. "minecraft:diamond_sword"
    let idClean = idRaw.replace('minecraft:', '');
    
    // Check primary user-specified items folder, fallback to base icons folder for ones fetched dynamically
    let imgUrl = `icons/item/${idClean}.png`;
    let fallbackImgUrl = `icons/${idClean}.png`;
    
    // Check both classic 'Count' and 1.20.5+ 'count'
    const count = getNBTValue(itemTag.Count) || getNBTValue(itemTag.count) || 1;
    
    // Set visually
    el.style.backgroundImage = `url("${imgUrl}")`;
    el.style.setProperty('--item-bg', `url("${imgUrl}")`); // Important for Glint masking
    
    // Re-verify the img actually exists locally, if not, use fallback layer
    const tmpImg = new Image();
    tmpImg.onerror = function() {
        el.style.backgroundImage = `url("${fallbackImgUrl}")`;
        el.style.setProperty('--item-bg', `url("${fallbackImgUrl}")`);
        
        // Final missing texture checkerboard fallback check
        const blockImg = new Image();
        blockImg.onerror = function() {
            const missingData = `data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAKklEQVR42mL5//8/AyWAiYFCwFCMKjhqMPEwMG4A5mGjhoEMGA0QoAAA0cQh3+0T6GAAAAAASUVORK5CYII=`;
            el.style.backgroundImage = `url("${missingData}")`;
            el.style.setProperty('--item-bg', `url("${missingData}")`);
        };
        blockImg.src = fallbackImgUrl;
    };
    tmpImg.src = imgUrl;
    
    // Look for enchantments
    const tagData = getNBTValue(itemTag.tag); // Pre-1.20.5 format
    const components = getNBTValue(itemTag.components); // 1.20.5+ format
    
    let hasEnchants = false;
    if (components && components["minecraft:enchantments"]) {
        const ench = getNBTValue(components["minecraft:enchantments"]);
        // Make sure it actually has enchantments (not just an empty compound)
        if (ench && Object.keys(ench).length > 0) hasEnchants = true;
    } else if (tagData && (tagData.Enchantments || tagData.ench)) {
        if (getNBTList(tagData.Enchantments || tagData.ench).length > 0) hasEnchants = true;
    }
    
    if (hasEnchants) {
        el.classList.add('is-enchanted');
    }

    if (count > 1) {
        const countEl = document.createElement('div');
        countEl.className = 'mc-item-count';
        countEl.textContent = count;
        el.appendChild(countEl);
    }

    // Setup Tooltip event listeners
    el.addEventListener('mouseenter', (e) => showTooltip(e, itemTag, idClean));
    el.addEventListener('mousemove', (e) => moveTooltip(e));
    el.addEventListener('mouseleave', () => hideTooltip());

    return el;
}

function showTooltip(e, itemTag, fallbackName) {
    tooltip.classList.remove('hidden');
    
    const tagData = getNBTValue(itemTag.tag); // Pre-1.20.5 format
    const components = getNBTValue(itemTag.components); // 1.20.5+ format
    
    let displayName = formatName(fallbackName);
    let colorClass = 'color-gray';
    
    // Check custom name / display
    if (tagData && tagData.display) {
        const displayTag = getNBTValue(tagData.display);
        if (displayTag && displayTag.Name) {
            const rawName = getNBTValue(displayTag.Name);
            try {
                const nameObj = JSON.parse(rawName);
                if (nameObj.text) displayName = nameObj.text;
                if (nameObj.italic) displayName = `<i>${displayName}</i>`;
                if (nameObj.color) colorClass = `color-${nameObj.color}`; // Approximation
            } catch {
                displayName = rawName;
            }
        }
    } else if (components && components["minecraft:custom_name"]) {
        const rawName = getNBTValue(components["minecraft:custom_name"]);
        try {
            const nameObj = JSON.parse(rawName);
            if (nameObj.text) displayName = nameObj.text;
            if (nameObj.italic) displayName = `<i>${displayName}</i>`;
            if (nameObj.color) colorClass = `color-${nameObj.color}`;
        } catch {
            displayName = rawName;
        }
    }

    ttName.innerHTML = `<span class="${colorClass}">${displayName}</span>`;
    
    // Build tooltip body (Enchants, Lore, Damage)
    ttBody.innerHTML = '';
    
    let html = '';
    
    // Lore
    let loreList = [];
    if (tagData && tagData.display) {
        const displayTag = getNBTValue(tagData.display);
        if (displayTag && displayTag.Lore) loreList = getNBTList(displayTag.Lore);
    } else if (components && components["minecraft:lore"]) {
        loreList = getNBTList(components["minecraft:lore"]);
    }
    
    loreList.forEach(l => {
        let loreText = l;
        try {
            const lObj = JSON.parse(l);
            if (lObj.text) loreText = lObj.text;
        } catch {}
        html += `<div class="color-light-purple"><i>${loreText}</i></div>`;
    });

    // Enchantments
    if (components && components["minecraft:enchantments"]) {
        const enchCompound = getNBTValue(components["minecraft:enchantments"]);
        if (enchCompound) {
            Object.keys(enchCompound).forEach(key => {
                if (key === 'levels') {
                    const levelsObj = getNBTValue(enchCompound.levels);
                    Object.keys(levelsObj || {}).forEach(subId => {
                         let lvl = getNBTValue(levelsObj[subId]);
                         html += `<div class="color-gray">${formatName(subId.replace('minecraft:', ''))} ${toRoman(lvl)}</div>`;
                    });
                } else if (enchCompound[key] && enchCompound[key].type === 'int') {
                    let lvl = getNBTValue(enchCompound[key]);
                    html += `<div class="color-gray">${formatName(key.replace('minecraft:', ''))} ${toRoman(lvl)}</div>`;
                }
            });
        }
    } else {
        // Old Enchantments (Check 1.14+ "Enchantments" or 1.8 "ench")
        const enchantsTag = tagData ? (tagData.Enchantments || tagData.ench) : null;
        if (enchantsTag) {
            const enchants = getNBTList(enchantsTag);
            enchants.forEach(ench => {
                const idVal = getNBTValue(ench.id);
                if (idVal !== null) {
                    const idClean = typeof idVal === 'string' ? idVal.replace('minecraft:', '') : idVal.toString();
                    const lvl = getNBTValue(ench.lvl) || 1;
                    const romanLvl = toRoman(lvl);
                    html += `<div class="color-gray">${formatName(idClean)} ${romanLvl}</div>`;
                }
            });
        }
    }
    
    // Damage
    let damage = null;
    if (tagData && tagData.Damage) damage = getNBTValue(tagData.Damage);
    if (components && components["minecraft:damage"]) damage = getNBTValue(components["minecraft:damage"]);

    if (damage !== null && damage > 0) {
        html += `<div style="color: #FF5555; margin-top: 4px; font-size: 0.9em;">Damage: ${damage}</div>`;
    }
    
    // Bundle Contents
    const isBundle = fallbackName === 'bundle' || fallbackName.includes('bundle');
    let bundleList = null;
    if (components && components["minecraft:bundle_contents"]) {
        bundleList = getNBTList(components["minecraft:bundle_contents"]);
    } else if (tagData && tagData.Items && isBundle) {
        bundleList = getNBTList(tagData.Items);
    }

    if (bundleList && bundleList.length > 0) {
        html += '<div class="bundle-tooltip-grid">';
        bundleList.forEach(bItem => {
            const bIdRaw = getNBTValue(bItem.id);
            if (!bIdRaw) return;
            const bIdClean = bIdRaw.replace('minecraft:', '');
            const bCount = getNBTValue(bItem.count) || getNBTValue(bItem.Count) || 1;
            html += `
                <div class="bundle-tt-item">
                    <img class="bundle-img" src="icons/item/${bIdClean}.png" 
                         onerror="this.src='icons/${bIdClean}.png'; this.onerror=function(){this.src='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAKklEQVR42mL5//8/AyWAiYFCwFCMKjhqMPEwMG4A5mGjhoEMGA0QoAAA0cQh3+0T6GAAAAAASUVORK5CYII='};">
                    ${bCount > 1 ? `<span class="bundle-tt-count">${bCount}</span>` : ''}
                </div>
            `;
        });
        html += '</div>';
    }
    
    ttBody.innerHTML = html;

    moveTooltip(e);
}

function moveTooltip(e) {
    // Offset slightly from cursor
    let x = e.pageX + 15;
    let y = e.pageY + 15;
    
    // Ensure tooltip doesn't offscreen
    if (x + tooltip.offsetWidth > window.innerWidth) {
        x -= tooltip.offsetWidth + 30;
    }
    if (y + tooltip.offsetHeight > window.innerHeight) {
        y -= tooltip.offsetHeight + 30;
    }

    tooltip.style.left = x + 'px';
    tooltip.style.top = y + 'px';
}

function hideTooltip() {
    tooltip.classList.add('hidden');
}

// Helpers
function formatName(str) {
    return str.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function toRoman(num) {
    if (num === 1) return 'I';
    if (num === 2) return 'II';
    if (num === 3) return 'III';
    if (num === 4) return 'IV';
    if (num === 5) return 'V';
    if (num === 6) return 'VI';
    if (num === 7) return 'VII';
    if (num === 8) return 'VIII';
    if (num === 9) return 'IX';
    if (num === 10) return 'X';
    return num.toString();
}
