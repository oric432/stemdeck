def test_upload_then_list_returns_pending_job(client) -> None:
    response = client.post(
        "/songs",
        files={"file": ("practice-track.mp3", b"fake audio bytes", "audio/mpeg")},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["title"] == "practice-track.mp3"
    assert body["job_status"] == "pending"

    listed = client.get("/songs").json()
    assert len(listed) == 1
    assert listed[0]["id"] == body["id"]


def test_list_is_empty_with_no_songs(client) -> None:
    assert client.get("/songs").json() == []
