import logging

from app.config import settings

logger = logging.getLogger(__name__)


def trigger_separation(job_id: str, song_id: str, original_key: str) -> str | None:
    """Kick off the Modal separation job for a song. Returns the Modal call ID,
    or None if the trigger itself failed (job stays 'pending' — see main.py's
    caller for the retry/visibility tradeoff this currently accepts).
    """
    try:
        import modal

        fn = modal.Function.from_name(settings.modal_app_name, "separate_stems")
        call = fn.spawn(job_id=job_id, song_id=song_id, original_key=original_key)
        return call.object_id
    except Exception:
        logger.warning("Failed to trigger separation for job %s", job_id, exc_info=True)
        return None
