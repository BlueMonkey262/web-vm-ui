from fastapi import APIRouter
import os
from typing import Optional

router = APIRouter()


def _read_mem_total_kb() -> int:
    """Return total system memory in kB from /proc/meminfo, or 0 on failure."""
    try:
        with open("/proc/meminfo", "r", encoding="utf-8") as f:
            for line in f:
                if line.startswith("MemTotal:"):
                    parts = line.split()
                    if len(parts) >= 2:
                        return int(parts[1])
    except Exception:
        pass
    return 0


def _read_cpu_online_count() -> int:
    """
    Try to read /sys/devices/system/cpu/online (e.g. '0-3,5') to compute online CPUs.
    Fallback to os.cpu_count() if /sys is not available.
    """
    try:
        path = "/sys/devices/system/cpu/online"
        if os.path.exists(path):
            s = open(path, "r", encoding="utf-8").read().strip()
            if s:
                count = 0
                for part in s.split(","):
                    if "-" in part:
                        a, b = part.split("-")
                        count += int(b) - int(a) + 1
                    else:
                        # single cpu index like "0" or "5"
                        count += 1
                if count > 0:
                    return count
    except Exception:
        pass
    # Final fallback
    return os.cpu_count() or 0


@router.get("/", summary="System info", tags=["sys"])
def get_system_info():
    """
    Return basic system information useful for the UI:
    - vcpus: number of online logical CPUs
    - memory_kb: total memory in kilobytes (from /proc/meminfo)
    - memory_mb: total memory in megabytes (rounded down)
    """
    vcpus = _read_cpu_online_count()
    mem_kb = _read_mem_total_kb()
    mem_mb: Optional[int] = (mem_kb // 1024) if mem_kb else None
    return {"vcpus": vcpus, "memory_kb": mem_kb, "memory_mb": mem_mb}

