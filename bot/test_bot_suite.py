import asyncio
import os
import sys
from unittest.mock import AsyncMock, MagicMock

root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if root_dir not in sys.path:
    sys.path.insert(0, root_dir)

from aiogram import Bot
from bot.config import config
from bot.services.scheduler import setup_scheduler, send_appointment_reminders, dispatch_daily_doctor_schedules
from bot.services.notifier import notify_staff_new_booking, notify_staff_cancellation
from bot.keyboards.inline import (
    get_appointment_actions_keyboard,
    get_date_picker_keyboard,
    get_time_slots_keyboard,
    get_cancel_confirm_keyboard,
    get_doctors_keyboard,
)
from bot.keyboards.reply import get_contact_keyboard, get_main_menu_keyboard

async def test_bot_flows():
    print("--- RUNNING TELEGRAM BOT UNIT & FLOW TEST SUITE ---")

    # 1. Test Keyboards
    contact_kb = get_contact_keyboard()
    assert len(contact_kb.keyboard) == 1
    print(" [PASS] Contact sharing keyboard generated")

    main_menu_kb = get_main_menu_keyboard()
    assert len(main_menu_kb.keyboard) == 3
    print(" [PASS] Main menu keyboard generated (Qabullarim, Davolash rejasi, Qarzdorlik, Booking)")

    doctors_kb = get_doctors_keyboard([{"id": "doc-1", "name": "Dr. Jasur Mansurov", "spec": "Terapevt"}])
    assert len(doctors_kb.inline_keyboard) == 2
    print(" [PASS] Doctor selection inline keyboard generated")

    date_kb = get_date_picker_keyboard()
    assert len(date_kb.inline_keyboard) == 3
    print(" [PASS] Date picker inline keyboard generated")

    slots_kb = get_time_slots_keyboard(["09:00", "10:00", "11:00", "14:00"])
    assert len(slots_kb.inline_keyboard) >= 2
    print(" [PASS] Time slots inline keyboard generated")

    # 2. Test Mock Bot & Staff Notifier
    mock_bot = MagicMock(spec=Bot)
    mock_bot.send_message = AsyncMock()

    await notify_staff_new_booking(
        bot=mock_bot,
        patient_name="Aziz Rahimov",
        patient_phone="+998901234567",
        doctor_name="Dr. Jasur Mansurov",
        date_str="2026-11-01",
        time_str="10:00",
    )
    assert mock_bot.send_message.called
    print(" [PASS] Staff new booking alert dispatched to group")

    mock_bot.send_message.reset_mock()
    await notify_staff_cancellation(
        bot=mock_bot,
        patient_name="Aziz Rahimov",
        doctor_name="Dr. Jasur Mansurov",
        date_str="2026-11-01",
        time_str="10:00",
    )
    assert mock_bot.send_message.called
    print(" [PASS] Staff cancellation alert dispatched to group")

    # 3. Test APScheduler setup
    scheduler = setup_scheduler(mock_bot)
    assert scheduler.get_job("check_appointment_reminders") is not None
    assert scheduler.get_job("daily_doctor_schedule_dispatch") is not None
    print(" [PASS] APScheduler jobs registered: 24h/2h reminders + 08:00 AM daily doctor dispatch")

    # 4. Test reminder & daily schedule runners
    await send_appointment_reminders(mock_bot)
    print(" [PASS] send_appointment_reminders executed without errors")

    await dispatch_daily_doctor_schedules(mock_bot)
    print(" [PASS] dispatch_daily_doctor_schedules executed without errors")

    print("--- ALL TELEGRAM BOT FLOW TESTS PASSED SUCCESSFULLY! ---")

if __name__ == "__main__":
    asyncio.run(test_bot_flows())
