import libvirt

def get_libvirt_conn():
    conn = libvirt.open("qemu:///system")
    if conn is None:
        raise RuntimeError("Failed to open connection to qemu:///system")
    return conn
