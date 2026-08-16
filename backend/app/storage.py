import boto3

from app.config import settings

_client = boto3.client(
    "s3",
    endpoint_url=settings.s3_endpoint_url,
    aws_access_key_id=settings.s3_access_key_id,
    aws_secret_access_key=settings.s3_secret_access_key,
    region_name=settings.s3_region,
)


def ensure_bucket() -> None:
    existing = {b["Name"] for b in _client.list_buckets().get("Buckets", [])}
    if settings.s3_bucket in existing:
        return

    # R2/MinIO ignore region constraints; AWS S3 rejects one for us-east-1 and
    # requires one everywhere else — only pass it for a real non-default AWS region.
    if settings.s3_region in (None, "auto", "us-east-1"):
        _client.create_bucket(Bucket=settings.s3_bucket)
    else:
        _client.create_bucket(
            Bucket=settings.s3_bucket,
            CreateBucketConfiguration={"LocationConstraint": settings.s3_region},
        )


def upload_original(song_id: str, filename: str, content: bytes) -> str:
    key = f"songs/{song_id}/original/{filename}"
    _client.put_object(Bucket=settings.s3_bucket, Key=key, Body=content)
    return key


def delete_object(key: str) -> None:
    _client.delete_object(Bucket=settings.s3_bucket, Key=key)


def presigned_url(key: str, expires_in: int = 3600) -> str:
    return _client.generate_presigned_url(
        "get_object",
        Params={"Bucket": settings.s3_bucket, "Key": key},
        ExpiresIn=expires_in,
    )
