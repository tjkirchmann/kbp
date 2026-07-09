"""S3 access for the file library.

The single place that knows about endpoints. Two clients exist because, under
Docker, the backend reaches MinIO at an internal host (``s3_endpoint_url``,
e.g. ``http://minio:9000``) while the browser cannot — anything *presigned for
the browser* (upload POST, download GET) must be signed against a host the
browser can resolve (``s3_public_endpoint_url``, e.g. ``http://localhost:9000``).
The presigned signature is bound to the host, so we cannot sign internally and
rewrite the URL afterward. In prod both endpoints are empty → boto3 talks to
real AWS for everything and the two clients are equivalent.
"""

import re
import uuid
from functools import lru_cache

import boto3
from botocore.client import Config
from botocore.exceptions import ClientError

from app.core.config import settings


def _make_client(endpoint_url: str):
    return boto3.client(
        "s3",
        region_name=settings.s3_region,
        endpoint_url=endpoint_url or None,
        aws_access_key_id=settings.aws_access_key_id or None,
        aws_secret_access_key=settings.aws_secret_access_key or None,
        config=Config(signature_version="s3v4"),
    )


@lru_cache(maxsize=1)
def _internal_client():
    """Server-side ops (head_object, delete_object)."""
    return _make_client(settings.s3_endpoint_url)


@lru_cache(maxsize=1)
def _public_client():
    """Presigning for URLs the browser will hit (upload POST, download GET)."""
    return _make_client(settings.s3_public_endpoint_url)


_SAFE = re.compile(r"[^A-Za-z0-9._-]+")


def _sanitize(name: str) -> str:
    cleaned = _SAFE.sub("_", name).strip("_")
    return (cleaned[:200]) or "file"


def build_key(original_name: str) -> str:
    """``library/{uuid4}/{sanitized_original_name}`` — collision-free, debuggable."""
    return f"library/{uuid.uuid4()}/{_sanitize(original_name)}"


def build_artifact_key(run_id: int, node_id: str, filename: str) -> str:
    """``artifacts/{run_id}/{node_id}/{uuid4}/{filename}`` — pipeline outputs,
    namespaced away from ``library/`` so the library stays clean."""
    return (
        f"artifacts/{run_id}/{_sanitize(node_id)}/{uuid.uuid4()}/{_sanitize(filename)}"
    )


def create_presigned_post(key: str, content_type: str | None) -> dict:
    """Presigned POST for a direct browser→S3 upload.

    The policy enforces a max object size server-side, so S3 itself rejects an
    oversized upload before any bytes are accepted as the object.
    """
    fields: dict = {}
    conditions: list = [["content-length-range", 0, settings.library_max_upload_bytes]]
    if content_type:
        fields["Content-Type"] = content_type
        conditions.append({"Content-Type": content_type})
    return _public_client().generate_presigned_post(
        Bucket=settings.s3_bucket_name,
        Key=key,
        Fields=fields,
        Conditions=conditions,
        ExpiresIn=3600,
    )


def head_object(key: str) -> dict | None:
    """S3 truth for an object, or ``None`` if it doesn't exist."""
    try:
        resp = _internal_client().head_object(Bucket=settings.s3_bucket_name, Key=key)
    except ClientError as e:
        if e.response.get("Error", {}).get("Code") in ("404", "NoSuchKey", "NotFound"):
            return None
        raise
    return {
        "size": resp.get("ContentLength"),
        "etag": (resp.get("ETag") or "").strip('"') or None,
        "content_type": resp.get("ContentType"),
    }


def create_presigned_get(key: str, download_name: str) -> str:
    """Short-lived download URL forcing a download with the original filename."""
    safe = download_name.replace('"', "")
    return _public_client().generate_presigned_url(
        "get_object",
        Params={
            "Bucket": settings.s3_bucket_name,
            "Key": key,
            "ResponseContentDisposition": f'attachment; filename="{safe}"',
        },
        ExpiresIn=300,
    )


def create_internal_presigned_get(key: str) -> str:
    """Short-lived GET URL for *server-side* consumers (e.g. ffprobe running in
    the backend container). Signed against the internal endpoint the container
    can resolve — unlike ``create_presigned_get``, which targets the browser
    host. Plain object fetch, no content-disposition override."""
    return _internal_client().generate_presigned_url(
        "get_object",
        Params={"Bucket": settings.s3_bucket_name, "Key": key},
        ExpiresIn=300,
    )


def delete_object(key: str) -> None:
    """Hard delete (purge only)."""
    _internal_client().delete_object(Bucket=settings.s3_bucket_name, Key=key)


def download_file(key: str, dest) -> None:
    """Server-side object fetch to a local path (pipeline step inputs).
    Blocking boto3 call — run in a thread from async code."""
    _internal_client().download_file(settings.s3_bucket_name, key, str(dest))


def upload_file(key: str, path, content_type: str | None = None) -> None:
    """Server-side file upload (pipeline artifacts). Multipart is automatic.
    Blocking boto3 call — run in a thread from async code."""
    extra = {"ContentType": content_type} if content_type else None
    _internal_client().upload_file(
        str(path), settings.s3_bucket_name, key, ExtraArgs=extra
    )


def create_preview_presigned_get(key: str) -> str:
    """Browser-facing inline GET (artifact preview: <video>/<img>/<audio> src).
    Longer expiry than downloads so a long video can finish playing; no
    content-disposition override → renders inline instead of downloading."""
    return _public_client().generate_presigned_url(
        "get_object",
        Params={"Bucket": settings.s3_bucket_name, "Key": key},
        ExpiresIn=3600,
    )
