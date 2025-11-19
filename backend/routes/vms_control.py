# API endpoints for controlling VM lifecycle: start, stop, kill (force), reboot.
from fastapi import APIRouter, HTTPException
import libvirt

from libvirt_utils import get_libvirt_conn

router = APIRouter()

@router.post("/start/{vm_name}")
def start_vm(vm_name: str):
    # Start a VM by name. Returns 404 if not found, 500 on libvirt errors.
    conn = get_libvirt_conn()
    try:
        dom = conn.lookupByName(vm_name)
    except libvirt.libvirtError:
        conn.close()
        raise HTTPException(404, f"VM '{vm_name}' not found")

    state, _ = dom.state()
    if state == 1:
        conn.close()
        return {"message": "VM already running"}

    try:
        dom.create()
        conn.close()
        return {"message": "VM started"}
    except libvirt.libvirtError as e:
        conn.close()
        raise HTTPException(500, f"Failed to start VM: {e}")


@router.post("/stop/{vm_name}")
def stop_vm(vm_name: str):
    # Gracefully shutdown a VM. If already stopped, return a message.
    conn = get_libvirt_conn()
    try:
        dom = conn.lookupByName(vm_name)
    except libvirt.libvirtError:
        conn.close()
        raise HTTPException(404, f"VM '{vm_name}' not found")

    state, _ = dom.state()
    if state in (4, 5):
        conn.close()
        return {"message": "VM already stopped"}

    try:
        dom.shutdown()
        conn.close()
        return {"message": "Shutdown initiated"}
    except libvirt.libvirtError as e:
        conn.close()
        raise HTTPException(500, f"Failed to stop VM: {e}")


@router.post("/kill/{vm_name}")
def kill_vm(vm_name: str):
    # Force-stop a VM (equivalent to pulling power). Use with caution.
    conn = get_libvirt_conn()
    try:
        dom = conn.lookupByName(vm_name)
    except libvirt.libvirtError:
        conn.close()
        raise HTTPException(404, f"VM '{vm_name}' not found")

    state, _ = dom.state()
    if state in (4, 5):
        conn.close()
        return {"message": "VM already stopped"}

    try:
        dom.destroy()
        conn.close()
        return {"message": "Force stopped"}
    except libvirt.libvirtError as e:
        conn.close()
        raise HTTPException(500, f"Failed to kill VM: {e}")


@router.post("/reboot/{vm_name}")
def reboot_vm(vm_name: str):
    # Reboot a running VM. If VM is stopped, reports that it's stopped.
    conn = get_libvirt_conn()
    try:
        dom = conn.lookupByName(vm_name)
    except libvirt.libvirtError:
        conn.close()
        raise HTTPException(404, f"VM '{vm_name}' not found")

    state, _ = dom.state()
    if state in (4, 5):
        conn.close()
        return {"message": "VM is stopped"}

    try:
        dom.reboot()
        conn.close()
        return {"message": "Reboot initiated"}
    except libvirt.libvirtError as e:
        conn.close()
        raise HTTPException(500, f"Failed to reboot VM: {e}")
