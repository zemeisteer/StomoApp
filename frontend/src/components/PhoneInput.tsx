'use client';

import React, { useState, useEffect, useId } from 'react';
import { normalizeUzPhone, formatUzPhoneDisplay } from '../lib/phone';
import { Phone, AlertCircle } from 'lucide-react';

export interface PhoneInputProps {
  id?: string;
  name?: string;
  label?: string;
  value: string;
  onChange: (canonicalValue: string, displayValue: string, isValid: boolean) => void;
  required?: boolean;
  disabled?: boolean;
  error?: string | null;
  placeholder?: string;
  className?: string;
  locale?: 'uz' | 'ru';
  autoFocus?: boolean;
}

export const PhoneInput: React.FC<PhoneInputProps> = ({
  id,
  name = 'phone',
  label,
  value,
  onChange,
  required = false,
  disabled = false,
  error: externalError,
  placeholder = '+998 (90) 123-45-67',
  className = '',
  locale = 'uz',
  autoFocus = false,
}) => {
  const generatedId = useId();
  const inputId = id || generatedId;
  const errorId = `${inputId}-error`;

  const [displayValue, setDisplayValue] = useState<string>(() => formatUzPhoneDisplay(value));
  const [isTouched, setIsTouched] = useState<boolean>(false);

  useEffect(() => {
    // Synchronize if parent value changes externally
    if (value !== undefined) {
      const formatted = formatUzPhoneDisplay(value);
      setDisplayValue(formatted);
    }
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setIsTouched(true);
    const rawInput = e.target.value;
    const formatted = formatUzPhoneDisplay(rawInput);
    setDisplayValue(formatted);

    const validation = normalizeUzPhone(rawInput, required);
    onChange(validation.normalized, formatted, validation.isValid);
  };

  const handleBlur = () => {
    setIsTouched(true);
  };

  const validation = normalizeUzPhone(displayValue, required);
  const internalError = isTouched && !validation.isValid
    ? (locale === 'ru' ? validation.errorMessageRu : validation.errorMessageUz)
    : null;

  const effectiveError = externalError || internalError;

  return (
    <div className={`space-y-1 ${className}`}>
      {label && (
        <label htmlFor={inputId} className="block text-xs font-semibold text-slate-700">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}

      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
          <Phone className="w-4 h-4" />
        </div>

        <input
          id={inputId}
          name={name}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          autoFocus={autoFocus}
          disabled={disabled}
          required={required}
          value={displayValue}
          onChange={handleChange}
          onBlur={handleBlur}
          placeholder={placeholder}
          aria-invalid={Boolean(effectiveError)}
          aria-describedby={effectiveError ? errorId : undefined}
          className={`w-full pl-10 pr-3.5 py-2.5 rounded-xl border text-xs sm:text-sm font-medium transition-all outline-none ${
            effectiveError
              ? 'border-red-300 bg-red-50/40 text-red-900 focus:ring-2 focus:ring-red-400'
              : 'border-slate-200 bg-white text-slate-900 hover:border-teal-300 focus:ring-2 focus:ring-teal-600 focus:border-teal-600'
          } ${disabled ? 'opacity-50 cursor-not-allowed bg-slate-100' : ''}`}
        />
      </div>

      {effectiveError && (
        <p id={errorId} className="text-[11px] text-red-600 font-medium flex items-center gap-1 mt-1 animate-fade-in">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          <span>{effectiveError}</span>
        </p>
      )}
    </div>
  );
};
