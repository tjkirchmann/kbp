import json
from datetime import datetime

STREAM_KEY = "kbp:events"
STREAM_MAXLEN = 100_000


async def log_event(redis, source: str, event: str, payload: dict) -> None:
    await redis.xadd(
        STREAM_KEY,
        {
            "ts": datetime.utcnow().isoformat(),
            "source": source,
            "event": event,
            "payload": json.dumps(payload),
        },
        maxlen=STREAM_MAXLEN,
        approximate=True,
    )
