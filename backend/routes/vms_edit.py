# Endpoint to edit VM settings: supports changing memory and vCPUs either live or persistently.
from fastapi import APIRouter, HTTPException
import xml.etree.ElementTree as ET
import libvirt

from libvirt_utils import get_libvirt_conn
from schemas_local import VMEditRequest

router = APIRouter()

@router.post("/edit/{vm_name}")
def edit_vm(vm_name: str, changes: VMEditRequest):
    # Apply requested changes. If the domain is running, attempt live updates;
    # otherwise update the domain XML so changes take effect on next boot.
    conn = get_libvirt_conn()
    try:
        domain = conn.lookupByName(vm_name)
    except libvirt.libvirtError:
        conn.close()
        raise HTTPException(404, f"VM '{vm_name}' not found")

    state, _ = domain.state()
    messages = []

    if changes.memory_mb is not None:
        try:
            # If running, setMemory adjusts memory live (value in KiB for libvirt).
            if state == 1:
                domain.setMemory(changes.memory_mb * 1024)
                messages.append(f"Memory changed live to {changes.memory_mb} MB")
            else:
                # Modify XML for persistent change when the VM is not running.
                xml = domain.XMLDesc()
                root = ET.fromstring(xml)

                mem_elem = root.find("memory")
                if mem_elem is None:
                    mem_elem = ET.SubElement(root, "memory", unit="MiB")
                mem_elem.text = str(changes.memory_mb)
                mem_elem.set("unit", "MiB")

                cur_elem = root.find("currentMemory")
                if cur_elem is None:
                    cur_elem = ET.SubElement(root, "currentMemory", unit="MiB")
                cur_elem.text = str(changes.memory_mb)

                new_xml = ET.tostring(root).decode()
                domain.undefine()
                domain = conn.defineXML(new_xml)
                if domain is None:
                    conn.close()
                    raise HTTPException(500, "Failed to redefine VM after memory change")

                messages.append(f"Memory set to {changes.memory_mb} MB (next boot)")
        except libvirt.libvirtError as e:
            conn.close()
            raise HTTPException(500, f"Failed to change memory: {e}")

    if changes.vcpus is not None:
        try:
            # Live change if running, otherwise update XML.
            if state == 1:
                domain.setVcpus(changes.vcpus)
                messages.append(f"vCPUs changed live to {changes.vcpus}")
            else:
                xml = domain.XMLDesc()
                root = ET.fromstring(xml)

                vcpu = root.find("vcpu")
                if vcpu is None:
                    vcpu = ET.SubElement(root, "vcpu")
                vcpu.text = str(changes.vcpus)

                new_xml = ET.tostring(root).decode()
                domain.undefine()
                domain = conn.defineXML(new_xml)
                if domain is None:
                    conn.close()
                    raise HTTPException(500, "Failed to redefine VM after vCPU change")

                messages.append(f"vCPUs set to {changes.vcpus} (next boot)")
        except libvirt.libvirtError as e:
            conn.close()
            raise HTTPException(500, f"Failed to change vCPUs: {e}")

    conn.close()
    return {"message": "VM updated successfully", "details": messages}
