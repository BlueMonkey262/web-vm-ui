from fastapi import APIRouter, HTTPException
import os
import libvirt

from libvirt_utils import get_libvirt_conn
from config import VM_IMAGE_DIR

router = APIRouter()


@router.get("/{vm_name}/disks", summary="List disk image paths for a VM", tags=["vms"])
def get_vm_disks(vm_name: str):
    """
    Return a JSON object { "disks": ["/path/to/disk1.qcow2", ...] } by listing qcow2 files
    from the configured VM_IMAGE_DIR. The endpoint still verifies that the VM exists,
    but it does not accept arbitrary paths from the client.
    """
    conn = get_libvirt_conn()
    try:
        try:
            # verify VM exists; return 404 if not
            conn.lookupByName(vm_name)
        except libvirt.libvirtError:
            raise HTTPException(status_code=404, detail=f"VM '{vm_name}' not found")

        try:
            # List qcow2 images in the configured directory
            images = []
            # Ensure directory exists and is readable
            for fname in sorted(os.listdir(VM_IMAGE_DIR)):
                if fname and fname.lower().endswith(".qcow2"):
                    images.append(os.path.join(VM_IMAGE_DIR, fname))
            return {"disks": images}
        except FileNotFoundError:
            raise HTTPException(status_code=500, detail=f"Image directory not found: {VM_IMAGE_DIR}")
        except PermissionError:
            raise HTTPException(status_code=500, detail=f"Permission denied reading image directory: {VM_IMAGE_DIR}")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to read images: {e}")
    finally:
        try:
            conn.close()
        except Exception:
            pass
