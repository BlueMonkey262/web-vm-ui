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
            # convert MB -> KiB for libvirt APIs / XML
            new_kib = int(changes.memory_mb) * 1024

            # If running, ensure max memory is large enough, then set live memory.
            if state == 1:
                # determine current max memory (KiB). Prefer maxMemory() if available.
                try:
                    current_max_kib = domain.maxMemory()
                except Exception:
                    info = domain.info()
                    current_max_kib = info[1] if info and len(info) > 1 else None

                # If new memory exceeds current max, raise max first.
                if current_max_kib is None or new_kib > int(current_max_kib):
                    try:
                        domain.setMaxMemory(new_kib)
                        messages.append(f"Max memory increased to {changes.memory_mb} MB")
                    except libvirt.libvirtError as e:
                        conn.close()
                        raise HTTPException(500, f"Failed to increase max memory: {e}")

                # Now set current memory (value in KiB)
                try:
                    domain.setMemory(new_kib)
                    messages.append(f"Memory changed live to {changes.memory_mb} MB")
                except libvirt.libvirtError as e:
                    conn.close()
                    raise HTTPException(500, f"Failed to change memory: {e}")

            else:
                # Modify XML for persistent change when the VM is not running.
                xml = domain.XMLDesc()
                root = ET.fromstring(xml)

                # Use KiB units in XML to avoid unit mismatch confusion.
                mem_elem = root.find("memory")
                if mem_elem is None:
                    mem_elem = ET.SubElement(root, "memory", unit="KiB")
                mem_elem.text = str(new_kib)
                mem_elem.set("unit", "KiB")

                cur_elem = root.find("currentMemory")
                if cur_elem is None:
                    cur_elem = ET.SubElement(root, "currentMemory", unit="KiB")
                cur_elem.text = str(new_kib)
                cur_elem.set("unit", "KiB")

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
