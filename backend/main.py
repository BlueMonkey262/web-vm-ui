# Simple FastAPI app entrypoint: configure CORS and mount VM-related routers.

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routes.vms_list import router as vms_list_router
from routes.vms_edit import router as vms_edit_router
from routes.vms_create import router as vms_create_router
from routes.vms_control import router as vms_control_router
from routes.get_sys_info import router as sys_router
from routes.vms_disks import router as vms_disks_router




app = FastAPI()

# Allow all origins during development; restrict this in production deployments.
origins = ["*"]  # adjust in production

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for development
    allow_credentials=False,  # Set to False when using allow_origins=["*"]
    allow_methods=["*"],
    allow_headers=["*"],
)

# Fallback middleware: ensure Access-Control-Allow-Origin header is present on all responses.
# This helps when the server is reached by the browser but some proxy/middleware strip CORS headers.
@app.middleware("http")
async def add_cors_header(request, call_next):
    response = await call_next(request)
    # only add header if missing; keep any other headers already set
    if "access-control-allow-origin" not in {k.lower() for k in response.headers.keys()}:
        response.headers["Access-Control-Allow-Origin"] = "*"
    return response

# Mount VM-related routes under the "/vms" prefix so the API is grouped.
app.include_router(vms_list_router, prefix="/vms")
app.include_router(vms_edit_router, prefix="/vms")
app.include_router(vms_create_router, prefix="/vms")
app.include_router(vms_control_router, prefix="/vms")
app.include_router(sys_router, prefix="/sys")
app.include_router(vms_disks_router, prefix="/vms")

# Ensure a placeholder favicon is present at the project root so the separate static server can serve it.
import os
project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
favicon_path = os.path.join(project_root, "favicon.ico")
if not os.path.exists(favicon_path):
    # create an empty file as a harmless placeholder
    open(favicon_path, "wb").close()

# If the user runs this module directly (python main.py), start uvicorn and bind to 0.0.0.0 so
# the API is reachable from other hosts on the LAN (e.g. the browser at 192.168.x.x).
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
