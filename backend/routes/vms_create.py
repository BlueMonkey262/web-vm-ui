from fastapi import APIRouter, HTTPException
import os
import subprocess
import libvirt

from libvirt_utils import get_libvirt_conn
from schemas_local import VMCreateRequest
from config import VM_IMAGE_DIR

router = APIRouter()

@router.post("/create")
def create_vm(vm: VMCreateRequest):
    conn = get_libvirt_conn()

    try:
        _ = conn.lookupByName(vm.name)
        conn.close()
        raise HTTPException(400, f"VM '{vm.name}' already exists")
    except libvirt.libvirtError:
        pass

    disk_path = os.path.join(VM_IMAGE_DIR, f"{vm.name}.qcow2")
    try:
        subprocess.run(
            ["qemu-img", "create", "-f", "qcow2", disk_path, f"{vm.disk_gb}G"],
            check=True
        )
    except Exception as e:
        conn.close()
        raise HTTPException(500, f"Failed to create disk: {e}")

    iso_section = (
        f"<disk type='file' device='cdrom'><driver name='qemu' type='raw'/><source file='{vm.iso_path}'/><target dev='sda' bus='sata'/></disk>"
        if vm.iso_path
        else ""
    )

    boot_type = "<boot dev='cdrom'/>" if vm.iso_path else "<boot dev='hd'/>"

    xml = f"""
<domain type='kvm'>
  <name>{vm.name}</name>
  <memory unit='MiB'>{vm.memory_mb}</memory>
  <vcpu>{vm.vcpus}</vcpu>
  <os>
    <type arch='x86_64' machine='pc'>hvm</type>
    {boot_type}
  </os>
  <devices>
    <disk type='file' device='disk'>
      <driver name='qemu' type='qcow2'/>
      <source file='{disk_path}'/>
      <target dev='vda' bus='virtio'/>
    </disk>
    {iso_section}
    <interface type='network'>
      <source network='default'/>
      <model type='virtio'/>
    </interface>
    <graphics type='spice' autoport='yes'/>
  </devices>
</domain>
"""

    try:
        domain = conn.defineXML(xml)
        if domain is None:
            conn.close()
            raise HTTPException(500, "Failed to define VM")

        domain.create()
    except libvirt.libvirtError as e:
        conn.close()
        raise HTTPException(500, f"Libvirt error: {e}")

    conn.close()
    return {"message": f"VM '{vm.name}' created and started", "disk_path": disk_path}
