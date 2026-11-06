import asyncio
import os
import sys
from unittest.mock import AsyncMock, MagicMock, patch

root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if root_dir not in sys.path:
    sys.path.insert(0, root_dir)

import pytest
from aiogram import Bot
from bot.config import config
from bot.api_client import api_client, NestApiClient
from bot.services.scheduler import (
    setup_scheduler,
    send_appointment_reminders,
    dispatch_daily_doctor_schedules,
)
from bot.services.notifier import notify_staff_cancellation
from bot.keyboards.inline import (
    get_appointment_actions_keyboard,
    get_date_picker_keyboard,
    get_time_slots_keyboard,
    get_cancel_confirm_keyboard,
    get_doctors_keyboard,
)
from bot.keyboards.reply import get_contact_keyboard, get_main_menu_keyboard


@pytest.mark.asyncio
async def test_bot_flows():
    print("--- RUNNING TELEGRAM BOT UNIT & FLOW TEST SUITE ---", flush=True)

    # 1. Test Keyboards
    contact_kb = get_contact_keyboard()
    assert len(contact_kb.keyboard) == 1
    print(" [PASS] Contact sharing keyboard generated", flush=True)

    main_menu_kb = get_main_menu_keyboard()
    assert len(main_menu_kb.keyboard) == 3
    print(" [PASS] Main menu keyboard generated (Qabullarim, Davolash rejasi, Qarzdorlik, Booking)", flush=True)

    doctors_kb = get_doctors_keyboard([{"id": "doc-1", "name": "Dr. Jasur Mansurov", "spec": "Terapevt"}])
    assert len(doctors_kb.inline_keyboard) == 2
    print(" [PASS] Doctor selection inline keyboard generated", flush=True)

    date_kb = get_date_picker_keyboard()
    assert len(date_kb.inline_keyboard) == 3
    print(" [PASS] Date picker inline keyboard generated", flush=True)

    slots_kb = get_time_slots_keyboard(["09:00", "10:00", "11:00", "14:00"])
    assert len(slots_kb.inline_keyboard) >= 2
    print(" [PASS] Time slots inline keyboard generated", flush=True)

    # 2. Test Mock Bot & Staff Notifier
    mock_bot = MagicMock(spec=Bot)
    mock_bot.send_message = AsyncMock()

    await notify_staff_cancellation(
        bot=mock_bot,
        doctor_name="Dr. Jasur Mansurov",
        date_str="01.11.2026",
        time_str="10:00",
    )
    assert mock_bot.send_message.called
    assert "Aziz" not in mock_bot.send_message.await_args.kwargs["text"]
    print(" [PASS] Staff cancellation alert dispatched to group", flush=True)

    # 3. Test APScheduler setup
    scheduler = setup_scheduler(mock_bot)
    assert scheduler.get_job("check_appointment_reminders") is not None
    assert scheduler.get_job("daily_doctor_schedule_dispatch") is not None
    print(" [PASS] APScheduler jobs registered: 24h/2h reminders + 08:00 AM daily doctor dispatch", flush=True)

    # 4. Test API Client Configuration & Service Token Contract
    client = NestApiClient(base_url="http://localhost:3001/api", service_token="custom_service_secret")
    assert client.base_url == "http://localhost:3001/api"
    assert client.headers["X-Service-Token"] == "custom_service_secret"
    assert client.headers["Content-Type"] == "application/json"
    print(" [PASS] NestApiClient service token contract verified", flush=True)

    # 5. Test Scheduler Runners with Mocked API Responses
    with patch.object(api_client, "claim_reminders", new_callable=AsyncMock) as mock_claim, \
         patch.object(api_client, "report_job_failure", new_callable=AsyncMock) as mock_report:

        # 5a. Claimed reminder is actually sent to the patient's Telegram chat, HTML-escaped
        mock_bot.send_message.reset_mock()
        mock_claim.return_value = [
            {
                "id": "appt-1",
                "jobId": "job-1",
                "telegramUserId": "123456789",
                "patientName": "Aziz <Rahimov>",
                "doctorName": "Dr. Jasur Mansurov",
                "dateStr": "07.11.2026",
                "timeStr": "10:00",
                "window": "24h",
            }
        ]
        await send_appointment_reminders(mock_bot)
        mock_bot.send_message.assert_awaited_once()
        kwargs = mock_bot.send_message.await_args.kwargs
        assert kwargs["chat_id"] == 123456789
        assert "07.11.2026" in kwargs["text"] and "10:00" in kwargs["text"]
        assert "&lt;Rahimov&gt;" in kwargs["text"]
        mock_report.assert_not_awaited()
        print(" [PASS] 24h reminder delivered to patient chat with escaped HTML", flush=True)

        # 5b. Delivery failure (e.g. patient blocked bot) is reported back to the backend
        mock_bot.send_message.reset_mock()
        mock_bot.send_message.side_effect = Exception("Forbidden: bot was blocked by the user")
        await send_appointment_reminders(mock_bot)
        mock_report.assert_awaited_once_with("job-1", "Forbidden: bot was blocked by the user")
        mock_bot.send_message.side_effect = None
        print(" [PASS] Failed reminder delivery reported to backend outbox", flush=True)

        # 5c. Nothing claimed (already sent) -> nothing sent
        mock_bot.send_message.reset_mock()
        mock_claim.return_value = []
        await send_appointment_reminders(mock_bot)
        mock_bot.send_message.assert_not_awaited()
        print(" [PASS] Already-claimed reminders are not re-sent", flush=True)

    with patch.object(api_client, "claim_daily_schedule_digest", new_callable=AsyncMock) as mock_digest, \
         patch.object(api_client, "claim_doctor_daily_schedules", new_callable=AsyncMock) as mock_doctor_claim:
        mock_doctor_claim.return_value = []
        # 5d. Claimed digest is posted to the staff group without patient names
        mock_bot.send_message.reset_mock()
        mock_digest.return_value = {
            "claimed": True,
            "jobId": "job-2",
            "date": "2026-11-06",
            "doctors": [
                {
                    "doctorId": "doc-1",
                    "doctorName": "Dr. Jasur Mansurov",
                    "appointments": [{"id": "appt-1", "time": "10:00", "serviceName": "Konsultatsiya"}],
                }
            ],
        }
        await dispatch_daily_doctor_schedules(mock_bot)
        mock_bot.send_message.assert_awaited_once()
        kwargs = mock_bot.send_message.await_args.kwargs
        assert kwargs["chat_id"] == config.STAFF_GROUP_CHAT_ID
        assert "Dr. Jasur Mansurov" in kwargs["text"] and "10:00" in kwargs["text"]
        print(" [PASS] Daily schedule digest posted to staff group", flush=True)

        # 5e. Digest already sent today -> no second message
        mock_bot.send_message.reset_mock()
        mock_digest.return_value = {"claimed": False, "jobId": None, "date": "2026-11-06", "doctors": []}
        await dispatch_daily_doctor_schedules(mock_bot)
        mock_bot.send_message.assert_not_awaited()
        print(" [PASS] Daily digest sent at most once per day", flush=True)

        # 5f. Doctors with a linked Telegram ID get their own schedule (with patient names) privately
        mock_bot.send_message.reset_mock()
        mock_doctor_claim.return_value = [
            {
                "jobId": "job-3",
                "telegramUserId": "555000111",
                "doctorName": "Dr. Jasur Mansurov",
                "date": "2026-11-06",
                "appointments": [{"id": "appt-1", "time": "10:00", "patientName": "Aziz Rahimov", "serviceName": "Konsultatsiya"}],
            }
        ]
        await dispatch_daily_doctor_schedules(mock_bot)
        mock_bot.send_message.assert_awaited_once()  # group digest already claimed (5e)
        kwargs = mock_bot.send_message.await_args.kwargs
        assert kwargs["chat_id"] == 555000111
        assert "Aziz Rahimov" in kwargs["text"] and "10:00" in kwargs["text"]
        print(" [PASS] Doctor personal schedule delivered to private chat", flush=True)

    # 5g. /myid shows the user's Telegram ID for staff linking
    from bot.handlers.common import show_my_telegram_id
    myid_msg = MagicMock()
    myid_msg.from_user.id = 987654321
    myid_msg.answer = AsyncMock()
    await show_my_telegram_id(myid_msg)
    assert "987654321" in myid_msg.answer.await_args.args[0]
    print(" [PASS] /myid returns the caller's Telegram ID", flush=True)

    # 6. Test Security: Reject Foreign / Forged Contact
    from aiogram.types import Contact, User, Message
    from bot.handlers.start import handle_contact

    forged_contact_msg = MagicMock(spec=Message)
    forged_contact_msg.from_user = User(id=11111, is_bot=False, first_name="Attacker")
    forged_contact_msg.contact = Contact(phone_number="+998901234567", first_name="Victim", user_id=99999)
    forged_contact_msg.answer = AsyncMock()

    with patch.object(api_client, "sync_patient", new_callable=AsyncMock) as mock_sync:
        mock_sync.return_value = {"id": "victim-id", "fullName": "Victim", "phone": "+998901234567", "totalDebt": 0}
        await handle_contact(forged_contact_msg)
        assert not mock_sync.called, "CRITICAL VULNERABILITY: Foreign contact was synced without user_id validation!"
        print(" [PASS] Foreign contact sharing rejected safely", flush=True)

    # 7. Test Security: Authentic Own-Contact Accepted and Passed with Telegram User ID
    valid_contact_msg = MagicMock(spec=Message)
    valid_contact_msg.from_user = User(id=11111, is_bot=False, first_name="RealUser")
    valid_contact_msg.contact = Contact(phone_number="+998901234567", first_name="RealUser", user_id=11111)
    valid_contact_msg.answer = AsyncMock()

    with patch.object(api_client, "sync_patient", new_callable=AsyncMock) as mock_sync:
        mock_sync.return_value = {
            "id": "real-id",
            "fullName": "RealUser",
            "phone": "+998901234567",
            "telegramUserId": "11111",
            "totalDebt": 0,
        }
        await handle_contact(valid_contact_msg)
        assert mock_sync.called
        mock_sync.assert_called_with("+998901234567", "RealUser", "11111")
        print(" [PASS] Authentic own-contact sharing accepted and synced with telegram_user_id", flush=True)

    # 8. Test Patient Portal: View Appointments
    from bot.handlers.patient import show_my_appointments, show_debt_status
    from bot.handlers.booking import handle_confirm_cancel
    from aiogram.types import CallbackQuery

    appt_msg = MagicMock(spec=Message)
    appt_msg.from_user = User(id=11111, is_bot=False, first_name="RealUser")
    appt_msg.answer = AsyncMock()

    with patch.object(api_client, "get_patient_appointments", new_callable=AsyncMock) as mock_get_appts:
        mock_get_appts.return_value = [
            {
                "id": "appt-xyz",
                "doctorName": "Dr. Jasur Mansurov",
                "specialization": "Stomatolog",
                "date": "2026-11-10",
                "time": "14:00",
                "status": "CONFIRMED",
                "notes": "Davolash",
            }
        ]
        await show_my_appointments(appt_msg)
        assert mock_get_appts.called
        mock_get_appts.assert_called_with("11111")
        assert appt_msg.answer.called
        call_text = appt_msg.answer.call_args[0][0]
        assert "Dr. Jasur Mansurov" in call_text
        assert "2026-11-10" in call_text
        print(" [PASS] Patient appointments portal flow verified with telegram_user_id scoping", flush=True)

    # 9. Test Patient Portal: View Debts
    debt_msg = MagicMock(spec=Message)
    debt_msg.from_user = User(id=11111, is_bot=False, first_name="RealUser")
    debt_msg.answer = AsyncMock()

    with patch.object(api_client, "get_patient_debt", new_callable=AsyncMock) as mock_get_debt:
        mock_get_debt.return_value = {
            "patientName": "RealUser",
            "totalDebt": 250000,
        }
        await show_debt_status(debt_msg)
        assert mock_get_debt.called
        mock_get_debt.assert_called_with("11111")
        assert debt_msg.answer.called
        debt_text = debt_msg.answer.call_args[0][0]
        assert "250,000 so'm" in debt_text
        print(" [PASS] Patient debt portal flow verified with telegram_user_id scoping", flush=True)

    # 10. Test Patient Portal: Cancel Appointment with Ownership Validation
    cancel_cb = MagicMock(spec=CallbackQuery)
    cancel_cb.data = "confirm_cancel:appt-xyz"
    cancel_cb.from_user = User(id=11111, is_bot=False, first_name="RealUser")
    cancel_cb.message = MagicMock()
    cancel_cb.message.edit_text = AsyncMock()
    cancel_cb.answer = AsyncMock()
    cancel_cb.bot = mock_bot

    with patch.object(api_client, "cancel_appointment", new_callable=AsyncMock) as mock_cancel_api, \
         patch("bot.handlers.booking.notify_staff_cancellation", new_callable=AsyncMock) as mock_notify_cancel:
        mock_cancel_api.return_value = {
            "success": True,
            "patientName": "RealUser",
            "doctorName": "Dr. Jasur Mansurov",
            "startTime": "2026-11-10T09:00:00Z",
            "dateStr": "10.11.2026",
            "timeStr": "14:00",
        }
        await handle_confirm_cancel(cancel_cb)
        assert mock_cancel_api.called
        mock_cancel_api.assert_called_with("appt-xyz", "11111")
        assert cancel_cb.message.edit_text.called
        assert mock_notify_cancel.called
        notify_kwargs = mock_notify_cancel.await_args.kwargs
        assert notify_kwargs["time_str"] == "14:00"  # clinic-local, not UTC
        assert "patient_name" not in notify_kwargs
        print(" [PASS] Patient cancel flow verified with ownership & staff alert", flush=True)

    print("--- ALL TELEGRAM BOT FLOW TESTS PASSED SUCCESSFULLY! ---", flush=True)


if __name__ == "__main__":
    asyncio.run(test_bot_flows())
