//------------------------------------------------------------
// VM editor: autofill values and provide modern sliders and disk selector.
// Uses window.fetchAPI if present (global helper); otherwise falls back to a reasonable base URL.

function getQueryParam(name) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(name);
}

function apiFetch(path, opts) {
    // prefer global fetchAPI (tries multiple hosts); otherwise use a sensible fallback
    if (window.fetchAPI) return window.fetchAPI(path, opts);
    const base = (() => {
        // try to use same host (browser machine) at port 8000 first
        const host = location.hostname || 'localhost';
        return `${location.protocol}//${host}:8000`;
    })();
    return fetch(base + path, opts);
}

// Ensure a robust helper to extract qcow2 disk paths from various VM object shapes.
// Placed near the top so it is available before any code references it.
function extractDiskPaths(vm) {
    const found = new Set();

    if (!vm || typeof vm !== 'object') return [];

    // Common single-field names
    const singleKeys = ['disk_path', 'disk', 'primary_disk', 'root_disk', 'boot_disk'];
    singleKeys.forEach(k => {
        if (vm[k] && typeof vm[k] === 'string') found.add(vm[k]);
    });

    // Array of disk paths
    if (Array.isArray(vm.disk_paths)) vm.disk_paths.forEach(p => p && found.add(p));
    if (Array.isArray(vm.disks)) {
        vm.disks.forEach(d => {
            if (!d) return;
            if (typeof d === 'string') found.add(d);
            else if (typeof d === 'object') {
                if (d.path) found.add(d.path);
                if (d.source) found.add(d.source);
                if (d.file) found.add(d.file);
            }
        });
    }

    // Device list variations
    if (Array.isArray(vm.devices)) {
        vm.devices.forEach(dev => {
            if (dev && dev.type === 'disk') {
                if (dev.source && typeof dev.source === 'string') found.add(dev.source);
                if (dev.file && typeof dev.file === 'string') found.add(dev.file);
            }
        });
    }

    // Some backends provide block device maps
    if (vm.block_devices && typeof vm.block_devices === 'object') {
        Object.values(vm.block_devices).forEach(d => {
            if (!d) return;
            if (typeof d === 'string') found.add(d);
            else if (d.path) found.add(d.path);
            else if (d.source) found.add(d.source);
        });
    }

    // If a raw XML is present, search for .qcow2 paths in it
    const xmlSources = [];
    if (vm.xml && typeof vm.xml === 'string') xmlSources.push(vm.xml);
    if (vm.XMLDesc && typeof vm.XMLDesc === 'string') xmlSources.push(vm.XMLDesc);
    if (vm.domain_xml && typeof vm.domain_xml === 'string') xmlSources.push(vm.domain_xml);

    xmlSources.forEach(xml => {
        try {
            // quick regex to capture paths ending with .qcow2 (or .img)
            const matches = xml.match(/(?:[A-Za-z0-9_\/\-\.\$~]+?\.(?:qcow2|img|raw))/g);
            if (matches) matches.forEach(m => found.add(m));
        } catch (e) {
            // ignore parse errors
        }
    });

    // Filter out empty entries and return as array
    return Array.from(found).filter(Boolean);
}

