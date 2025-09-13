from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import libvirt
import xml.etree.ElementTree as ET
from pydantic import BaseModel
import os
VM_IMAGE_DIR = "/home/eli/Downloads"

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

class VMEditRequest(BaseModel):
    memory_mb: int = None  # optional
    vcpus: int = None      # optional


@app.post("/vms/edit/{vm_name}")
def edit_vm(vm_name: str, changes: VMEditRequest):
    conn = get_libvirt_conn()
    try:
        domain = conn.lookupByName(vm_name)
    except libvirt.libvirtError:
        conn.close()
        raise HTTPException(status_code=404, detail=f"VM '{vm_name}' not found")

    state, _ = domain.state()

    messages = []

    # Update memory
    if changes.memory_mb is not None:
        try:
            if state == 1:  # Running VM
                # setMemory expects KiB
                domain.setMemory(changes.memory_mb * 1024)
                messages.append(f"Memory changed live to {changes.memory_mb} MB")
            else:  # Stopped VM — update XML
                xml = domain.XMLDesc()
                root = ET.fromstring(xml)

                # Update <memory> with unit='MiB'
                mem_elem = root.find("memory")
                if mem_elem is not None:
                    mem_elem.text = str(changes.memory_mb)
                    mem_elem.set("unit", "MiB")
                else:
                    mem_elem = ET.SubElement(root, "memory", unit="MiB")
                    mem_elem.text = str(changes.memory_mb)

                # Update <currentMemory> with unit='MiB'
                cur_mem_elem = root.find("currentMemory")
                if cur_mem_elem is not None:
                    cur_mem_elem.text = str(changes.memory_mb)
                    cur_mem_elem.set("unit", "MiB")
                else:
                    cur_mem_elem = ET.SubElement(root, "currentMemory", unit="MiB")
                    cur_mem_elem.text = str(changes.memory_mb)

                # Redefine VM with updated XML
                new_xml = ET.tostring(root).decode()
                domain.undefine()
                domain = conn.defineXML(new_xml)

                messages.append(f"Memory set to {changes.memory_mb} MB (effective on next start)")
        except libvirt.libvirtError as e:
            conn.close()
            raise HTTPException(status_code=500, detail=f"Failed to change memory: {e}")

    # Update vCPUs
    if changes.vcpus is not None:
        try:
            if state == 1:
                domain.setVcpus(changes.vcpus)
                messages.append(f"vCPUs changed live to {changes.vcpus}")
            else:
                xml = domain.XMLDesc()
                root = ET.fromstring(xml)
                vcpu_elem = root.find("vcpu")
                if vcpu_elem is not None:
                    vcpu_elem.text = str(changes.vcpus)
                else:
                    ET.SubElement(root, "vcpu").text = str(changes.vcpus)
                new_xml = ET.tostring(root).decode()
                domain.undefine()
                domain = conn.defineXML(new_xml)
                messages.append(f"vCPUs set to {changes.vcpus} (effective on next start)")
        except libvirt.libvirtError as e:
            conn.close()
            raise HTTPException(status_code=500, detail=f"Failed to change vCPUs: {e}")

    conn.close()
    return {"message": "VM updated successfully", "details": messages}


class VMCreateRequest(BaseModel):
    name: str
    memory_mb: int
    vcpus: int
    disk_gb: int
    iso_path: str = None  # optional ISO for boot

@app.post("/vms/create")
def create_vm(vm: VMCreateRequest):
    conn = get_libvirt_conn()

    # Check if VM already exists
    try:
        _ = conn.lookupByName(vm.name)
        conn.close()
        raise HTTPException(status_code=400, detail=f"VM '{vm.name}' already exists")
    except libvirt.libvirtError:
        pass  # VM doesn't exist, continue

    # Create disk image
    disk_path = os.path.join(VM_IMAGE_DIR, f"{vm.name}.qcow2")
    try:
        import subprocess
        subprocess.run(
            ["qemu-img", "create", "-f", "qcow2", disk_path, f"{vm.disk_gb}G"],
            check=True
        )
    except Exception as e:
        conn.close()
        raise HTTPException(status_code=500, detail=f"Failed to create disk: {e}")

    # Generate minimal XML
    vm_xml = f"""
<domain type='kvm'>
  <name>{vm.name}</name>
  <memory unit='MiB'>{vm.memory_mb}</memory>
  <vcpu>{vm.vcpus}</vcpu>
  <os>
    <type arch='x86_64' machine='pc'>hvm</type>
    {"<boot dev='cdrom'/>" if vm.iso_path else "<boot dev='hd'/>"}
  </os>
  <devices>
    <disk type='file' device='disk'>
      <driver name='qemu' type='qcow2'/>
      <source file='{disk_path}'/>
      <target dev='vda' bus='virtio'/>
    </disk>
    {"<disk type='file' device='cdrom'><driver name='qemu' type='raw'/><source file='" + vm.iso_path + "'/><target dev='sda' bus='sata'/></disk>" if vm.iso_path else ""}
    <interface type='network'>
      <source network='default'/>
      <model type='virtio'/>
    </interface>
    <graphics type='spice' autoport='yes'/>
  </devices>
</domain>
"""

    try:
        domain = conn.defineXML(vm_xml)
        if domain is None:
            conn.close()
            raise HTTPException(status_code=500, detail="Failed to define VM")
        domain.create()
    except libvirt.libvirtError as e:
        conn.close()
        raise HTTPException(status_code=500, detail=f"Libvirt error: {e}")

    conn.close()
    return {
        "message": f"VM '{vm.name}' created and started successfully",
        "disk_path": disk_path
    }

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


