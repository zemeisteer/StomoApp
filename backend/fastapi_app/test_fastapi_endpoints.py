import asyncio
import httpx
from datetime import datetime, timedelta
from app.main import app

async def test_suite():
    print("--- RUNNING FASTAPI INTEGRATION TEST SUITE ---")
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Health check
        res = await client.get("/health")
        assert res.status_code == 200, f"Health check failed: {res.text}"
        print(" [PASS] GET /health -> 200 OK")

        # 2. Login as seeded owner
        login_res = await client.post("/api/auth/login", json={
            "phone": "+998901112233",
            "password": "owner1234"
        })
        if login_res.status_code != 200:
            login_res = await client.post("/api/auth/login", json={
                "phone": "+998901234567",
                "password": "owner1234"
            })
        assert login_res.status_code == 200, f"Login failed: {login_res.text}"
        owner_token = login_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {owner_token}"}
        print(" [PASS] POST /api/auth/login -> 200 OK (JWT Received)")

        # 3. Check inventory
        inv_res = await client.get("/api/inventory", headers=headers)
        assert inv_res.status_code == 200, f"Inventory failed: {inv_res.text}"
        inv_data = inv_res.json()
        assert len(inv_data) >= 5, "Expected seeded inventory items"
        print(f" [PASS] GET /api/inventory -> 200 OK ({len(inv_data)} items loaded)")

        # 4. Restock inventory
        item_id = inv_data[0]["id"]
        patch_res = await client.patch(f"/api/inventory/{item_id}", headers=headers, json={"quantity_delta": 10})
        assert patch_res.status_code == 200, f"Restock failed: {patch_res.text}"
        print(" [PASS] PATCH /api/inventory/{id} -> 200 OK (+10 Restocked)")

        # 5. Search patients
        patients_res = await client.get("/api/patients?search=Aziz", headers=headers)
        assert patients_res.status_code == 200, f"Patients search failed: {patients_res.text}"
        patients_data = patients_res.json()
        assert len(patients_data) >= 1, "Expected at least 1 patient"
        patient_id = patients_data[0]["id"]
        print(f" [PASS] GET /api/patients?search=Aziz -> 200 OK ({len(patients_data)} patients matched)")

        # 6. Patient history & debt ledger
        history_res = await client.get(f"/api/patients/{patient_id}/history", headers=headers)
        assert history_res.status_code == 200, f"History failed: {history_res.text}"
        print(" [PASS] GET /api/patients/{id}/history -> 200 OK")

        debt_ledger_res = await client.get(f"/api/patients/{patient_id}/debt", headers=headers)
        assert debt_ledger_res.status_code == 200, f"Debt ledger failed: {debt_ledger_res.text}"
        print(" [PASS] GET /api/patients/{id}/debt -> 200 OK")

        # 7. Odontogram snapshot
        od_res = await client.get(f"/api/patients/{patient_id}/odontogram", headers=headers)
        assert od_res.status_code == 200, f"Odontogram snapshot failed: {od_res.text}"
        print(f" [PASS] GET /api/patients/{{id}}/odontogram -> 200 OK ({len(od_res.json())} records)")

        # 8. Appointments calendar feed
        appts_res = await client.get("/api/appointments", headers=headers)
        assert appts_res.status_code == 200, f"Appointments feed failed: {appts_res.text}"
        print(f" [PASS] GET /api/appointments -> 200 OK ({len(appts_res.json())} appointments)")

        # 9. Finance: Process payment
        pay_res = await client.post("/api/finance/payments", headers=headers, json={
            "patient_id": patient_id,
            "amount": 100000.0,
            "payment_method": "uzcard",
            "notes": "FastAPI Finance Test Payment"
        })
        assert pay_res.status_code == 200, f"Finance payment failed: {pay_res.text}"
        print(" [PASS] POST /api/finance/payments -> 200 OK")

        # 10. Finance: Doctor commissions & Owner KPIs
        comm_res = await client.get("/api/finance/doctor-commissions", headers=headers)
        assert comm_res.status_code == 200, f"Finance doctor commissions failed: {comm_res.text}"
        print(f" [PASS] GET /api/finance/doctor-commissions -> 200 OK ({len(comm_res.json())} docs)")

        kpi_res = await client.get("/api/finance/kpi?period=today", headers=headers)
        assert kpi_res.status_code == 200, f"Finance KPI failed: {kpi_res.text}"
        print(f" [PASS] GET /api/finance/kpi -> 200 OK (Rev: {kpi_res.json()['total_revenue']} UZS)")

    print("--- ALL FASTAPI ENDPOINT TESTS PASSED SUCCESSFULLY! ---")

if __name__ == "__main__":
    asyncio.run(test_suite())
