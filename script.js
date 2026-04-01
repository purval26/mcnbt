document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    if (!urlParams.has('extension')) {
        const promo = document.getElementById('extension-promo');
        const uploadPanel = document.getElementById('upload-panel');
        if (promo) promo.style.display = 'block';
    }
});

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
const statSpawn = document.getElementById('stat-spawn');
const statSpawnDim = document.getElementById('stat-spawndim');
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

    window.lastUploadedFilename = file.name;
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

// Extension Payload Injector Hook
window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'LOAD_NBT_BUFFER') {
        const arrayBuffer = event.data.buffer;
        if (event.data.filename) window.lastUploadedFilename = event.data.filename;
        
        fileStatus.textContent = `Reading transferred playerdata...`;
        
        let targetBuffer = arrayBuffer;
        try {
            const decompressed = pako.ungzip(new Uint8Array(arrayBuffer));
            targetBuffer = decompressed.buffer.slice(
                decompressed.byteOffset, 
                decompressed.byteOffset + decompressed.byteLength
            );
        } catch (err) {
            console.warn("File was not functionally gzipped, attempting raw NBT parse...", err);
        }
        
        parseNBT(targetBuffer);
        
        // Hide upload container since we are running natively via extension
        const uC = document.querySelector('.upload-container');
        if(uC) uC.style.display = 'none';
        fileStatus.style.display = 'none';
    }
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
            
            // Generate raw mapping manually 
            const rawOut = document.getElementById('raw-nbt-output');
            if (rawOut) rawOut.textContent = JSON.stringify(data.value, (key, val) => {
                // If a value is a massive byte array buffer, truncate it so stringify doesn't crash the browser natively
                if (val && val.type && (val.type === 'byteArray' || val.type === 'intArray' || val.type === 'longArray')) {
                    return `[${val.type} Data Truncated]`;
                }
                return val;
            }, 2);
            
            // Generate visual interactive tree
            if (typeof renderNbtTree === 'function') renderNbtTree(data);

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

// Function to reliably determine if an item should glint based on deep NBT properties
function isItemEnchanted(components, tagData, idClean) {
    let hasEnchants = false;
    const intrinsicGlints = ['enchanted_golden_apple', 'enchanted_book', 'experience_bottle', 'nether_star', 'written_book', 'heart_of_the_sea', 'end_crystal'];
    if (intrinsicGlints.includes(idClean)) hasEnchants = true;

    if (components && components["minecraft:enchantment_glint_override"]) {
        const override = getNBTValue(components["minecraft:enchantment_glint_override"]);
        if (override !== 0 && override !== false) hasEnchants = true;
    }

    if (components && components["minecraft:enchantments"]) {
        let ev = getNBTValue(components["minecraft:enchantments"]);
        if (ev && ev.levels) ev = getNBTValue(ev.levels); 
        if (ev && Object.keys(ev).length > 0) hasEnchants = true;
    }
    if (components && components["minecraft:stored_enchantments"]) {
        let ev = getNBTValue(components["minecraft:stored_enchantments"]);
        if (ev && ev.levels) ev = getNBTValue(ev.levels);
        if (ev && Object.keys(ev).length > 0) hasEnchants = true;
    }

    if (tagData) {
        const eTags = tagData.Enchantments || tagData.ench || tagData.StoredEnchantments || tagData.enchantments;
        if (eTags && getNBTList(eTags).length > 0) hasEnchants = true;
    }
    return hasEnchants;
}

