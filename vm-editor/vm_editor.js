//------------------------------------------------------------
// Helper to get query parameters
function getQueryParam(name) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(name);
}

document.addEventListener("DOMContentLoaded", () => {
    const vmName = getQueryParam("name"); // Grab VM name from URL
    const form = document.getElementById("editForm");
    const resultDiv = document.getElementById("result");

    // Fetch current VM info to prefill the form (optional)
    // Use global fetchAPI fallback which will try configured hosts (120 then 193)
    (window.fetchAPI ? window.fetchAPI('/vms') : fetch('http://192.168.50.120:8000/vms'))
        .then(res => res.json())
        .then(data => {
            const vm = data.vms.find(v => v.name === vmName);
            if (vm) {
                form.memory_mb.value = vm.memory_mb || '';
                form.vcpus.value = vm.vcpus || '';
            }
        })
        .catch(err => console.error("Failed to fetch VM info:", err));

    form.addEventListener("submit", async (e) => {
        e.preventDefault();

        const formData = new FormData(form);
        const payload = {
            memory_mb: parseInt(formData.get("memory_mb")),
            vcpus: parseInt(formData.get("vcpus"))
        };

        try {
            const res = await (window.fetchAPI
                ? window.fetchAPI(`/vms/edit/${encodeURIComponent(vmName)}`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload)
                  })
                : fetch(`http://192.168.50.120:8000/vms/edit/${encodeURIComponent(vmName)}`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload)
                  }));

            const data = await res.json();
            resultDiv.innerText = JSON.stringify(data, null, 2);
         } catch (err) {
             resultDiv.innerText = "Error: " + err;
         }
     });
});
//------------------------------------------------------------
