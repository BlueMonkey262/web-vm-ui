# Endpoint to list defined VMs with parsed metadata (status, memory, vCPUs, spice port).
from fastapi import APIRouter
import xml.etree.ElementTree as ET

from libvirt_utils import get_libvirt_conn
from config import STATE_NAMES

router = APIRouter()

@router.get("/")
def list_vms():
    # Query libvirt for all domains and extract a small summary for each.
    conn = get_libvirt_conn()
    domains = conn.listAllDomains()

    vms = []
    for domain in domains:
        state, _ = domain.state()
        info = {
            "name": domain.name(),
            "status": STATE_NAMES.get(state, "Unknown"),
            "port": None,
            "memory_mb": None,
            "vcpus": None,
        }

        # Parse domain XML to extract graphics port, memory (with unit handling), and vCPUs.
        xml = domain.XMLDesc()
        try:
            root = ET.fromstring(xml)

            graphics = root.find(".//graphics[@type='spice']")
            if graphics is not None:
                port = graphics.get("port")
                if port and port != "-1":
                    # Spice uses -1 when autoport is enabled; otherwise return int port.
                    info["port"] = int(port)

            mem_elem = root.find("memory")
            if mem_elem is not None:
                mem = int(mem_elem.text)
                unit = mem_elem.get("unit", "KiB")

                # Normalize memory to MiB for the API response.
                if unit == "KiB":
                    mem //= 1024
                elif unit == "GiB":
                    mem *= 1024

                info["memory_mb"] = mem

            vcpu_elem = root.find("vcpu")
            if vcpu_elem is not None:
                info["vcpus"] = int(vcpu_elem.text)

        except ET.ParseError:
            # If XML is malformed, skip the parsed fields but still return basic info.
            pass

        vms.append(info)

    conn.close()
    return {"vms": vms}
