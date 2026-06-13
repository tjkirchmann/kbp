"""Async object storage over the S3 API (aioboto3).

Env-switched by settings.s3_endpoint_url: empty → real AWS S3; a MinIO URL for
local dev. The same code runs against both — only endpoint/creds differ. Keys are
content-addressed (documents/{sha256}), so re-storing identical bytes is a no-op
and extraction is idempotent.
"""
import aioboto3
from botocore.exceptions import ClientError

from app.core.config import settings


def _session() -> aioboto3.Session:
    return aioboto3.Session(
        aws_access_key_id=settings.s3_access_key_id or None,
        aws_secret_access_key=settings.s3_secret_access_key or None,
        region_name=settings.s3_region,
    )


def _client_kwargs() -> dict:
    # endpoint_url is only set for MinIO/local; omitted → boto3 uses AWS S3.
    kwargs: dict = {}
    if settings.s3_endpoint_url:
        kwargs["endpoint_url"] = settings.s3_endpoint_url
    return kwargs


async def put(key: str, data: bytes, content_type: str | None = None) -> None:
    extra = {"ContentType": content_type} if content_type else {}
    async with _session().client("s3", **_client_kwargs()) as s3:
        await s3.put_object(Bucket=settings.s3_bucket, Key=key, Body=data, **extra)


async def get(key: str) -> bytes:
    async with _session().client("s3", **_client_kwargs()) as s3:
        resp = await s3.get_object(Bucket=settings.s3_bucket, Key=key)
        async with resp["Body"] as body:
            return await body.read()


async def exists(key: str) -> bool:
    async with _session().client("s3", **_client_kwargs()) as s3:
        try:
            await s3.head_object(Bucket=settings.s3_bucket, Key=key)
            return True
        except ClientError as exc:
            if exc.response.get("Error", {}).get("Code") in ("404", "NoSuchKey", "NotFound"):
                return False
            raise


async def ensure_bucket() -> None:
    """Create the configured bucket if absent. Used for local MinIO bootstrap."""
    async with _session().client("s3", **_client_kwargs()) as s3:
        try:
            await s3.head_bucket(Bucket=settings.s3_bucket)
        except ClientError:
            await s3.create_bucket(Bucket=settings.s3_bucket)
