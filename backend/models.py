"""
Top-level models module re-exporting SQLAlchemy models for StomoApp FastAPI backend.
"""
import sys
import os

# Add fastapi_app to sys.path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "fastapi_app"))

from app.models import (
    Base,
    User,
    PatientProfile,
    DoctorProfile,
    Appointment,
    OdontogramRecord,
    Invoice,
    PaymentTransaction,
    Payment,
    InventoryItem,
    generate_uuid,
)

__all__ = [
    "Base",
    "User",
    "PatientProfile",
    "DoctorProfile",
    "Appointment",
    "OdontogramRecord",
    "Invoice",
    "PaymentTransaction",
    "Payment",
    "InventoryItem",
    "generate_uuid",
]
