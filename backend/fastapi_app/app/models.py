import uuid
from datetime import datetime
from typing import Optional, List
from sqlalchemy import (
    String,
    Integer,
    Float,
    Boolean,
    DateTime,
    ForeignKey,
    Text,
    Index,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base

def generate_uuid() -> str:
    return str(uuid.uuid4())

class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    full_name: Mapped[str] = mapped_column(String(120), nullable=False)
    phone: Mapped[str] = mapped_column(String(32), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(32), default="patient", nullable=False) # patient | receptionist | dentist | owner
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    patient_profile: Mapped[Optional["PatientProfile"]] = relationship("PatientProfile", back_populates="user", uselist=False, cascade="all, delete-orphan")
    doctor_profile: Mapped[Optional["DoctorProfile"]] = relationship("DoctorProfile", back_populates="user", uselist=False, cascade="all, delete-orphan")

class PatientProfile(Base):
    __tablename__ = "patient_profiles"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)
    birth_date: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    allergies: Mapped[Optional[str]] = mapped_column(Text, nullable=True) # JSON or comma-separated
    medical_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    total_debt: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="patient_profile")
    appointments: Mapped[List["Appointment"]] = relationship("Appointment", back_populates="patient", cascade="all, delete-orphan")
    odontogram_records: Mapped[List["OdontogramRecord"]] = relationship("OdontogramRecord", back_populates="patient", cascade="all, delete-orphan")
    invoices: Mapped[List["Invoice"]] = relationship("Invoice", back_populates="patient", cascade="all, delete-orphan")
    payments: Mapped[List["Payment"]] = relationship("Payment", back_populates="patient", cascade="all, delete-orphan")

class DoctorProfile(Base):
    __tablename__ = "doctor_profiles"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)
    specialization: Mapped[str] = mapped_column(String(120), default="Dentist-Therapist", nullable=False)
    commission_rate: Mapped[float] = mapped_column(Float, default=40.0, nullable=False) # e.g. 40.0%
    working_hours_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True) # JSON schedule
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="doctor_profile")
    appointments: Mapped[List["Appointment"]] = relationship("Appointment", back_populates="doctor", cascade="all, delete-orphan")

class Appointment(Base):
    __tablename__ = "appointments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    patient_id: Mapped[str] = mapped_column(String(36), ForeignKey("patient_profiles.id", ondelete="CASCADE"), index=True, nullable=False)
    doctor_id: Mapped[str] = mapped_column(String(36), ForeignKey("doctor_profiles.id", ondelete="CASCADE"), index=True, nullable=False)
    start_time: Mapped[datetime] = mapped_column(DateTime, index=True, nullable=False)
    end_time: Mapped[datetime] = mapped_column(DateTime, index=True, nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="scheduled", nullable=False) # scheduled | checked_in | in_progress | completed | cancelled
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    __table_args__ = (
        Index("idx_doc_time", "doctor_id", "start_time", "end_time"),
    )

    # Relationships
    patient: Mapped["PatientProfile"] = relationship("PatientProfile", back_populates="appointments")
    doctor: Mapped["DoctorProfile"] = relationship("DoctorProfile", back_populates="appointments")
    invoices: Mapped[List["Invoice"]] = relationship("Invoice", back_populates="appointment")

class OdontogramRecord(Base):
    __tablename__ = "odontogram_records"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    patient_id: Mapped[str] = mapped_column(String(36), ForeignKey("patient_profiles.id", ondelete="CASCADE"), index=True, nullable=False)
    doctor_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("doctor_profiles.id", ondelete="SET NULL"), nullable=True)
    tooth_number_fdi: Mapped[int] = mapped_column(Integer, nullable=False) # 11-48 adult, 51-85 pediatric
    surface: Mapped[str] = mapped_column(String(16), default="ALL", nullable=False) # ALL, O, M, D, V, L
    condition: Mapped[str] = mapped_column(String(32), default="HEALTHY", nullable=False) # HEALTHY, CARIES, PULPITIS, FILLING, CROWN, EXTRACTION, IMPLANT, ROOT_CANAL
    procedure_name: Mapped[str] = mapped_column(String(150), default="Profilaktik ko'rik", nullable=False)
    price: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="planned", nullable=False) # planned | completed
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    patient: Mapped["PatientProfile"] = relationship("PatientProfile", back_populates="odontogram_records")

class Invoice(Base):
    __tablename__ = "invoices"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    appointment_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("appointments.id", ondelete="SET NULL"), nullable=True)
    patient_id: Mapped[str] = mapped_column(String(36), ForeignKey("patient_profiles.id", ondelete="CASCADE"), index=True, nullable=False)
    total_amount: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    paid_amount: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    debt_amount: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    payment_status: Mapped[str] = mapped_column(String(32), default="pending", nullable=False) # pending | partially_paid | paid
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    appointment: Mapped[Optional["Appointment"]] = relationship("Appointment", back_populates="invoices")
    patient: Mapped["PatientProfile"] = relationship("PatientProfile", back_populates="invoices")
    payments: Mapped[List["Payment"]] = relationship("Payment", back_populates="invoice", cascade="all, delete-orphan")

class Payment(Base):
    __tablename__ = "payments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    invoice_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("invoices.id", ondelete="CASCADE"), nullable=True)
    patient_id: Mapped[str] = mapped_column(String(36), ForeignKey("patient_profiles.id", ondelete="CASCADE"), index=True, nullable=False)
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    payment_method: Mapped[str] = mapped_column(String(32), default="cash", nullable=False) # cash | uzcard_humo | payme | click
    notes: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    invoice: Mapped[Optional["Invoice"]] = relationship("Invoice", back_populates="payments")
    patient: Mapped["PatientProfile"] = relationship("PatientProfile", back_populates="payments")

class InventoryItem(Base):
    __tablename__ = "inventory_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    category: Mapped[str] = mapped_column(String(64), nullable=False) # anesthetic | composite | implant | endo | consumable
    quantity: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    unit: Mapped[str] = mapped_column(String(32), default="dona", nullable=False) # dona, quti, flakon, ampula
    min_threshold: Mapped[int] = mapped_column(Integer, default=10, nullable=False)
    cost_per_unit: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