const maxDurabilityMap = {
    'wooden_sword': 59, 'stone_sword': 131, 'iron_sword': 250, 'golden_sword': 32, 'diamond_sword': 1561, 'netherite_sword': 2031,
    'wooden_pickaxe': 59, 'stone_pickaxe': 131, 'iron_pickaxe': 250, 'golden_pickaxe': 32, 'diamond_pickaxe': 1561, 'netherite_pickaxe': 2031,
    'wooden_axe': 59, 'stone_axe': 131, 'iron_axe': 250, 'golden_axe': 32, 'diamond_axe': 1561, 'netherite_axe': 2031,
    'wooden_shovel': 59, 'stone_shovel': 131, 'iron_shovel': 250, 'golden_shovel': 32, 'diamond_shovel': 1561, 'netherite_shovel': 2031,
    'wooden_hoe': 59, 'stone_hoe': 131, 'iron_hoe': 250, 'golden_hoe': 32, 'diamond_hoe': 1561, 'netherite_hoe': 2031,
    'leather_helmet': 55, 'leather_chestplate': 80, 'leather_leggings': 75, 'leather_boots': 65,
    'chainmail_helmet': 165, 'chainmail_chestplate': 240, 'chainmail_leggings': 225, 'chainmail_boots': 195,
    'iron_helmet': 165, 'iron_chestplate': 240, 'iron_leggings': 225, 'iron_boots': 195,
    'golden_helmet': 77, 'golden_chestplate': 112, 'golden_leggings': 105, 'golden_boots': 91,
    'diamond_helmet': 363, 'diamond_chestplate': 528, 'diamond_leggings': 495, 'diamond_boots': 429,
    'netherite_helmet': 407, 'netherite_chestplate': 592, 'netherite_leggings': 555, 'netherite_boots': 481,
    'bow': 384, 'crossbow': 326, 'trident': 250, 'fishing_rod': 64, 'shears': 238, 
    'flint_and_steel': 64, 'carrot_on_a_stick': 25, 'warped_fungus_on_a_stick': 100, 
    'shield': 336, 'elytra': 432, 'turtle_helmet': 275, 'brush': 64, 'mace': 500
};

function getMaxDamage(idClean) {
    return maxDurabilityMap[idClean] || null;
}

