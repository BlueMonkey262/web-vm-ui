async function stopVM(name) {
    try {
        await fetch(`${API_BASE}/vms/stop/${encodeURIComponent(name)}`, { method: 'POST' });
        loadVMs();
    } catch (err) {
        alert(`Failed to stop VM: ${err.message}`);
    }
}

function openViewer(name, port) {
    const url = new URL('vmViewer.html', window.location.href);
    url.searchParams.set('name', name);
    url.searchParams.set('port', port);
    window.location.href = url.toString();
}

function createVMElement(vm) {
    const container = document.createElement('div');
    container.className = 'vm-container';

    container.innerHTML = `
<div class="vm-box">
<div class="vm-header">
  <h2>${vm.name}</h2>
</div>
<div class="status">Status: ${vm.status}</div>

<div class="button-row">
  <button class="start-styling">Start</button>
  <button class="stop-styling">Stop</button>
  <button class="enter-viewer">View</button>
  <button class="more-styling hidden" onclick="toggleExtra(this)">Other</button>

  <div class="extra-buttons">
    <button class="force-off">Force Off</button>
    <button class="reboot">Reboot</button>
    <button class="Edit-VM">Edit</button>
  </div>
</div>
</div>

  `;

    container.querySelector('.start-styling').onclick = () => startVM(vm.name);
    container.querySelector('.stop-styling').onclick = () => stopVM(vm.name);
    container.querySelector('.reboot').onclick = () => restartVM(vm.name);
    container.querySelector('.enter-viewer').onclick = () => openViewer(vm.name, vm.port);

    // Attach handlers for extra buttons using the actual VM name
    const forceBtn = container.querySelector('.force-off');
    if (forceBtn) forceBtn.onclick = () => killVM(vm.name);

    // Replace the Edit button node with a real link that contains the encoded VM name.
    const editBtn = container.querySelector('.Edit-VM');
    if (editBtn) {
        const a = document.createElement('a');
        a.className = 'Edit-VM';
        a.textContent = 'Edit';
        a.href = `vm-editor/edit.html?name=${encodeURIComponent(vm.name)}`;
        // preserve button-like appearance if CSS targets .Edit-VM
        a.style.textDecoration = 'none';
        a.style.display = 'inline-block';
        a.style.padding = '6px 10px';
        a.style.borderRadius = '6px';
        // replace node
        editBtn.parentNode.replaceChild(a, editBtn);
    }

    return container;
}

// Ensure we have a reference to the VM list element used by loadVMs()
const vmListDiv = document.getElementById('vm-list');

// Fetch VM list from backend, return an array (defensive)
async function fetchVMs() {
    try {
        const res = window.fetchAPI ? await window.fetchAPI('/vms') : await fetch(`${window.API_BASE || API_BASE}/vms`);
        if (!res.ok) {
            console.warn('fetchVMs response not ok', res.status);
            return [];
        }
        const data = await res.json();
        return Array.isArray(data) ? data : (data.vms || []);
    } catch (err) {
        console.warn('fetchVMs failed', err);
        return [];
    }
}

// Start a VM (POST /vms/start/{name})
async function startVM(name) {
    try {
        const url = `/vms/start/${encodeURIComponent(name)}`;
        const res = window.fetchAPI ? await window.fetchAPI(url, { method: 'POST' }) : await fetch(`${window.API_BASE || API_BASE}${url}`, { method: 'POST' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await loadVMs();
    } catch (err) {
        alert(`Failed to start VM: ${err.message}`);
    }
}

// Restart a VM (POST /vms/restart/{name})
async function restartVM(name) {
    try {
        const url = `/vms/restart/${encodeURIComponent(name)}`;
        const res = window.fetchAPI ? await window.fetchAPI(url, { method: 'POST' }) : await fetch(`${window.API_BASE || API_BASE}${url}`, { method: 'POST' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await loadVMs();
    } catch (err) {
        alert(`Failed to restart VM: ${err.message}`);
    }
}

// Force-kill a VM (POST /vms/kill/{name}) - adjust endpoint if your backend uses a different path
async function killVM(name) {
    try {
        const url = `/vms/kill/${encodeURIComponent(name)}`;
        const res = window.fetchAPI ? await window.fetchAPI(url, { method: 'POST' }) : await fetch(`${window.API_BASE || API_BASE}${url}`, { method: 'POST' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await loadVMs();
    } catch (err) {
        alert(`Failed to force-off VM: ${err.message}`);
    }
}

async function loadVMs() {
    vmListDiv.textContent = 'Loading VMs...';
    const vms = await fetchVMs();
    vmListDiv.textContent = '';

    if (vms.length === 0) {
        vmListDiv.textContent = 'No VMs found.';
        return;
    }

    vms.forEach(vm => {
        vmListDiv.appendChild(createVMElement(vm));
    });
}

// Load on page load
loadVMs();

// Save scroll position before unload
window.addEventListener("beforeunload", () => {
    localStorage.setItem("scrollY", window.scrollY);
    localStorage.setItem("scrollX", window.scrollX);
});

// Restore scroll position on load
window.addEventListener("load", () => {
    const scrollY = localStorage.getItem("scrollY");
    const scrollX = localStorage.getItem("scrollX");
    if (scrollY !== null && scrollX !== null) {
        window.scrollTo(parseInt(scrollX), parseInt(scrollY));
    }
});

setInterval(fetchVMs, 3000);

// Admin modal handlers
(function() {
    const modal = document.getElementById('admin-modal');
    const cancel = document.getElementById('admin-cancel');
    const save = document.getElementById('admin-save');
    const siteTitleInput = document.getElementById('admin-site-title');

    if (!modal) return;

    cancel && cancel.addEventListener('click', () => {
        modal.style.display = 'none';
    });

    save && save.addEventListener('click', async () => {
        // Ensure only admin can save (defensive client-side check).
        let ok = false;
        if (window.userHasRole) {
            try { ok = await window.userHasRole('admin'); } catch (e) { ok = false; }
        }
        if (!ok) {
            alert('You do not have permission to perform this action.');
            return;
        }

        // Apply a simple UI change: update the page title to demonstrate a saved setting.
        const title = siteTitleInput.value.trim();
        if (title) {
            document.getElementById('title').textContent = title;
            modal.style.display = 'none';
            // You can POST these settings to your backend admin API here if desired.
            try {
                // Example placeholder: await window.fetchAPI('/admin/settings', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ siteTitle: title }) })
            } catch (e) {
                console.warn('Failed to persist admin settings (no backend configured)', e);
            }
        } else {
            alert('Please enter a site title.');
        }
    });

    // allow clicking outside modal to close
    window.addEventListener('click', (ev) => {
        if (!modal || modal.style.display !== 'flex') return;
        const box = modal.querySelector('div');
        if (!box) return;
        if (!box.contains(ev.target)) modal.style.display = 'none';
    });
})();
