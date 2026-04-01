// content.js
// Continuously monitors the SPA routing URL of FalixNodes / Pterodactyl
let currentInjectedUrl = null;

function checkUrl() {
    if (window.location.href === currentInjectedUrl) return;
    
    // Check for FalixNodes custom panel OR Standard Pterodactyl
    const falixMatch = window.location.pathname.match(/\/server\/([^\/]+)\/edit/);
    const pteroMatch = window.location.pathname.match(/\/server\/([^\/]+)\/files\/edit\/(.+)/);
    
    let serverId = null;
    let filePath = null;

    if (falixMatch) {
        serverId = falixMatch[1];
        const searchParams = new URLSearchParams(window.location.search);
        filePath = searchParams.get('path');
    } else if (pteroMatch) {
        serverId = pteroMatch[1];
        filePath = decodeURIComponent(pteroMatch[2]);
    }

    if (serverId && filePath && filePath.endsWith('.dat')) {
        currentInjectedUrl = window.location.href;
        injectViewer(serverId, filePath);
    } else {
        // If we leave the page intentionally via SPA nav, clean up the overlay
        cleanupViewer();
        currentInjectedUrl = null;
    }
}

// 500ms heartbeat is standard for catching React SPA pushState navigation reliably
setInterval(checkUrl, 500);

function cleanupViewer() {
    if (window.mcnbtRefreshInterval) {
        clearInterval(window.mcnbtRefreshInterval);
        window.mcnbtRefreshInterval = null;
    }
    const existing = document.getElementById('mcnbt-window');
    if (existing) existing.remove();
    document.querySelectorAll('.mcnbt-loading-text').forEach(e => e.remove());
}

