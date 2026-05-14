import time
import redis.asyncio as aioredis

_ESPN_RATE_KEY = "espn:rate_limit"


async def acquire_espn_token(redis_client: aioredis.Redis, rate_limit_per_minute: int) -> bool:
    """
    Sliding window rate limiter. Returns True if a token was acquired (request allowed),
    False if the rate limit is already exhausted for the current 60-second window.
    """
    now = time.time()
    window_start = now - 60.0

    pipe = redis_client.pipeline()
    pipe.zremrangebyscore(_ESPN_RATE_KEY, "-inf", window_start)
    pipe.zadd(_ESPN_RATE_KEY, {str(now): now})
    pipe.zcard(_ESPN_RATE_KEY)
    pipe.expire(_ESPN_RATE_KEY, 120)
    results = await pipe.execute()

    count: int = results[2]
    if count > rate_limit_per_minute:
        # Remove the token we just added — we're over the limit
        await redis_client.zrem(_ESPN_RATE_KEY, str(now))
        return False
    return True