document.addEventListener("DOMContentLoaded", async () => {
    // wait for auth to initialize and ensure user is authenticated
    if (window.authInitPromise) {
        try {
            await window.authInitPromise;
            await window.ensureAuthenticated();
        } catch (e) {
            console.warn("Auth initialization/ensure failed in editor:", e);
            // continue gracefully; fetches will still attempt unauthenticated calls
        }
    }

    const vmName = getQueryParam("name");
    const form = document.getElementById("editForm");
    const resultDiv = document.getElementById("result");
    const nameDisplay = document.getElementById("nameDisplay");

    const memoryRange = document.getElementById("memoryRange");
    const memoryNumber = document.getElementById("memoryNumber");

    const vcpuRange = document.getElementById("vcpuRange");
    const vcpuNumber = document.getElementById("vcpuNumber");

    const diskSelect = document.getElementById("diskSelect");
    const diskCustom = document.getElementById("diskCustom");
    const saveBtn = document.getElementById("saveBtn");
    const applyLiveBtn = document.getElementById("applyLiveBtn");

    if (!vmName) {
        resultDiv.innerText = "No VM name specified in URL (?name=...).";
        return;
    }
    nameDisplay.innerText = vmName;

    // Keep range and number inputs in sync
    function syncRangeToNumber(range, number) {
        range.addEventListener('input', () => number.value = range.value);
        number.addEventListener('input', () => {
            let v = Number(number.value);
            if (isNaN(v)) v = range.min;
            v = Math.max(Number(range.min), Math.min(Number(range.max), v));
            range.value = v;
            number.value = v;
        });
    }
    syncRangeToNumber(memoryRange, memoryNumber);
    syncRangeToNumber(vcpuRange, vcpuNumber);

    // clamp helper
    function clamp(value, min, max) {
        const n = Number(value);
        if (isNaN(n)) return min;
        return Math.max(Number(min), Math.min(Number(max), n));
    }

    // --- NEW: read system info first to determine sensible maxima for sliders ---
    const originalMemMax = Number(memoryRange.max || 65536);
    const originalVcpuMax = Number(vcpuRange.max || 32);

    apiFetch('/sys')
        .then(res => (res.ok ? res.json() : null))
        .then(sys => {
            if (sys) {
                // memory: set max to (sys.memory_mb - 4096) MB, but not less than 256 and not greater than original max
                if (sys.memory_mb != null) {
                    const candidate = Number(sys.memory_mb) - 4096; // subtract 4GB
                    const memMax = Math.max(256, Math.min(originalMemMax, candidate));
                    memoryRange.max = memMax;
                    memoryNumber.max = memMax;
                }
                // vcpus: set max to (sys.vcpus - 2), but not less than 1 and not greater than original max
                if (sys.vcpus != null) {
                    const candidate = Number(sys.vcpus) - 2; // reserve 2 vCPUs
                    const vcpuMax = Math.max(1, Math.min(originalVcpuMax, candidate));
                    vcpuRange.max = vcpuMax;
                    vcpuNumber.max = vcpuMax;
                }
            }
        })
        .catch(err => {
            // If sys endpoint fails, keep original HTML maxima; do not block editing
            console.warn('Failed to read /sys info:', err);
        })
        .finally(() => {
            // After attempting to set maxima, proceed to fetch VM list and autofill
            apiFetch('/vms')
                .then(res => {
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    return res.json();
                })
                .then(async data => { // <-- made async so we can call backend disk endpoint as fallback
                     // data may be { vms: [...] } or a plain array
                     const vms = Array.isArray(data) ? data : (data.vms || []);
                     const vm = vms.find(v => v.name === vmName);
                     if (!vm) {
                         resultDiv.innerText = `VM "${vmName}" not found.`;
                         return;
                     }

                     // Autofill memory and vcpus when present (backend units: memory_mb/property names may vary)
                     // Try a few common field names
                     const memCandidates = ['memory_mb', 'memory', 'mem', 'memoryMiB', 'memory_mib'];
                     let memVal = null;
                     for (const k of memCandidates) {
                         if (vm[k] != null) { memVal = Number(vm[k]); break; }
                     }
                     if (memVal == null && vm.currentMemory != null) memVal = Number(vm.currentMemory);
                     if (memVal == null && vm.maxMemory != null) memVal = Number(vm.maxMemory);
                     // Ensure memVal does not exceed the UI max
                     const memMaxUI = Number(memoryRange.max || originalMemMax);
                     if (memVal != null) {
                         memVal = clamp(memVal, Number(memoryRange.min || 256), memMaxUI);
                         memoryRange.value = memVal;
                         memoryNumber.value = memVal;
                     } else {
                         // default
                         const defaultMem = Math.min(2048, memMaxUI);
                         memoryRange.value = defaultMem;
                         memoryNumber.value = defaultMem;
                     }

                     const vcpuCandidates = ['vcpus', 'vcpu', 'cpus', 'num_vcpus'];
                     let vcpuVal = null;
                     for (const k of vcpuCandidates) {
                         if (vm[k] != null) { vcpuVal = Number(vm[k]); break; }
                     }
                     if (vcpuVal == null && vm.vcpu != null) vcpuVal = Number(vm.vcpu);
                     // Ensure vcpuVal does not exceed the UI max
                     const vcpuMaxUI = Number(vcpuRange.max || originalVcpuMax);
                     if (vcpuVal != null) {
                         vcpuVal = clamp(vcpuVal, Number(vcpuRange.min || 1), vcpuMaxUI);
                         vcpuRange.value = vcpuVal;
                         vcpuNumber.value = vcpuVal;
                     } else {
                         const defaultVcpu = Math.min(2, vcpuMaxUI);
                         vcpuRange.value = defaultVcpu;
                         vcpuNumber.value = defaultVcpu;
                     }

                     // Populate disk options
                     let disks = extractDiskPaths(vm);

                     // If no disks were found client-side, try backend helper endpoint /vms/{name}/disks
                     if ((!disks || disks.length === 0) && typeof apiFetch === 'function') {
                         try {
                             const dres = await apiFetch(`/vms/${encodeURIComponent(vmName)}/disks`);
                             if (dres && dres.ok) {
                                 const dd = await dres.json();
                                 if (Array.isArray(dd.disks) && dd.disks.length > 0) {
                                     disks = dd.disks;
                                 } else if (Array.isArray(dd)) {
                                     disks = dd;
                                 }
                             }
                         } catch (e) {
                             console.warn("Failed to fetch disk list from backend for", vmName, e);
                         }
                     }

                     diskSelect.innerHTML = '';
                     if (disks.length === 0) {
                         const opt = document.createElement('option');
                         opt.value = '';
                         opt.textContent = 'No known disk images';
                         diskSelect.appendChild(opt);
                     } else {
                         // helper to display the filename part and preserve the extension
                         const displayFilename = (p) => {
                             try {
                                 const last = (p || '').split('/').pop() || p;
                                 // decode URL-encoded names but keep extension intact
                                 return decodeURIComponent(String(last));
                             } catch (e) {
                                 return String(p);
                             }
                         };

                         disks.forEach(d => {
                             const opt = document.createElement('option');
                             opt.value = d;
                             opt.textContent = displayFilename(d);
                             diskSelect.appendChild(opt);
                         });
                     }
                     // Add a Custom option
                     const sep = document.createElement('option');
                     sep.value = '__custom__';
                     sep.textContent = 'Custom path...';
                     diskSelect.appendChild(sep);

                     // If VM object carries a "primary" disk, try to select it
                     if (vm.disk_path) {
                         diskSelect.value = vm.disk_path;
                     } else if (disks.length > 0) {
                         diskSelect.selectedIndex = 0;
                     }

                     // Show/hide custom input when custom selected
                     function updateDiskCustomVisibility() {
                         if (diskSelect.value === '__custom__') {
                             diskCustom.style.display = 'block';
                         } else {
                             diskCustom.style.display = 'none';
                         }
                     }
                     diskSelect.addEventListener('change', updateDiskCustomVisibility);
                     updateDiskCustomVisibility();

                     resultDiv.innerText = '';
                 })
                 .catch(err => {
                     console.warn("Failed to fetch VM info:", err);
                     resultDiv.innerText = "Could not fetch VM info (backend unreachable).";
                 });
        });

    // Submit edits
    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        resultDiv.innerText = "Saving...";
        saveBtn.disabled = true;

        const payload = {
            memory_mb: Number(memoryNumber.value),
            vcpus: Number(vcpuNumber.value)
        };

        // If disk changed and not empty, include it in a "disk_path" field so backend (if it supports it) can use it.
        let diskPath = diskSelect.value;
        if (diskPath === '__custom__') diskPath = diskCustom.value.trim();
        if (diskPath) payload.disk_path = diskPath;

        try {
            const res = await apiFetch(`/vms/edit/${encodeURIComponent(vmName)}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            const data = await (res.headers.get('content-type') || '').includes('application/json') ? res.json() : { message: await res.text() };
            if (!res.ok) {
                resultDiv.innerText = `Error: ${res.status} - ${JSON.stringify(data)}`;
            } else {
                // Prefer returned structured details
                if (data.details) {
                    resultDiv.innerText = data.message + "\n\n" + (Array.isArray(data.details) ? data.details.join("\n") : JSON.stringify(data.details));
                } else {
                    resultDiv.innerText = JSON.stringify(data, null, 2);
                }
            }
        } catch (err) {
            console.error(err);
            resultDiv.innerText = "Request failed: " + (err.message || err);
        } finally {
            saveBtn.disabled = false;
        }
    });

    applyLiveBtn.addEventListener('click', async () => {
        // Shortcut to try applying only live changes: same endpoint is used; backend will attempt live where possible.
        resultDiv.innerText = 'Applying live changes...';
        applyLiveBtn.disabled = true;
        try {
            const payload = {
                memory_mb: Number(memoryNumber.value),
                vcpus: Number(vcpuNumber.value)
            };
            const res = await apiFetch(`/vms/edit/${encodeURIComponent(vmName)}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            resultDiv.innerText = data.message + (data.details ? ("\n" + (Array.isArray(data.details) ? data.details.join("\n") : JSON.stringify(data.details))) : "");
        } catch (err) {
            resultDiv.innerText = 'Live apply failed: ' + (err.message || err);
        } finally {
            applyLiveBtn.disabled = false;
        }
    });
});
//------------------------------------------------------------
