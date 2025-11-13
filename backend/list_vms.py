import main

def list_vms():
    conn = main.get_libvirt_connection() #get the libvirt connection
    domains = conn.listAllDomains() #get the domains (virtual machines) on the computer

    vms = []

    for domain in domains:
        vmInfo = {
            vms.append({
                "name": domain.name(),
                "state": domain.state(),
            })
        }
        vms.append(vmInfo)
    conn.close()
    return {"vms": vms}