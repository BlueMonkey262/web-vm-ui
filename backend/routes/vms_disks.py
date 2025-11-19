from fastapi import APIRouter, HTTPException
import xml.etree.ElementTree as ET
import libvirt

from libvirt_utils import get_libvirt_conn

router = APIRouter()


@router.get("/{vm_name}/disks", summary="List disk image paths for a VM", tags=["vms"])
def get_vm_disks(vm_name: str):
    """
    Return a JSON object { "disks": ["/path/to/disk1.qcow2", ...] } by parsing the domain XML.
    """
    conn = get_libvirt_conn()
    try:
        try:
            dom = conn.lookupByName(vm_name)
        except libvirt.libvirtError:
            raise HTTPException(status_code=404, detail=f"VM '{vm_name}' not found")

        try:
            xml = dom.XMLDesc()
            root = ET.fromstring(xml)
            disks = []
            # libvirt domain XML: devices/disk elements with source attributes
            for disk in root.findall(".//devices/disk"):
                src = disk.find("source")
                if src is None:
                    continue
                # common attributes: file (file path), dev, name, path
                for attr in ("file", "dev", "name", "path"):
                    val = src.get(attr)
                    if val:
                        disks.append(val)
                        break
            # dedupe while preserving order
            seen = set()
            unique = []
            for d in disks:
                if d not in seen:
                    seen.add(d)
                    unique.append(d)
            return {"disks": unique}
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to parse domain XML: {e}")
    finally:
        try:
            conn.close()
        except Exception:
            pass

