from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
import libvirt
import xml.etree.ElementTree as ET
from pydantic import BaseModel
import os
import list_vms, memory_edit


app = FastAPI()

STATE_NAMES = {
    0: "No State",
    1: "Running",
    2: "Blocked",
    3: "Paused",
    4: "Shutdown",
    5: "Shut off",
    6: "Crashed",
    7: "PM Suspended",
}

def get_libvirt_connection(): #The helper function to grab the libvirt connection
    conn = libvirt.open("qe:///system")
    if not conn:
        raise RuntimeError(f"Could not connect to libvirt")
    return conn

@app.get("/vms") #List the VMs available, no permissions yet (Sorry :/)
def vms():
    return list_vms()

@app.put("/vms/{vm_name}/mem_edit")
async def update_vm_memory(vm_name: str, request: Request):
    await memory_edit.update_vm_memory(vm_name, request)