async function injectViewer(serverId, filePath) {
    // 1. Add loading UI
    const loading = document.createElement('div');
    loading.className = 'mcnbt-loading-text';
    loading.textContent = 'Downloading Playerdata directly from Server...';
    document.body.appendChild(loading);

    try {
        let downloadUrl = null;

        // Try FalixNodes Custom POST Download API natively
        try {
            const postRes = await fetch(`/api/v1/servers/${serverId}/files/download`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ file: filePath })
            });
            if (postRes.ok) {
                const json = await postRes.json();
                if (json.url) downloadUrl = json.url;
                else if (json.attributes && json.attributes.url) downloadUrl = json.attributes.url;
            }
        } catch(e) { /* Ignore POST error and try GET fallback */ }

        // Fallback to standard Pterodactyl GET
        if (!downloadUrl) {
            const getRes = await fetch(`/api/client/servers/${serverId}/files/download?file=${encodeURIComponent(filePath)}`);
            if (getRes.ok) {
                const json = await getRes.json();
                if (json.attributes && json.attributes.url) downloadUrl = json.attributes.url;
            }
        }

        if (!downloadUrl) throw new Error("Could not parse download URL from FalixNodes API");

        // 3. Download the actual binary .dat file Data
        const fileRes = await fetch(downloadUrl);
        const arrayBuffer = await fileRes.arrayBuffer();

        // 4. Create Wrapper Window
        loading.remove();
        
        const wrapper = document.createElement('div');
        wrapper.id = 'mcnbt-window';
        
        const header = document.createElement('div');
        header.id = 'mcnbt-header';
        header.innerHTML = `
            <div style="font-weight: 600; display: flex; align-items: center; gap: 8px;">
                <span>📦</span> Playerdata MCNBT Viewer
            </div>
            <div>
                <button class="mcnbt-btn" id="mcnbt-toggle-float">Toggle Float Mode</button>
                <button class="mcnbt-btn close" id="mcnbt-close">Close Viewer</button>
            </div>
        `;
        wrapper.appendChild(header);

        const iframe = document.createElement('iframe');
        iframe.id = 'mcnbt-iframe';
        iframe.src = chrome.runtime.getURL('index.html?extension=true');
        
        iframe.onload = () => {
            const filename = filePath.split('/').pop();
            iframe.contentWindow.postMessage(
                { type: 'LOAD_NBT_BUFFER', buffer: arrayBuffer, filename: filename },
                '*',
                [arrayBuffer]
            );
        };
        
        wrapper.appendChild(iframe);
        document.body.appendChild(wrapper);
        
        // Auto Refresh Logic
        window.mcnbtRefreshInterval = setInterval(async () => {
            // Protect against race conditions where iframe is removed mid-fetch
            if (!document.getElementById('mcnbt-iframe')) {
                clearInterval(window.mcnbtRefreshInterval);
                return;
            }
            
            let newDownloadUrl = null;
            try {
                const postRes = await fetch(`/api/v1/servers/${serverId}/files/download`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ file: filePath })
                });
                if (postRes.ok) {
                    const json = await postRes.json();
                    if (json.url) newDownloadUrl = json.url;
                    else if (json.attributes && json.attributes.url) newDownloadUrl = json.attributes.url;
                }
            } catch(e) {}

            if (!newDownloadUrl) {
                try {
                    const getRes = await fetch(`/api/client/servers/${serverId}/files/download?file=${encodeURIComponent(filePath)}`);
                    if (getRes.ok) {
                        const json = await getRes.json();
                        if (json.attributes && json.attributes.url) newDownloadUrl = json.attributes.url;
                    }
                } catch(e) {}
            }
            
            if (newDownloadUrl) {
                try {
                    const fileRes = await fetch(newDownloadUrl);
                    const arrayBuffer = await fileRes.arrayBuffer();
                    const frame = document.getElementById('mcnbt-iframe');
                    if (frame && frame.contentWindow) {
                        const filename = filePath.split('/').pop();
                        frame.contentWindow.postMessage(
                            { type: 'LOAD_NBT_BUFFER', buffer: arrayBuffer, filename: filename },
                            '*',
                            [arrayBuffer]
                        );
                    }
                } catch(e) { console.warn("MCNBT: Refresh stream failed", e); }
            }
        }, 5000);

        // Window Controls Logic
        let isFloating = false;
        document.getElementById('mcnbt-toggle-float').onclick = () => {
            isFloating = !isFloating;
            if (isFloating) {
                // Assert strict starting boundaries when transitioning to float to overwrite any old inline styles
                wrapper.style.width = '800px';
                wrapper.style.height = '700px';
                wrapper.style.left = '50px';
                wrapper.style.top = '50px';
                wrapper.classList.add('is-floating');
            } else {
                wrapper.classList.remove('is-floating');
                // Strip all structurally applied inline dimensional bounds applied by the mouse resizer
                wrapper.style.width = '';
                wrapper.style.height = '';
                wrapper.style.left = '';
                wrapper.style.top = '';
            }
        };

        document.getElementById('mcnbt-close').onclick = () => {
            cleanupViewer();
            // Assigning dummy path so the interval prevents bouncing back into the same dat frame natively
            currentInjectedUrl = "CLOSED"; 
            window.history.back();
        };

        // Window Kinematics Dragging
        let isDragging = false;
        let startX, startY, initialX, initialY;

        header.onmousedown = (e) => {
            if (!isFloating) return; // Fullscreen layout binds static 100vw/vh
            if (e.target.tagName.toLowerCase() === 'button') return; // Allow buttons to process native clicks
            
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            initialX = wrapper.offsetLeft;
            initialY = wrapper.offsetTop;
            
            // Protective drag mesh cover guarantees iframe won't swallow drag movements mid-transit
            const cover = document.createElement('div');
            cover.id = 'mcnbt-drag-cover';
            cover.style.cssText = 'position:absolute; top:0; left:0; right:0; bottom:0; z-index:99999999;';
            wrapper.appendChild(cover);
        };

        window.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            wrapper.style.left = `${initialX + dx}px`;
            wrapper.style.top = `${initialY + dy}px`;
        });

        window.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                const cover = document.getElementById('mcnbt-drag-cover');
                if (cover) cover.remove();
            }
        });

    } catch (err) {
        loading.textContent = 'Failed to load NBT: ' + err.message;
        console.error("MCNBT Viewer Extension Error:", err);
        setTimeout(() => {
            loading.remove();
            currentInjectedUrl = null;
        }, 4000);
    }
}

// Listen for Escape key closing signal from the iframe child
window.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'CLOSE_NBT_VIEWER') {
        cleanupViewer();
        currentInjectedUrl = "CLOSED";
        window.history.back(); 
    }
});

// Ensure native escape keys trigger the wrapper cleanup implicitly 
window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.getElementById('mcnbt-window')) {
        cleanupViewer();
        currentInjectedUrl = "CLOSED";
        window.history.back();
    }
});
