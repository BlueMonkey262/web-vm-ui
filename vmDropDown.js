// Toggle visibility of extra options under each VM box
// Hosts to try (new IP first, fallback to previous IP). Adjust order as needed.
window.API_HOSTS = ["http://192.168.50.120:8000"];
window.API_BASE = window.API_HOSTS[0];

// fetchAPI(path, options) will try each host in API_HOSTS until one succeeds.
// It returns the Response of the first successful fetch or throws if all fail.
window.fetchAPI = async function(path, options) {
    let lastErr = null;
    for (const host of window.API_HOSTS) {
        const url = host + path;
        try {
            const res = await fetch(url, options);
            // If fetch succeeded (got a response), return it even if status is 4xx/5xx.
            // Network/CORS failures typically throw, so we catch them below.
            return res;
        } catch (err) {
            console.warn("fetch failed for", url, err);
            lastErr = err;
            // try next host
        }
    }
    // All hosts failed
    throw lastErr || new Error("All API hosts failed");
};

function toggleExtra(button, showorhide) {
    console.log('toggleExtra called');
    const container = button.parentElement;
    const extra = container.querySelector('.extra-buttons');
    if (!extra) {
        console.warn('No .extra-buttons element found');
        return;
    }
    if (showorhide == "show") {
        extra.classList.add("show")
    }
    if (showorhide == "hide") {
        extra.classList.remove('show');
    }
}

async function killVM(button) {
    const vmBox = button.closest('.vm-box');
    if (!vmBox) {
        console.error('Could not find vm-box container');
        return;
    }
    const vmNameElem = vmBox.querySelector('.vm-header h2');
    if (!vmNameElem) {
        console.error('Could not find VM name element');
        return;
    }
    const vmName = vmNameElem.textContent;

    // Show the confirmation overlay and add blur class to body
    const overlay = document.getElementById('confirm-overlay');
    if (!overlay) {
        console.error('Confirm overlay element not found!');
        return;
    }
    overlay.classList.remove('hidden');
    document.body.classList.add('blur-active');  // Add blur here

    // Get the buttons inside the confirmation modal
    const yesBtn = document.getElementById('confirm-yes');
    const noBtn = document.getElementById('confirm-no');

    if (!yesBtn || !noBtn) {
        console.error('Confirm buttons not found!');
        return;
    }

    // Create a promise that resolves when user clicks Yes or No
    const userConfirmed = await new Promise((resolve) => {
        function cleanup() {
            overlay.classList.add('hidden');
            document.body.classList.remove('blur-active'); // Remove blur here
            yesBtn.removeEventListener('click', onYes);
            noBtn.removeEventListener('click', onNo);
        }

        function onYes() {
            cleanup();
            resolve(true);
        }
        function onNo() {
            cleanup();
            resolve(false);
        }

        yesBtn.addEventListener('click', onYes);
        noBtn.addEventListener('click', onNo);
    });

    if (!userConfirmed) {
        console.log('User canceled force off');
        return;
    }

    console.log('User confirmed, killing VM:', vmName);

    // Call your API to kill the VM
    try {
        await window.fetchAPI(`/vms/kill/${encodeURIComponent(vmName)}`, { method: 'POST' });
        if (typeof loadVMs === 'function') {
            loadVMs();
        }
    } catch (err) {
        alert(`Failed to stop VM: ${err.message}`);
    }
}

window.killVM = killVM;  // expose globally for inline onclick


function updateVMStatuses() {
    document.querySelectorAll('.vm-box').forEach(box => {
        const statusElem = box.querySelector('.status');

        if (!statusElem) {
            console.warn("No .status element found in:", box);
            return;
        }

        // Debug: log raw innerHTML/textContent
        console.log("Raw status HTML:", statusElem.innerHTML);
        console.log("Raw status text:", statusElem.textContent);

        const rawStatus = statusElem.textContent.trim();
        const statusValue = rawStatus.split(':')[1]?.trim().toLowerCase();

        console.log("Extracted status value:", statusValue);

        if (statusValue === 'running') {
            console.log("Adding .running to VM box");
            box.classList.add('running');
        } else {
            console.log("Removing .running from VM box");
            box.classList.remove('running');
        }
    });
}


// Call it once after the VMs are inserted

function handleHoverEnter(e) {
    console.log("Hovered on:", e.currentTarget);
    toggleExtra(e.currentTarget, "show");
}

function handleHoverLeave(e) {
    console.log("Unhovered:", e.currentTarget);
    toggleExtra(e.currentTarget, "hide");
}

// Call this after you create or update the vm-box elements
function attachHoverEvents() {
    const boxes = document.querySelectorAll(".vm-box");
    boxes.forEach(box => {
        box.addEventListener("mouseenter", handleHoverEnter);
        box.addEventListener("mouseleave", handleHoverLeave);
    });
}

async function restartVM(name) {
    try {
        await window.fetchAPI(`/vms/reboot/${encodeURIComponent(name)}`, { method: 'POST' });
        loadVMs();
    } catch (err) {
        alert(`Failed to reboot VM: ${err.message}`);
    }
}

setTimeout(attachHoverEvents, 1000);
setInterval(updateVMStatuses, 1000);
