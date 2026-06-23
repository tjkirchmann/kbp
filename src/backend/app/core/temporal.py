"""Single connection seam for Temporal.

Everything that talks to Temporal — the worker, starters, future FastAPI routes —
goes through `get_temporal_client()`. That keeps the local self-host vs. Temporal
Cloud difference in one place: migrating to Cloud is an env-var change (set
TEMPORAL_API_KEY + the Cloud address/namespace), not a code change.

  Local self-host:  Client.connect("temporal:7233", namespace="default")
  Temporal Cloud:   Client.connect("<ns>.<acct>.tmprl.cloud:7233",
                                   namespace="<ns>.<acct>",
                                   api_key=..., tls=True)
"""

from temporalio.client import Client

from app.core.config import settings


async def get_temporal_client() -> Client:
    """Connect to Temporal using the configured address/namespace.

    Auth/TLS are derived from settings so the same code works locally and on
    Temporal Cloud:
      - temporal_api_key set  → API-key auth over TLS (Temporal Cloud).
      - temporal_tls = True   → TLS without an API key (e.g. mTLS-fronted self-host).
      - neither               → plaintext (local docker stack).
    """
    connect_kwargs: dict = {
        "target_host": settings.temporal_address,
        "namespace": settings.temporal_namespace,
    }

    if settings.temporal_api_key:
        # Temporal Cloud API-key auth always rides on TLS.
        connect_kwargs["api_key"] = settings.temporal_api_key
        connect_kwargs["tls"] = True
    elif settings.temporal_tls:
        connect_kwargs["tls"] = True

    return await Client.connect(**connect_kwargs)
