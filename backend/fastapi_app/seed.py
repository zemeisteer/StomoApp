"""
Seed script for StomoApp Dental Clinic (FastAPI / PostgreSQL / SQLite).
Populates realistic Uzbek dental clinic fixtures:
- Doctors with specializations and commissions
- Patients with medical notes and debts in UZS
- Consumables inventory (anesthetics, composites, implants, endo files)
- Appointments and treatment records
"""
import sys
import os
import asyncio
from datetime import datetime, timedelta

# Ensure current directory is in path
sys.path.insert(0, os.path.dirname(__file__))

from app.database import engine, Base, AsyncSessionLocal
from app.models import (
    User,
    DoctorProfile,
    PatientProfile,
    Appointment,
    OdontogramRecord,
    Invoice,
    PaymentTransaction,
    InventoryItem,
)
from app.auth import get_password_hash

async def run_seed():
    print("[Seed] Initializing database schema...")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    print("[Seed] Populating realistic Uzbek dental clinic sample data...")
    async with AsyncSessionLocal() as db:
        # 1. Staff Users
        owner_user = User(
            full_name="Dr. Alisher Vohidov (Bosh Vrach / Rahbar)",
            phone="+998901112233",
            password_hash=get_password_hash("owner1234"),
            role="owner",
        )
        receptionist_user = User(
            full_name="Nilufar Qosimova (Administrator)",
            phone="+998902223344",
            password_hash=get_password_hash("reception1234"),
            role="receptionist",
        )
        dentist_user_1 = User(
            full_name="Dr. Aziz Karimov (Stomatolog-Terapevt)",
            phone="+998903334455",
            password_hash=get_password_hash("doctor1234"),
            role="dentist",
        )
        dentist_user_2 = User(
            full_name="Dr. Shahnoza Rahimova (Ortodont / Ortoped)",
            phone="+998904445566",
            password_hash=get_password_hash("doctor1234"),
            role="dentist",
        )
        dentist_user_3 = User(
            full_name="Dr. Jasur Mansurov (Jarroh-Implantolog)",
            phone="+998905556677",
            password_hash=get_password_hash("doctor1234"),
            role="dentist",
        )

        db.add_all([owner_user, receptionist_user, dentist_user_1, dentist_user_2, dentist_user_3])
        await db.flush()

        # Doctor Profiles
        doc_prof_1 = DoctorProfile(
            user_id=dentist_user_1.id,
            specialization="Stomatolog-terapevt",
            room_number="1-xona (Terapevtik)",
            commission_percent=40.0,
            working_hours="09:00 - 18:00, Dush-Juma",
        )
        doc_prof_2 = DoctorProfile(
            user_id=dentist_user_2.id,
            specialization="Ortodont / Ortoped",
            room_number="2-xona (Ortopediya)",
            commission_percent=45.0,
            working_hours="10:00 - 19:00, Dush-Shanba",
        )
        doc_prof_3 = DoctorProfile(
            user_id=dentist_user_3.id,
            specialization="Jarroh-implantolog",
            room_number="3-xona (Jarrohlik bloki)",
            commission_percent=50.0,
            working_hours="09:00 - 17:00, Dush-Juma",
        )
        db.add_all([doc_prof_1, doc_prof_2, doc_prof_3])
        await db.flush()

        # 2. Patients
        patient_u1 = User(
            full_name="Aziz Rahimov",
            phone="+998901234567",
            password_hash=get_password_hash("patient1234"),
            role="patient",
        )
        patient_u2 = User(
            full_name="Malika Karimova",
            phone="+998977654321",
            password_hash=get_password_hash("patient1234"),
            role="patient",
        )
        patient_u3 = User(
            full_name="Jasur Aliyev",
            phone="+998935551234",
            password_hash=get_password_hash("patient1234"),
            role="patient",
        )
        db.add_all([patient_u1, patient_u2, patient_u3])
        await db.flush()

        pat_prof_1 = PatientProfile(
            user_id=patient_u1.id,
            birth_date="1992-05-14",
            gender="male",
            allergies="Penitsillin",
            chronic_conditions="Gipertoniya 1-bosqich",
            medical_notes="14-tishda o'tkir og'riq va destruktiv pulpit belgilari",
            total_debt=350000.0,
        )
        pat_prof_2 = PatientProfile(
            user_id=patient_u2.id,
            birth_date="1998-11-20",
            gender="female",
            allergies="Yo'q",
            chronic_conditions="Homiladorlik 2-trimestr (Xavfsiz anesteziya talab etiladi)",
            medical_notes="Estetik restavratsiya va profilaktik tozalash",
            total_debt=1200000.0,
        )
        pat_prof_3 = PatientProfile(
            user_id=patient_u3.id,
            birth_date="1985-03-08",
            gender="male",
            allergies="Novokain",
            chronic_conditions="Qandli diabet 2-tur (nazorat ostida)",
            medical_notes="36-tish ekstraksiya va implantatsiya rejalashtirilgan",
            total_debt=0.0,
        )
        db.add_all([pat_prof_1, pat_prof_2, pat_prof_3])
        await db.flush()

        # 3. Appointments
        now = datetime.utcnow()
        appt_1 = Appointment(
            patient_id=pat_prof_1.id,
            doctor_id=doc_prof_1.id,
            start_time=now.replace(hour=10, minute=0, second=0),
            end_time=now.replace(hour=10, minute=45, second=0),
            status="checked_in",
            complaint="14-tish sohasida kechasi kuchayuvchi simillagan og'riq",
            notes="Ubistesin anesteziyasi ostida kanal tozalash",
        )
        appt_2 = Appointment(
            patient_id=pat_prof_2.id,
            doctor_id=doc_prof_2.id,
            start_time=now.replace(hour=11, minute=30, second=0),
            end_time=now.replace(hour=12, minute=15, second=0),
            status="scheduled",
            complaint="Oldingi tishlarda estetik defekt va rang o'zgarishi",
            notes="Sirkoniy vinirlar maslahati",
        )
        appt_3 = Appointment(
            patient_id=pat_prof_3.id,
            doctor_id=doc_prof_3.id,
            start_time=now - timedelta(days=1, hours=2),
            end_time=now - timedelta(days=1, hours=1),
            status="completed",
            complaint="36-tish ildizining parchalanishi",
            notes="Muolaja yakunlandi, tikuvlar qo'yildi",
        )
        db.add_all([appt_1, appt_2, appt_3])
        await db.flush()

        # 4. Odontogram Clinical Records
        od_1 = OdontogramRecord(
            patient_id=pat_prof_1.id,
            doctor_id=doc_prof_1.id,
            appointment_id=appt_1.id,
            tooth_fdi=14,
            surface="O",
            diagnosis="PULPITIS",
            procedure_name="Pulpitni dori bilan davolash va kanal ochish",
            price=650000.0,
            status="planned",
        )
        od_2 = OdontogramRecord(
            patient_id=pat_prof_1.id,
            doctor_id=doc_prof_1.id,
            appointment_id=appt_1.id,
            tooth_fdi=16,
            surface="MO",
            diagnosis="CARIES",
            procedure_name="Karies davolash va fotopolimer plomba",
            price=350000.0,
            status="planned",
        )
        od_3 = OdontogramRecord(
            patient_id=pat_prof_2.id,
            doctor_id=doc_prof_2.id,
            appointment_id=appt_2.id,
            tooth_fdi=21,
            surface="V",
            diagnosis="CROWN",
            procedure_name="Sirkoniy to'liq estetik qoplama",
            price=1200000.0,
            status="planned",
        )
        db.add_all([od_1, od_2, od_3])
        await db.flush()

        # 5. Invoices & Payments
        inv_1 = Invoice(
            appointment_id=appt_1.id,
            patient_id=pat_prof_1.id,
            total_amount=1000000.0,
            discount=0.0,
            paid_amount=650000.0,
            debt_amount=350000.0,
            payment_status="partially_paid",
            payment_method="cash",
        )
        inv_2 = Invoice(
            appointment_id=appt_2.id,
            patient_id=pat_prof_2.id,
            total_amount=1200000.0,
            discount=0.0,
            paid_amount=0.0,
            debt_amount=1200000.0,
            payment_status="pending",
            payment_method="payme",
        )
        db.add_all([inv_1, inv_2])
        await db.flush()

        pay_1 = PaymentTransaction(
            invoice_id=inv_1.id,
            patient_id=pat_prof_1.id,
            amount=650000.0,
            payment_method="cash",
            notes="Boshlang'ich to'lov (Naqd)",
        )
        db.add(pay_1)

        # 6. Inventory Items (Consumables)
        inv_items = [
            InventoryItem(name="Ubistesin Forte 4% (Karpula)", category="anesthetic", quantity=8, unit="karpula", min_threshold=15, unit_cost=12000.0),
            InventoryItem(name="Septanest 1:100 000 adrenalin bilan", category="anesthetic", quantity=25, unit="karpula", min_threshold=10, unit_cost=14000.0),
            InventoryItem(name="Filtek Z250 Fotopolimer A2 (Shprits)", category="composite", quantity=4, unit="shprits", min_threshold=8, unit_cost=320000.0),
            InventoryItem(name="Gradia Direct A3 Anterior", category="composite", quantity=10, unit="shprits", min_threshold=5, unit_cost=290000.0),
            InventoryItem(name="Osstem TS III Titan Implantat", category="implant", quantity=3, unit="dona", min_threshold=5, unit_cost=1250000.0),
            InventoryItem(name="Straumann SLA Bone Level", category="implant", quantity=6, unit="dona", min_threshold=3, unit_cost=2800000.0),
            InventoryItem(name="ProTaper Gold Endo Fayllar F1-F3", category="endo", quantity=12, unit="komplekt", min_threshold=6, unit_cost=180000.0),
            InventoryItem(name="K-Flexofile Mani 25mm assorti", category="endo", quantity=18, unit="quti", min_threshold=10, unit_cost=65000.0),
            InventoryItem(name="Tibbiy steril nitril qo'lqoplar M", category="consumable", quantity=45, unit="juft", min_threshold=100, unit_cost=2500.0),
            InventoryItem(name="Bir martalik tish shlangi va tupuruk so'rgich", category="consumable", quantity=120, unit="dona", min_threshold=50, unit_cost=1800.0),
        ]
        db.add_all(inv_items)

        await db.commit()
        print("[Seed] Successfully seeded realistic Uzbek dental clinic dataset!")

if __name__ == "__main__":
    asyncio.run(run_seed())
