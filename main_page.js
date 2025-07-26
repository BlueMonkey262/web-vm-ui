const vmListDiv = document.getElementById('vm-list');

async function fetchVMs() {
    try {
        const res = await fetch(`${API_BASE}/vms`);
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        const data = await res.json();
        attachHoverEvents();
        return data.vms;
    } catch (err) {
        vmListDiv.textContent = `Failed to load VMs: ${err.message}`;
        return [];
    }
}

async function startVM(name) {
    try {
        await fetch(`${API_BASE}/vms/start/${encodeURIComponent(name)}`, { method: 'POST' });
        loadVMs();
        setTimeout(updateVMStatuses, 1000)
    } catch (err) {
        alert(`Failed to start VM: ${err.message}`);
    }
}

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
    <button class="force-off" onclick="killVM(this)">Force Off</button>
    <button class="reboot" onclick="restartVM(this)">Reboot</button>
  </div>
</div>
</div>

  `;

    container.querySelector('.start-styling').onclick = () => startVM(vm.name);
    container.querySelector('.stop-styling').onclick = () => stopVM(vm.name);
    container.querySelector('.reboot').onclick = () => restartVM(vm.name);
    container.querySelector('.enter-viewer').onclick = () => openViewer(vm.name, vm.port);


    return container;
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
