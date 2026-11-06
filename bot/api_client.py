import logging
import time
from typing import Any, Dict, List, Optional, Tuple
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
        self._clinic_cache: Optional[Tuple[float, Dict[str, Any]]] = None

    async def _get(self, path: str, params: Optional[Dict[str, Any]] = None) -> Any:
        url = f"{self.base_url}{path}"
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.get(url, headers=self.headers, params=params)
                if res.status_code == 404 and path.startswith("/bot/patient/"):
                    return None  # Telegram user not linked to a patient yet
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

    async def get_slots(
        self, date_str: str, doctor_id: str, service_id: str, branch_id: str
    ) -> List[Dict[str, str]]:
        """Returns [{"time": "HH:mm" (clinic-local), "startTime": UTC ISO}, ...]."""
        res = await self._get(
            "/bot/slots",
            params={"date": date_str, "doctorId": doctor_id, "serviceId": service_id, "branchId": branch_id},
        )
        if isinstance(res, dict) and isinstance(res.get("slotTimes"), list):
            return res["slotTimes"]
        return []

    async def sync_patient(
        self, phone: str, full_name: str, telegram_user_id: str, language: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        payload = {"phone": phone, "fullName": full_name, "telegramUserId": telegram_user_id}
        if language:
            payload["language"] = language
        return await self._post("/bot/patient/sync", payload)

    async def set_patient_language(self, telegram_user_id: str, language: str) -> None:
        await self._post(f"/bot/patient/{telegram_user_id}/language", {"language": language})

    async def link_staff_telegram(self, token: str, telegram_user_id: str) -> Optional[Dict[str, Any]]:
        return await self._post("/bot/staff/link", {"token": token, "telegramUserId": telegram_user_id})

    async def get_clinic_info(self) -> Optional[Dict[str, Any]]:
        """Clinic contacts and active branches; cached for 5 minutes."""
        now = time.monotonic()
        if self._clinic_cache and now - self._clinic_cache[0] < 300:
            return self._clinic_cache[1]
        res = await self._get("/bot/clinic-info")
        if isinstance(res, dict):
            self._clinic_cache = (now, res)
            return res
        return self._clinic_cache[1] if self._clinic_cache else None

    async def get_patient_appointments(self, telegram_user_id: str) -> Optional[List[Dict[str, Any]]]:
        """None when the Telegram user is not linked to a patient."""
        res = await self._get(f"/bot/patient/{telegram_user_id}/appointments")
        return res if isinstance(res, list) or res is None else []

    async def get_patient_treatment_plan(self, telegram_user_id: str) -> Optional[List[Dict[str, Any]]]:
        """None when the Telegram user is not linked to a patient."""
        res = await self._get(f"/bot/patient/{telegram_user_id}/treatment-plan")
        return res if isinstance(res, list) or res is None else []

    async def get_patient_debt(self, telegram_user_id: str) -> Optional[Dict[str, Any]]:
        return await self._get(f"/bot/patient/{telegram_user_id}/debt")

    async def create_booking(
        self,
        doctor_id: str,
        branch_id: str,
        service_id: str,
        start_time: str,
        telegram_user_id: str,
        notes: str = "Telegram bot orqali band qilindi",
    ) -> Optional[Dict[str, Any]]:
        """start_time must be the exact UTC ISO instant from get_slots()."""
        payload = {
            "doctorId": doctor_id,
            "branchId": branch_id,
            "serviceId": service_id,
            "startTime": start_time,
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

    async def claim_reminders(self) -> List[Dict[str, Any]]:
        """Claims due 24h reminders; the backend returns each one only once."""
        res = await self._post("/bot/reminders/claim", {})
        return res if isinstance(res, list) else []

    async def claim_daily_schedule_digest(self, recipient: str) -> Optional[Dict[str, Any]]:
        """Claims today's staff digest; returns {"claimed": False} if already sent today."""
        return await self._post("/bot/daily-schedules/claim", {"recipient": recipient})

    async def claim_doctor_daily_schedules(self) -> List[Dict[str, Any]]:
        """Claims today's personal schedule for each doctor with a linked Telegram chat."""
        res = await self._post("/bot/daily-schedules/doctors/claim", {})
        return res if isinstance(res, list) else []

    async def report_job_failure(self, job_id: str, error: str) -> None:
        await self._post(f"/bot/jobs/{job_id}/failed", {"error": error[:1000]})


api_client = NestApiClient()
