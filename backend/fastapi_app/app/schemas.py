from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field

# Auth & User
class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    user_id: str
    full_name: str

class TokenData(BaseModel):
    user_id: Optional[str] = None
    role: Optional[str] = None

class UserRegister(BaseModel):
    full_name: str
    phone: str
    password: str
    role: str = "patient" # patient | receptionist | dentist | owner

class UserLogin(BaseModel):
    phone: str
    password: str

class UserOut(BaseModel):
    id: str
    full_name: str
    phone: str
    role: str
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True

# Profiles
class PatientProfileOut(BaseModel):
    id: str
    user_id: str
    birth_date: Optional[str] = None
    allergies: Optional[str] = None
    medical_notes: Optional[str] = None
    total_debt: float
    full_name: Optional[str] = None
    phone: Optional[str] = None

    class Config:
        from_attributes = True

class DoctorProfileOut(BaseModel):
    id: str
    user_id: str
    specialization: str
    commission_rate: float
    full_name: Optional[str] = None
    phone: Optional[str] = None

    class Config:
        from_attributes = True

# Appointments
class AppointmentCreate(BaseModel):
    patient_id: Optional[str] = None
    patient_name: Optional[str] = None
    patient_phone: Optional[str] = None
    doctor_id: str
    start_time: datetime
    end_time: Optional[datetime] = None
    duration_minutes: int = 30
    notes: Optional[str] = None

class AppointmentUpdate(BaseModel):
    status: Optional[str] = None # scheduled | checked_in | in_progress | completed | cancelled
    notes: Optional[str] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None

class AppointmentOut(BaseModel):
    id: str
    patient_id: str
    doctor_id: str
    start_time: datetime
    end_time: datetime
    status: str
    notes: Optional[str] = None
    created_at: datetime
    patient_name: Optional[str] = None
    patient_phone: Optional[str] = None
    doctor_name: Optional[str] = None

    class Config:
        from_attributes = True

# Odontogram
class OdontogramRecordIn(BaseModel):
    tooth_number_fdi: int
    surface: str = "ALL"
    condition: str = "HEALTHY"
    procedure_name: str = "Profilaktik ko'rik"
    price: float = 0.0
    status: str = "planned"

class OdontogramBulkUpsert(BaseModel):
    patient_id: str
    doctor_id: Optional[str] = None
    records: List[OdontogramRecordIn]

class OdontogramOut(BaseModel):
    id: str
    patient_id: str
    doctor_id: Optional[str] = None
    tooth_number_fdi: int
    surface: str
    condition: str
    procedure_name: str
    price: float
    status: str
    updated_at: datetime

    class Config:
        from_attributes = True

# Billing & Payments
class PaymentCreate(BaseModel):
    invoice_id: Optional[str] = None
    patient_id: str
    amount: float
    payment_method: str = "cash" # cash | uzcard_humo | payme | click
    notes: Optional[str] = None

class PaymentOut(BaseModel):
    id: str
    invoice_id: Optional[str] = None
    patient_id: str
    amount: float
    payment_method: str
    notes: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True

class InvoiceOut(BaseModel):
    id: str
    appointment_id: Optional[str] = None
    patient_id: str
    total_amount: float
    paid_amount: float
    debt_amount: float
    payment_status: str
    created_at: datetime
    patient_name: Optional[str] = None
    payments: List[PaymentOut] = []

    class Config:
        from_attributes = True

class DebtRepayRequest(BaseModel):
    patient_id: str
    amount: float
    payment_method: str = "cash"
    notes: Optional[str] = None

# Inventory
class InventoryItemCreate(BaseModel):
    name: str
    category: str
    quantity: int = 0
    unit: str = "dona"
    min_threshold: int = 10
    cost_per_unit: float = 0.0

class InventoryItemUpdate(BaseModel):
    quantity_delta: Optional[int] = None
    quantity: Optional[int] = None
    min_threshold: Optional[int] = None
    cost_per_unit: Optional[float] = None

class InventoryItemOut(BaseModel):
    id: str
    name: str
    category: str
    quantity: int
    unit: str
    min_threshold: int
    cost_per_unit: float
    is_low_stock: bool
    updated_at: datetime

    class Config:
        from_attributes = True

# Owner Analytics
class OwnerMetricsOut(BaseModel):
    total_revenue: float
    total_debt: float
    active_patients_count: int
    completed_procedures_count: int
    low_stock_items_count: int
    doctor_occupancy_rate: float
