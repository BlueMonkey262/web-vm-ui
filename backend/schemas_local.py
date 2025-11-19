from pydantic import BaseModel

class VMEditRequest(BaseModel):
    memory_mb: int | None = None
    vcpus: int | None = None

class VMCreateRequest(BaseModel):
    name: str
    memory_mb: int
    vcpus: int
    disk_gb: int
    iso_path: str | None = None
