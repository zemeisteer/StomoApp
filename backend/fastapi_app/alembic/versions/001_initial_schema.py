"""001_initial_schema

Revision ID: 001_initial_schema
Revises: 
Create Date: 2026-10-31 12:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '001_initial_schema'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    # Users
    op.create_table(
        'users',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('full_name', sa.String(length=120), nullable=False),
        sa.Column('phone', sa.String(length=32), nullable=False),
        sa.Column('password_hash', sa.String(length=255), nullable=False),
        sa.Column('role', sa.String(length=32), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='1'),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_users_phone'), 'users', ['phone'], unique=True)

    # Patient Profiles
    op.create_table(
        'patient_profiles',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('user_id', sa.String(length=36), nullable=False),
        sa.Column('birth_date', sa.String(length=32), nullable=True),
        sa.Column('allergies', sa.Text(), nullable=True),
        sa.Column('medical_notes', sa.Text(), nullable=True),
        sa.Column('total_debt', sa.Float(), nullable=False, server_default='0.0'),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id'),
    )

    # Doctor Profiles
    op.create_table(
        'doctor_profiles',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('user_id', sa.String(length=36), nullable=False),
        sa.Column('specialization', sa.String(length=120), nullable=False),
        sa.Column('commission_rate', sa.Float(), nullable=False, server_default='40.0'),
        sa.Column('working_hours_json', sa.Text(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id'),
    )

    # Appointments
    op.create_table(
        'appointments',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('patient_id', sa.String(length=36), nullable=False),
        sa.Column('doctor_id', sa.String(length=36), nullable=False),
        sa.Column('start_time', sa.DateTime(), nullable=False),
        sa.Column('end_time', sa.DateTime(), nullable=False),
        sa.Column('status', sa.String(length=32), nullable=False, server_default='scheduled'),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['doctor_id'], ['doctor_profiles.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['patient_id'], ['patient_profiles.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('idx_doc_time', 'appointments', ['doctor_id', 'start_time', 'end_time'])
    op.create_index(op.f('ix_appointments_patient_id'), 'appointments', ['patient_id'])

    # Odontogram Records
    op.create_table(
        'odontogram_records',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('patient_id', sa.String(length=36), nullable=False),
        sa.Column('doctor_id', sa.String(length=36), nullable=True),
        sa.Column('tooth_number_fdi', sa.Integer(), nullable=False),
        sa.Column('surface', sa.String(length=16), nullable=False),
        sa.Column('condition', sa.String(length=32), nullable=False),
        sa.Column('procedure_name', sa.String(length=150), nullable=False),
        sa.Column('price', sa.Float(), nullable=False),
        sa.Column('status', sa.String(length=32), nullable=False, server_default='planned'),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['doctor_id'], ['doctor_profiles.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['patient_id'], ['patient_profiles.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_odontogram_records_patient_id'), 'odontogram_records', ['patient_id'])

    # Invoices
    op.create_table(
        'invoices',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('appointment_id', sa.String(length=36), nullable=True),
        sa.Column('patient_id', sa.String(length=36), nullable=False),
        sa.Column('total_amount', sa.Float(), nullable=False, server_default='0.0'),
        sa.Column('paid_amount', sa.Float(), nullable=False, server_default='0.0'),
        sa.Column('debt_amount', sa.Float(), nullable=False, server_default='0.0'),
        sa.Column('payment_status', sa.String(length=32), nullable=False, server_default='pending'),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['appointment_id'], ['appointments.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['patient_id'], ['patient_profiles.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )

    # Payments
    op.create_table(
        'payments',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('invoice_id', sa.String(length=36), nullable=True),
        sa.Column('patient_id', sa.String(length=36), nullable=False),
        sa.Column('amount', sa.Float(), nullable=False),
        sa.Column('payment_method', sa.String(length=32), nullable=False, server_default='cash'),
        sa.Column('notes', sa.String(length=255), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['invoice_id'], ['invoices.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['patient_id'], ['patient_profiles.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )

    # Inventory Items
    op.create_table(
        'inventory_items',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('name', sa.String(length=150), nullable=False),
        sa.Column('category', sa.String(length=64), nullable=False),
        sa.Column('quantity', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('unit', sa.String(length=32), nullable=False, server_default='dona'),
        sa.Column('min_threshold', sa.Integer(), nullable=False, server_default='10'),
        sa.Column('cost_per_unit', sa.Float(), nullable=False, server_default='0.0'),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )

def downgrade() -> None:
    op.drop_table('inventory_items')
    op.drop_table('payments')
    op.drop_table('invoices')
    op.drop_table('odontogram_records')
    op.drop_table('appointments')
    op.drop_table('doctor_profiles')
    op.drop_table('patient_profiles')
    op.drop_table('users')
