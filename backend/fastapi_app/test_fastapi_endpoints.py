import asyncio
import httpx
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

        # 5. List debts
        debts_res = await client.get("/api/billing/debts", headers=headers)
        assert debts_res.status_code == 200, f"Debts failed: {debts_res.text}"
        debt_data = debts_res.json()
        print(f" [PASS] GET /api/billing/debts -> 200 OK ({len(debt_data)} debtors found)")

        if debt_data:
            pat_id = debt_data[0]["id"]
            # 6. Repay debt
            repay_res = await client.post("/api/billing/repay-debt", headers=headers, json={
                "patient_id": pat_id,
                "amount": 250000.0,
                "payment_method": "cash",
                "notes": "Test payment"
            })
            assert repay_res.status_code == 200, f"Repay debt failed: {repay_res.text}"
            print(" [PASS] POST /api/billing/repay-debt -> 200 OK (Debt deducted)")

        # 7. Owner Analytics Overview
        metrics_res = await client.get("/api/analytics/overview", headers=headers)
        assert metrics_res.status_code == 200, f"Analytics failed: {metrics_res.text}"
        metrics = metrics_res.json()
        print(f" [PASS] GET /api/analytics/overview -> 200 OK (Revenue: {metrics['total_revenue']} UZS)")

        # 8. Doctor Commissions
        comm_res = await client.get("/api/analytics/doctor-commissions", headers=headers)
        assert comm_res.status_code == 200, f"Commissions failed: {comm_res.text}"
        comm_data = comm_res.json()
        print(f" [PASS] GET /api/analytics/doctor-commissions -> 200 OK ({len(comm_data)} doctors calculated)")

    print("--- ALL FASTAPI ENDPOINT TESTS PASSED SUCCESSFULLY! ---")

if __name__ == "__main__":
    asyncio.run(test_suite())
