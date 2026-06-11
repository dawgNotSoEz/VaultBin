import pytest
import asyncio

# Helper: create a dummy encrypted payload (base64 encoded "hello")
# We don't need real encryption here – the server only stores whatever we send.
DUMMY_CIPHERTEXT = "aGVsbG8="   # "hello" in base64
DUMMY_IV = "MTIzNDU2Nzg5MGFi"   # 12 bytes, base64

@pytest.mark.asyncio
async def test_create_and_get_document(client):
    # Create a document
    res = await client.post("/api/documents", json={
        "ciphertext": DUMMY_CIPHERTEXT,
        "iv": DUMMY_IV,
        "expiry_hours": 1,
        "burn_after_reading": False
    })
    assert res.status_code == 201
    data = res.json()
    assert "doc_id" in data
    doc_id = data["doc_id"]

    # Retrieve it
    res = await client.get(f"/api/documents/{doc_id}")
    assert res.status_code == 200
    doc = res.json()
    assert doc["doc_id"] == doc_id
    assert doc["ciphertext"] == DUMMY_CIPHERTEXT
    assert doc["iv"] == DUMMY_IV
    assert doc["burn_after_reading"] is False
    assert doc["version"] == 1

@pytest.mark.asyncio
async def test_update_document(client):
    # Create first
    res = await client.post("/api/documents", json={
        "ciphertext": DUMMY_CIPHERTEXT,
        "iv": DUMMY_IV,
        "expiry_hours": 1,
        "burn_after_reading": False
    })
    doc_id = res.json()["doc_id"]

    # Update with correct version
    new_cipher = "dXBkYXRlZA=="  # "updated" in base64
    new_iv = "YWJjZGVmMTIzNDU2"  # dummy iv
    res = await client.put(f"/api/documents/{doc_id}", json={
        "ciphertext": new_cipher,
        "iv": new_iv,
        "version": 1
    })
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    assert data["new_version"] == 2

    # Retrieve and check updated values
    res = await client.get(f"/api/documents/{doc_id}")
    assert res.status_code == 200
    doc = res.json()
    assert doc["ciphertext"] == new_cipher
    assert doc["iv"] == new_iv
    assert doc["version"] == 2

@pytest.mark.asyncio
async def test_update_version_conflict(client):
    # Create
    res = await client.post("/api/documents", json={
        "ciphertext": DUMMY_CIPHERTEXT,
        "iv": DUMMY_IV,
        "expiry_hours": 1,
        "burn_after_reading": False
    })
    doc_id = res.json()["doc_id"]

    # First update (version 1 -> 2)
    await client.put(f"/api/documents/{doc_id}", json={
        "ciphertext": "c2Vjb25k",
        "iv": DUMMY_IV,
        "version": 1
    })

    # Second update with stale version 1 should fail
    res = await client.put(f"/api/documents/{doc_id}", json={
        "ciphertext": "c3RhbGU=",
        "iv": DUMMY_IV,
        "version": 1
    })
    assert res.status_code == 409
    detail = res.json().get("detail", "")
    assert "conflict" in detail.lower() or "modified" in detail.lower()

@pytest.mark.asyncio
async def test_delete_document(client):
    res = await client.post("/api/documents", json={
        "ciphertext": DUMMY_CIPHERTEXT,
        "iv": DUMMY_IV,
        "expiry_hours": 1,
        "burn_after_reading": False
    })
    doc_id = res.json()["doc_id"]

    # Delete
    res = await client.delete(f"/api/documents/{doc_id}")
    assert res.status_code == 200

    # Should be gone
    res = await client.get(f"/api/documents/{doc_id}")
    assert res.status_code == 404

@pytest.mark.asyncio
async def test_burn_after_reading(client):
    res = await client.post("/api/documents", json={
        "ciphertext": DUMMY_CIPHERTEXT,
        "iv": DUMMY_IV,
        "expiry_hours": 1,
        "burn_after_reading": True
    })
    doc_id = res.json()["doc_id"]

    # First read must succeed
    res = await client.get(f"/api/documents/{doc_id}")
    assert res.status_code == 200
    doc = res.json()
    assert doc["burn_after_reading"] is True

    # Second read should fail (404)
    res = await client.get(f"/api/documents/{doc_id}")
    assert res.status_code == 404

@pytest.mark.asyncio
async def test_expiry_hours_validation(client):
    # Too small expiry should be rejected by Pydantic (ge=1)
    res = await client.post("/api/documents", json={
        "ciphertext": DUMMY_CIPHERTEXT,
        "iv": DUMMY_IV,
        "expiry_hours": 0,
        "burn_after_reading": False
    })
    assert res.status_code == 422  # Unprocessable Entity

    # Too large (le=168)
    res = await client.post("/api/documents", json={
        "ciphertext": DUMMY_CIPHERTEXT,
        "iv": DUMMY_IV,
        "expiry_hours": 200,
        "burn_after_reading": False
    })
    assert res.status_code == 422

@pytest.mark.asyncio
async def test_invalid_base64_rejected(client):
    res = await client.post("/api/documents", json={
        "ciphertext": "!!! not base64 !!!",
        "iv": DUMMY_IV,
        "expiry_hours": 1,
        "burn_after_reading": False
    })
    assert res.status_code == 422