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
