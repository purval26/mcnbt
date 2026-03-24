const { execSync } = require('child_process');
const fs = require('fs');
const nbt = require('nbt');
const zlib = require('zlib');
const path = require('path');

const file = fs.readFileSync('88badd5e-1963-397e-b983-e1cc5fe806fa (3).dat');
const decomp = zlib.gunzipSync(file);

const iconsDir = path.join(__dirname, 'icons');
if (!fs.existsSync(iconsDir)) fs.mkdirSync(iconsDir);

nbt.parse(decomp, (err, data) => {
    if (err) return console.error(err);
    
    let ids = new Set();
    const add = (id) => ids.add(id.replace('minecraft:', ''));
    
    const tryAddList = (listTag) => {
        if (!listTag || !listTag.value || !Array.isArray(listTag.value.value)) return;
        listTag.value.value.forEach(i => {
            if (i.id) add(i.id.value);
        });
    };
    
    tryAddList(data.value.Inventory);
    tryAddList(data.value.EnderItems);
    
    if (data.value.equipment) {
        let eq = data.value.equipment.value;
        ['head', 'chest', 'legs', 'feet', 'offhand'].forEach(part => {
             if (eq[part] && eq[part].value.id) add(eq[part].value.id.value);
        });
    }

    console.log(`Found ${ids.size} unique items. Using curl to download them locally...`);

    const assetsBaseItem = 'https://raw.githubusercontent.com/misode/mcmeta/assets/assets/minecraft/textures/item/';
    const assetsBaseBlock = 'https://raw.githubusercontent.com/misode/mcmeta/assets/assets/minecraft/textures/block/';

    // We'll also download the empty armor slot backgrounds
    const emptySlots = [
        'empty_armor_slot_helmet',
        'empty_armor_slot_chestplate',
        'empty_armor_slot_leggings',
        'empty_armor_slot_boots'
    ];
    emptySlots.forEach(id => ids.add(id));

    let successCount = 0;
    
    for (let id of ids) {
        const dest = path.join(iconsDir, `${id}.png`);
        if (fs.existsSync(dest)) continue; // skip downloaded
        
        try {
            // Try item texture first
            console.log(`Downloading ${id}.png...`);
            // -f (fail silently on server errors), -s (silent), -S (show error), -o (output file)
            execSync(`curl -sS -f -o "${dest}" "${assetsBaseItem}${id}.png"`);
            successCount++;
        } catch (itemErr) {
            // If item texture fails, try block texture
            try {
                execSync(`curl -sS -f -o "${dest}" "${assetsBaseBlock}${id}.png"`);
                successCount++;
            } catch (blockErr) {
                console.log(`Could not find standard texture for ${id}, it might be modded or have a complex model. Generating placeholder...`);
                // Create a basic 16x16 purple/black missing texture locally
                const missingTexBase64 = 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAKklEQVR42mL5//8/AyWAiYFCwFCMKjhqMPEwMG4A5mGjhoEMGA0QoAAA0cQh3+0T6GAAAAAASUVORK5CYII=';
                fs.writeFileSync(dest, Buffer.from(missingTexBase64, 'base64'));
            }
        }
    }
    
    console.log(`Done! Fetched ${successCount} actual images to local /icons folder.`);
});
