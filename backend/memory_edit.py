from fastapi import FastAPI, HTTPException, Request
import libvirt
import main


async def update_vm_memory(vm_name: str, request: Request):
    data = await request.json()  # get the raw JSON
    try:
        memory_mib = int(data.get("memory_mib"))
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Invalid memory value")

    try:
        conn = main.get_libvirt_connection()
        domain = conn.lookupByName(vm_name)
        if domain is None:
            raise HTTPException(status_code=404, detail=f"VM '{vm_name}' not found")

        new_mem_kib = memory_mib * 1024
        if domain.isActive():
            domain.setMemoryFlags(new_mem_kib, libvirt.VIR_DOMAIN_MEM_LIVE)
        domain.setMemoryFlags(new_mem_kib, libvirt.VIR_DOMAIN_MEM_CONFIG)

        return {"name": vm_name, "new_memory_mib": memory_mib}
    except libvirt.libvirtError as e:
        raise HTTPException(status_code=500, detail=str(e))