function renderData() {
    // 0. Player Name resolution
    const headerTitle = document.querySelector('header h1');
    headerTitle.innerHTML = 'Minecraft Playerdata Viewer';
    
    let resolvedName = null;
    if (playerData.bukkit && playerData.bukkit.value && playerData.bukkit.value.lastKnownName) {
        resolvedName = getNBTValue(playerData.bukkit.value.lastKnownName);
    }
    
    if (resolvedName) {
        headerTitle.innerHTML = `Playerdata Viewer - <span style="color: #fbbf24;">${resolvedName}</span>`;
    } else if (window.lastUploadedFilename) {
        // Fallback to Mojang API via UUID
        const possibleUuid = window.lastUploadedFilename.replace('.dat', '').trim();
        if (/^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i.test(possibleUuid)) {
            fetch(`https://playerdb.co/api/player/minecraft/${possibleUuid}`)
            .then(res => res.json())
            .then(data => {
                if (data && data.success && data.data && data.data.player && data.data.player.username) {
                    const headImg = `<img src="https://crafatar.com/avatars/${possibleUuid}?size=32&overlay" style="vertical-align: middle; border-radius: 4px; margin-right: 8px; margin-top:-4px;" />`;
                    headerTitle.innerHTML = `${headImg} <span style="color: #fbbf24;">${data.data.player.username}</span>`;
                }
            })
            .catch(err => console.warn('Mojang API name resolution failed', err));
        }
    }

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
    statDimension.textContent = dimension ? dimension.replace('minecraft:', '') : "Unknown";

    const respawnObj = getNBTValue(playerData.respawn);
    let sX = null, sY = null, sZ = null, sDim = null;

    if (respawnObj) {
        const rPos = getNBTValue(respawnObj.pos);
        if (rPos && rPos.length >= 3) {
            sX = rPos[0]; sY = rPos[1]; sZ = rPos[2];
        }
        sDim = getNBTValue(respawnObj.dimension);
    } 
    
    // Fallback to standard / legacy Spawn tags
    if (sX === null) sX = getNBTValue(playerData.SpawnX);
    if (sY === null) sY = getNBTValue(playerData.SpawnY);
    if (sZ === null) sZ = getNBTValue(playerData.SpawnZ);
    if (!sDim) sDim = getNBTValue(playerData.SpawnDimension);

    if (sX !== null && sY !== null && sZ !== null) {
        statSpawn.textContent = `${sX}, ${sY}, ${sZ}`;
    } else {
        statSpawn.textContent = "Not Set";
    }

    statSpawnDim.textContent = sDim ? sDim.replace('minecraft:', '') : "Not Set";

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
    
    const hasEnchants = isItemEnchanted(components, tagData, idClean);
    if (hasEnchants) {
        el.classList.add('is-enchanted');
    }

    // Durability Bar Processor
    let damage = null;
    if (tagData && tagData.Damage) damage = getNBTValue(tagData.Damage);
    else if (components && components["minecraft:damage"]) damage = getNBTValue(components["minecraft:damage"]);

    if (damage !== null && damage > 0) {
        let maxDamage = (components && components["minecraft:max_damage"]) ? getNBTValue(components["minecraft:max_damage"]) : getMaxDamage(idClean);
        
        // Dynamic fallback for custom modded items (like "Spear") that accrued damage but aren't in the Vanilla registry
        if (!maxDamage) {
            if (damage < 131) maxDamage = 131; // Stone Tier Baseline
            else if (damage < 250) maxDamage = 250; // Iron Tier Baseline
            else if (damage < 1561) maxDamage = 1561; // Diamond Tier Baseline
            else maxDamage = damage + 500; // Unknown Mega-Tier
        }

        if (maxDamage) {
            const durability = Math.max(0, maxDamage - damage);
            const percent = durability / maxDamage;
            const hue = Math.max(0, percent * 120);

            const durabilityBarContainer = document.createElement('div');
            durabilityBarContainer.className = 'mc-item-durability-bg';

            const durabilityBar = document.createElement('div');
            durabilityBar.className = 'mc-item-durability';
            durabilityBar.style.width = `${Math.ceil(percent * 100)}%`;
            durabilityBar.style.backgroundColor = `hsl(${hue}, 100%, 50%)`;

            durabilityBarContainer.appendChild(durabilityBar);
            el.appendChild(durabilityBarContainer);
        }
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
    
    // Support deep container recursive browsing 
    el.addEventListener('click', (e) => {
        e.stopPropagation();
        openContainerPopup(itemTag);
    });

    return el;
}

function showTooltip(e, itemTag, fallbackName) {
    tooltip.classList.remove('hidden');
    tooltip.style.zIndex = '999999999'; // Guarantee tooltip always renders over nested modals!
    
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

    // Modern Enchantments (1.20.5+)
    function appendEnchants(enchNode) {
        if (!enchNode) return;
        const enchCompound = getNBTValue(enchNode);
        if (enchCompound) {
            let levels = enchCompound.levels ? getNBTValue(enchCompound.levels) : enchCompound;
            if (levels) {
                for (const [enchId, lvl] of Object.entries(levels)) {
                    let cleanEnch = enchId.replace('minecraft:', '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                    const lvlVal = typeof lvl === 'object' ? getNBTValue(lvl) : lvl;
                    html += `<div class="color-gray">${cleanEnch} ${toRoman(lvlVal)}</div>`;
                }
            }
        }
    }
    if (components && components["minecraft:enchantments"]) appendEnchants(components["minecraft:enchantments"]);
    if (components && components["minecraft:stored_enchantments"]) appendEnchants(components["minecraft:stored_enchantments"]);

    // Legacy format (<1.20)
    if (tagData) {
        const eTags = tagData.Enchantments || tagData.ench || tagData.StoredEnchantments || tagData.enchantments;
        if (eTags) {
            const list = getNBTList(eTags);
            list.forEach(eObj => {
                let id = eObj.id ? getNBTValue(eObj.id) : (eObj.name ? getNBTValue(eObj.name) : '');
                let lvl = eObj.lvl ? getNBTValue(eObj.lvl) : (eObj.level ? getNBTValue(eObj.level) : 1);
                
                if (typeof id === 'string') {
                    let cleanEnch = id.replace('minecraft:', '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                    html += `<div class="color-gray">${cleanEnch} ${toRoman(lvl)}</div>`;
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
    
    // Advanced Tooltip Component Processor
    let extraHTML = '';
    
    // Potions on ROOT item
    let potionName = null;
    if (components && components["minecraft:potion_contents"]) {
        const pCont = getNBTValue(components["minecraft:potion_contents"]);
        if (pCont && pCont.potion) potionName = getNBTValue(pCont.potion);
    } else if (tagData && tagData.Potion) {
        potionName = getNBTValue(tagData.Potion);
    }
    if (potionName) {
        const cleanPotion = potionName.replace('minecraft:', '').replace(/_/g, ' ');
        extraHTML += `<div style="color: #fca5a5; margin-top: 6px; font-size: 0.9em; text-transform: capitalize;">🧪 Potion: ${cleanPotion}</div>`;
    }

    // Containers (Shulker / Bundle)
    let containerList = null;
    let targetTag = tagData || itemTag;
    
    if (components && components["minecraft:bundle_contents"]) containerList = getNBTList(components["minecraft:bundle_contents"]);
    else if (components && components["minecraft:container"]) containerList = getNBTList(components["minecraft:container"]);
    else if (targetTag && targetTag.Items) containerList = getNBTList(targetTag.Items);
    else if (targetTag && targetTag.BlockEntityTag && targetTag.BlockEntityTag.value && targetTag.BlockEntityTag.value.Items) {
        containerList = getNBTList(targetTag.BlockEntityTag.value.Items);
    } else if (targetTag && targetTag.tag) {
        let nT = getNBTValue(targetTag.tag);
        if (nT && nT.Items) containerList = getNBTList(nT.Items);
        else if (nT && nT.BlockEntityTag && nT.BlockEntityTag.value && nT.BlockEntityTag.value.Items) containerList = getNBTList(nT.BlockEntityTag.value.Items);
    }

    if (containerList && containerList.length > 0) {
        extraHTML += '<div class="bundle-tooltip-grid">';
        
        containerList.forEach(cItem => {
            let itemNode = cItem;
            if (cItem.item && cItem.item.value) itemNode = cItem.item.value;
            else if (cItem.item) itemNode = cItem.item;
            
            const bIdRaw = getNBTValue(itemNode.id);
            if (!bIdRaw) return;
            
            const bIdClean = bIdRaw.replace('minecraft:', '');
            const bCount = getNBTValue(itemNode.count) || getNBTValue(itemNode.Count) || 1;
            const bComp = itemNode.components ? getNBTValue(itemNode.components) : null;
            const bTag = itemNode.tag ? getNBTValue(itemNode.tag) : null;
            
            // Damage check for bundles
            let bDamage = null;
            if (bTag && bTag.Damage) bDamage = getNBTValue(bTag.Damage);
            else if (bComp && bComp["minecraft:damage"]) bDamage = getNBTValue(bComp["minecraft:damage"]);
            
            let duraHtml = '';
            if (bDamage !== null && bDamage > 0) {
                let maxDamage = (bComp && bComp["minecraft:max_damage"]) ? getNBTValue(bComp["minecraft:max_damage"]) : getMaxDamage(bIdClean);
                
                if (!maxDamage) {
                    if (bDamage < 131) maxDamage = 131;
                    else if (bDamage < 250) maxDamage = 250;
                    else if (bDamage < 1561) maxDamage = 1561;
                    else maxDamage = bDamage + 500;
                }

                if (maxDamage) {
                    const percent = Math.max(0, maxDamage - bDamage) / maxDamage;
                    const hue = Math.max(0, percent * 120);
                    duraHtml = `<div class="mc-item-durability-bg"><div class="mc-item-durability" style="width: ${Math.ceil(percent * 100)}%; background-color: hsl(${hue}, 100%, 50%);"></div></div>`;
                }
            }

            const isEnch = isItemEnchanted(bComp, bTag, bIdClean);
            const enchClass = isEnch ? ' is-enchanted' : '';
            const bgVar = isEnch ? `style="--item-bg: url('icons/item/${bIdClean}.png');"` : '';
            
            extraHTML += `
                <div class="bundle-tt-item${enchClass}" ${bgVar}>
                    <img class="bundle-img" src="icons/item/${bIdClean}.png" 
                         onerror="this.src='icons/${bIdClean}.png'; if('${enchClass}') this.parentElement.style.setProperty('--item-bg', 'url(icons/${bIdClean}.png)'); this.onerror=function(){this.src='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAKklEQVR42mL5//8/AyWAiYFCwFCMKjhqMPEwMG4A5mGjhoEMGA0QoAAA0cQh3+0T6GAAAAAASUVORK5CYII='};">
                    ${bCount > 1 ? `<span class="bundle-tt-count">${bCount}</span>` : ''}
                    ${duraHtml}
                </div>
            `;
        });
        
        extraHTML += '</div>';
        extraHTML += `<div style="margin-top: 8px; padding: 6px; background: rgba(0,0,0,0.3); border-radius: 6px; border: 1px solid rgba(255,255,255,0.05); color: #fbbf24; font-size: 0.85em; font-weight: 500; display: flex; align-items: center; gap: 6px;"><span>🖱️</span> <span>Click to view interactively</span></div>`;
    }
    
    html += extraHTML;
    
    ttBody.innerHTML = html;

    moveTooltip(e);
}

// Opens a native recursive interactive grid popup for container items
function openContainerPopup(tagData) {
    if (!tagData) return;
    
    hideTooltip();
    
    let components = tagData.components ? getNBTValue(tagData.components) : null;
    let containerList = null;
    let td = tagData;
    
    if (components && components["minecraft:bundle_contents"]) containerList = getNBTList(components["minecraft:bundle_contents"]);
    else if (components && components["minecraft:container"]) containerList = getNBTList(components["minecraft:container"]);
    else if (td.Items) containerList = getNBTList(td.Items);
    else if (td.BlockEntityTag && td.BlockEntityTag.value && td.BlockEntityTag.value.Items) {
        containerList = getNBTList(td.BlockEntityTag.value.Items);
    } else if (td.tag) {
        let nT = getNBTValue(td.tag);
        if (nT && nT.Items) containerList = getNBTList(nT.Items);
        else if (nT && nT.BlockEntityTag && nT.BlockEntityTag.value && nT.BlockEntityTag.value.Items) containerList = getNBTList(nT.BlockEntityTag.value.Items);
    }
    
    if (!containerList || containerList.length === 0) return; // Not a container
    
    const overlay = document.createElement('div');
    overlay.className = 'container-popup-overlay';
    // Slightly lighter backdrop than main so you can see stacking modals visually
    overlay.style.cssText = 'position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.6); backdrop-filter:blur(5px); z-index:9999999; display:flex; justify-content:center; align-items:center; opacity:0; transition:opacity 0.2s ease;';
    
    const popup = document.createElement('div');
    popup.className = 'container-popup';
    popup.style.cssText = 'background: rgba(30, 41, 59, 0.95); border: 1px solid rgba(255,255,255,0.15); padding: 24px; border-radius: 20px; box-shadow: 0 40px 80px rgba(0,0,0,0.8); max-width: 640px; display: flex; flex-wrap: wrap; gap: 4px; max-height: 80vh; overflow-y: auto; transform:translateY(20px) scale(0.95); transition:all 0.3s cubic-bezier(0.16, 1, 0.3, 1);';
    
    containerList.forEach((cItem, index) => {
        let itemNode = cItem;
        if (cItem.item && cItem.item.value) itemNode = cItem.item.value;
        else if (cItem.item) itemNode = cItem.item;
        
        let customSlot = document.createElement('div');
        customSlot.className = 'mc-slot';
        
        // Use recursive element generation to retain full tooltips and nested deep clicks intrinsically!
        let childEl = createItemEl(itemNode, index);
        customSlot.appendChild(childEl);
        popup.appendChild(customSlot);
    });
    
    overlay.appendChild(popup);
    document.body.appendChild(overlay);
    
    requestAnimationFrame(() => {
        overlay.style.opacity = '1';
        popup.style.transform = 'translateY(0) scale(1)';
    });
    
    overlay.addEventListener('click', (e) => {
        // Only close if clicking the void background, preserving clicks inside the grid
        if (e.target === overlay) {
            overlay.style.opacity = '0';
            popup.style.transform = 'translateY(20px) scale(0.95)';
            setTimeout(() => overlay.remove(), 250);
        }
    });
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


// --- NBT Tree Formatter Engine ---
function renderNbtTree(data) {
    const treeOut = document.getElementById('tree-output');
    if (!treeOut) return;
    treeOut.innerHTML = '';
    
    // Wrap entire payload in root namespace rendering
    let html = generateNbtTreeHtml("root", { type: "compound", value: data.value });
    treeOut.innerHTML = html;
}

function generateNbtTreeHtml(name, node) {
    if (!node || typeof node !== 'object') return '';
    
    const type = node.type || "unknown";
    const val = node.value;
    
    // Primitives
    if (type !== 'compound' && type !== 'list' && type !== 'byteArray' && type !== 'intArray' && type !== 'longArray') {
        let displayVal = val;
        let colorClass = 'nbt-val-num';
        
        switch (type) {
            case 'string':
                displayVal = `"${val}"`;
                colorClass = 'nbt-val-str';
                break;
            case 'byte':
                displayVal = `${val}b`;
                break;
            case 'short':
                displayVal = `${val}s`;
                break;
            case 'long':
                displayVal = `${val[0] !== undefined ? val.join('') : val}L`;
                break;
            case 'float':
                displayVal = `${val}f`;
                break;
            case 'double':
                displayVal = `${val}d`;
                break;
        }

        return `
            <div class="nbt-leaf">
                <span class="nbt-key">${name}</span>: <span class="nbt-val ${colorClass}">${displayVal}</span>
            </div>
        `;
    }
    
    // Complex Branches (Compounds)
    if (type === 'compound') {
        const keys = Object.keys(val || {});
        const sizeString = `${keys.length} tag${keys.length !== 1 ? 's' : ''}`;
        
        let childrenHtml = '';
        for (const [k, v] of Object.entries(val || {})) {
            childrenHtml += generateNbtTreeHtml(k, v);
        }
        
        return `
            <details class="nbt-node">
                <summary>
                    <span class="nbt-key">${name}</span>: <span class="nbt-dim">Compound</span> <span class="nbt-size">[${sizeString}]</span>
                </summary>
                <div class="nbt-children">
                    ${childrenHtml}
                </div>
            </details>
        `;
    }
    
    // Lists Arrays natively
    if (type === 'list') {
        const itemType = val.type || "unknown";
        const arr = Array.isArray(val.value) ? val.value : [];
        const sizeString = `${arr.length} item${arr.length !== 1 ? 's' : ''}`;
        
        let childrenHtml = '';
        arr.forEach((item, i) => {
            childrenHtml += generateNbtTreeHtml(i, { type: itemType, value: item });
        });
        
        return `
            <details class="nbt-node">
                <summary>
                    <span class="nbt-key">${name}</span>: <span class="nbt-dim">List of ${itemType}s</span> <span class="nbt-size">[${sizeString}]</span>
                </summary>
                <div class="nbt-children">
                    ${childrenHtml}
                </div>
            </details>
        `;
    }
    
    // Arrays fallback
    if (type === 'byteArray' || type === 'intArray' || type === 'longArray') {
        const sizeString = `${val.length} item${val.length !== 1 ? 's' : ''}`;
        return `
            <details class="nbt-node">
                <summary>
                    <span class="nbt-key">${name}</span>: <span class="nbt-dim">${type}</span> <span class="nbt-size">[${sizeString}]</span>
                </summary>
                <div class="nbt-children">
                    <div class="nbt-leaf"><span class="nbt-dim">[Array Data Truncated]</span></div>
                </div>
            </details>
        `;
    }
    
    return '';
}

document.getElementById('btn-expand-all').addEventListener('click', () => {
    document.querySelectorAll('#tree-output details').forEach(d => d.setAttribute('open', ''));
});

document.getElementById('btn-collapse-all').addEventListener('click', () => {
    document.querySelectorAll('#tree-output details').forEach(d => d.removeAttribute('open'));
});

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
