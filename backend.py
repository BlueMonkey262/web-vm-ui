from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import libvirt
import xml.etree.ElementTree as ET


app = FastAPI()

# Enable CORS to allow frontend access
origins = [
    "*",  # For development: allows all origins; restrict this in production!
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

STATE_NAMES = {
    0: "No State",
    1: "Running",
    2: "Blocked",
    3: "Paused",
    4: "Shutdown",
    5: "Shut off",
    6: "Crashed",
    7: "PM Suspended",
}


def get_libvirt_conn():
    conn = libvirt.open('qemu:///system')
    if conn is None:
        raise RuntimeError("Failed to open connection to qemu:///system")
    return conn


@app.get("/vms")
def list_vms():
    conn = get_libvirt_conn()
    domains = conn.listAllDomains()

    vms = []
    for domain in domains:
        state, _ = domain.state()
        vm_info = {
            "name": domain.name(),
            "status": STATE_NAMES.get(state, "Unknown"),
            "port": None
        }

        # Parse XML to find spice port
        xml = domain.XMLDesc()
        try:
            root = ET.fromstring(xml)
            graphics = root.find(".//graphics[@type='spice']")
            if graphics is not None:
                port = graphics.get('port')
                if port and port != "-1":
                    vm_info["port"] = int(port)
        except ET.ParseError:
            pass  # ignore XML parse errors here

        vms.append(vm_info)
    conn.close()
    return {"vms": vms}




@app.post("/vms/start/{vm_name}")
def start_vm(vm_name: str):
    conn = get_libvirt_conn()
    try:
        domain = conn.lookupByName(vm_name)
    except libvirt.libvirtError:
        raise HTTPException(status_code=404, detail=f"VM '{vm_name}' not found")

    state, _ = domain.state()
    if state == 1:
        conn.close()
        return {"message": f"VM '{vm_name}' is already running"}

    try:
        domain.create()
        conn.close()
        return {"message": f"VM '{vm_name}' started successfully"}
    except libvirt.libvirtError as e:
        conn.close()
        raise HTTPException(status_code=500, detail=f"Failed to start VM '{vm_name}': {e}")
@app.post("/vms/stop/{vm_name}")
def stop_vm(vm_name: str):
    conn = get_libvirt_conn()
    try:
        domain = conn.lookupByName(vm_name)
    except libvirt.libvirtError:
        raise HTTPException(status_code=404, detail=f"VM '{vm_name}' not found")

    state, _ = domain.state()
    # If already shut off or shutdown, no action needed
    if state in (5, 4):  # 5 = Shut off, 4 = Shutdown
        conn.close()
        return {"message": f"VM '{vm_name}' is already stopped"}

    try:
        domain.shutdown()  # Graceful shutdown
        conn.close()
        return {"message": f"VM '{vm_name}' shutdown initiated successfully"}
    except libvirt.libvirtError as e:
        conn.close()
        raise HTTPException(status_code=500, detail=f"Failed to stop VM '{vm_name}': {e}")

@app.post("/vms/kill/{vm_name}")
def kill_vm(vm_name: str):
    conn = get_libvirt_conn()
    try:
        domain = conn.lookupByName(vm_name)
    except libvirt.libvirtError:
        raise HTTPException(status_code=404, detail=f"VM '{vm_name}' not found")

    state, _ = domain.state()
    # If already shut off or shutdown, no action needed
    if state in (5, 4):  # 5 = Shut off, 4 = Shutdown
        conn.close()
        return {"message": f"VM '{vm_name}' is already stopped"}

    try:
        domain.destroy()  # Graceful shutdown
        conn.close()
        return {"message": f"VM '{vm_name}' shutdown initiated successfully"}
    except libvirt.libvirtError as e:
        conn.close()
        raise HTTPException(status_code=500, detail=f"Failed to stop VM '{vm_name}': {e}")


@app.post("/vms/reboot/{vm_name}")
def reboot_vm(vm_name: str):
    conn = get_libvirt_conn()
    try:
        domain = conn.lookupByName(vm_name)
    except libvirt.libvirtError:
        raise HTTPException(status_code=404, detail=f"VM '{vm_name}' not found")

    state, _ = domain.state()
    # If already shut off or shutdown, no action needed
    if state in (5, 4):  # 5 = Shut off, 4 = Shutdown
        conn.close()
        return {"message": f"VM '{vm_name}' is already stopped"}

    try:
        domain.reboot()  # Graceful shutdown
        conn.close()
        return {"message": f"VM '{vm_name}' shutdown initiated successfully"}
    except libvirt.libvirtError as e:
        conn.close()
        raise HTTPException(status_code=500, detail=f"Failed to stop VM '{vm_name}': {e}")


