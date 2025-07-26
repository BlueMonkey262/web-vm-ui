function showTab(tabId) {
    const tabs = document.querySelectorAll(".tab-content");
    tabs.forEach(tab => tab.classList.add("hidden"));

    const buttons = document.querySelectorAll(".tab-button");
    buttons.forEach(btn => btn.classList.remove("active"));

    document.getElementById(tabId).classList.remove("hidden");
    document.querySelector(`[onclick="showTab('${tabId}')"]`).classList.add("active");
}

async function submitXML() {
    const xml = document.getElementById("xmlInput").value;

    const res = await fetch("/api/vm/create-xml", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ xml }),
    });

    const result = await res.json();
    alert(result.message);
}

