"""
ProofChain Python SDK
Thin wrapper around the ProofChain compliance API.
https://proofchain.us/api
"""
import urllib.request
import urllib.error
import ssl
import json
from typing import Optional

API_BASE = "https://proofchain.us/api"
DEFAULT_WALLET = "FKwU1im523MSGnuJG6YLHEZu4rUGj3xqxHJ6ipQMBG9B"

_ctx = ssl.create_default_context()

def _get(path: str, timeout: int = 30) -> dict:
    url = f"{API_BASE}{path}"
    try:
        r = urllib.request.urlopen(url, context=_ctx, timeout=timeout)
        return json.loads(r.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode() if e.fp else str(e)
        return {"error": f"HTTP {e.code}: {body[:200]}"}
    except Exception as e:
        return {"error": str(e)}


def ping() -> dict:
    """Lightweight health check — no chain dependency."""
    return _get("/ping", timeout=10)


def health() -> dict:
    """Full health check with X1 RPC status."""
    return _get("/health", timeout=30)


def agent(wallet: str = DEFAULT_WALLET) -> dict:
    """Verify agent identity via AgentID v2. Returns name, verification, NFT, registration date."""
    return _get(f"/agent/{wallet}")


def audit(wallet: str = DEFAULT_WALLET, limit: int = 25, type: Optional[str] = None) -> dict:
    """Get HXMP audit trail filtered by type (soul.snapshot, memory.bundle, etc)."""
    params = f"?limit={limit}"
    if type:
        params += f"&type={type}"
    return _get(f"/audit/{wallet}{params}")


def timeline(wallet: str = DEFAULT_WALLET, limit: int = 50) -> dict:
    """Chronological timeline of agent actions."""
    return _get(f"/audit/{wallet}/timeline?limit={limit}")


def compliance(wallet: str = DEFAULT_WALLET, framework: str = "all") -> dict:
    """Compliance report for EU AI Act, SOC2, or GDPR. Framework: eu-ai-act, soc2, gdpr, all."""
    return _get(f"/compliance/{wallet}/report?framework={framework}")


def compliance_html(wallet: str = DEFAULT_WALLET, framework: str = "all") -> str:
    """Downloadable compliance report as styled HTML (for auditor review / PDF export)."""
    url = f"{API_BASE}/compliance/{wallet}/report/pdf?framework={framework}&format=html"
    r = urllib.request.urlopen(url, context=_ctx, timeout=30)
    return r.read().decode()


# ── Quick CLI ──
if __name__ == "__main__":
    import sys
    cmds = {
        "ping": ping, "health": health, "agent": agent,
        "audit": audit, "timeline": timeline, "compliance": compliance
    }
    cmd = sys.argv[1] if len(sys.argv) > 1 else "ping"
    wallet = sys.argv[2] if len(sys.argv) > 2 else DEFAULT_WALLET
    fn = cmds.get(cmd)
    if fn:
        result = fn(wallet) if cmd in ("agent", "audit", "timeline", "compliance") else fn()
        print(json.dumps(result, indent=2))
    else:
        print(f"Usage: python proofchain.py [ping|health|agent|audit|timeline|compliance] [wallet]")
