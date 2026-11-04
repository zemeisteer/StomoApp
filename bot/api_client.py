import logging
from typing import Any, Dict, List, Optional
import httpx
from bot.config import config

logger = logging.getLogger(__name__)


class NestApiClient:
    def __init__(self, base_url: Optional[str] = None, service_token: Optional[str] = None):
        self.base_url = (base_url or config.API_BASE_URL).rstrip("/")
        self.service_token = service_token or config.SERVICE_TOKEN
        self.headers = {
            "Content-Type": "application/json",
            "X-Service-Token": self.service_token,
        }

    async def _get(self, path: str, params: Optional[Dict[str, Any]] = None) -> Any:
        url = f"{self.base_url}{path}"
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.get(url, headers=self.headers, params=params)
                if res.status_code >= 400:
                    logger.warning(f"GET {path} returned status {res.status_code}: {res.text}")
                    return [] if "reminders" in path or "schedules" in path or "appointments" in path or "doctors" in path else None
                return res.json()
        except Exception as e:
            logger.warning(f"Network error in GET {path}: {e}")
            return [] if "reminders" in path or "schedules" in path or "appointments" in path or "doctors" in path else None

    async def _post(self, path: str, data: Dict[str, Any]) -> Any:
        url = f"{self.base_url}{path}"
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.post(url, headers=self.headers, json=data)
                if res.status_code >= 400:
                    logger.warning(f"POST {path} returned status {res.status_code}: {res.text}")
                    return None
                return res.json()
        except Exception as e:
            logger.warning(f"Network error in POST {path}: {e}")
            return None

    async def get_doctors(self) -> List[Dict[str, Any]]:
        res = await self._get("/bot/doctors")
        return res if isinstance(res, list) else []

    async def get_slots(self, date_str: str, doctor_id: str) -> List[str]:
        res = await self._get("/bot/slots", params={"date": date_str, "doctorId": doctor_id})
        if isinstance(res, dict) and "slots" in res:
            return res["slots"]
        return []

    async def sync_patient(
        self, phone: str, full_name: str, telegram_user_id: str
    ) -> Optional[Dict[str, Any]]:
        return await self._post(
            "/bot/patient/sync",
            {
                "phone": phone,
                "fullName": full_name,
                "telegramUserId": telegram_user_id,
            },
        )

    async def get_patient_appointments(self, telegram_user_id: str) -> List[Dict[str, Any]]:
        res = await self._get(f"/bot/patient/{telegram_user_id}/appointments")
        return res if isinstance(res, list) else []

    async def get_patient_treatment_plan(self, telegram_user_id: str) -> List[Dict[str, Any]]:
        res = await self._get(f"/bot/patient/{telegram_user_id}/treatment-plan")
        return res if isinstance(res, list) else []

    async def get_patient_debt(self, telegram_user_id: str) -> Optional[Dict[str, Any]]:
        return await self._get(f"/bot/patient/{telegram_user_id}/debt")

    async def create_booking(
        self,
        doctor_id: str,
        start_time: str,
        patient_name: str,
        patient_phone: str,
        telegram_user_id: str,
        notes: str = "Telegram bot orqali band qilindi",
    ) -> Optional[Dict[str, Any]]:
        payload = {
            "doctorId": doctor_id,
            "startTime": start_time,
            "patientName": patient_name,
            "patientPhone": patient_phone,
            "telegramUserId": telegram_user_id,
            "notes": notes,
        }
        return await self._post("/bot/booking", payload)

    async def cancel_appointment(
        self, appointment_id: str, telegram_user_id: str
    ) -> Optional[Dict[str, Any]]:
        return await self._post(
            f"/bot/appointments/{appointment_id}/cancel",
            {"telegramUserId": telegram_user_id},
        )

    async def get_reminders(self) -> List[Dict[str, Any]]:
        res = await self._get("/bot/reminders")
        return res if isinstance(res, list) else []

    async def get_daily_doctor_schedules(self) -> List[Dict[str, Any]]:
        res = await self._get("/bot/daily-schedules")
        return res if isinstance(res, list) else []


api_client = NestApiClient()
