'use client';

import React, { useState, useRef, useEffect, useId, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, X, Clock } from 'lucide-react';

export interface CustomDatePickerProps {
  value: string; // 'YYYY-MM-DD'
  onChange: (dateStr: string) => void;
  min?: string; // 'YYYY-MM-DD'
  max?: string; // 'YYYY-MM-DD'
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  locale?: 'uz' | 'ru';
  className?: string;
  id?: string;
  inline?: boolean;
}

const MONTH_NAMES_UZ = [
  'Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun',
  'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'
];

const MONTH_NAMES_RU = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
];

const WEEKDAY_NAMES_UZ = ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya'];
const WEEKDAY_NAMES_RU = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

function parseYMD(str?: string): { year: number; month: number; day: number } | null {
  if (!str) return null;
  const parts = str.split('-').map(Number);
  if (parts.length < 3 || isNaN(parts[0]) || isNaN(parts[1]) || isNaN(parts[2])) return null;
  return { year: parts[0], month: parts[1], day: parts[2] };
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function toYMD(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

export const CustomDatePicker: React.FC<CustomDatePickerProps> = ({
  value,
  onChange,
  min,
  max,
  label,
  placeholder,
  disabled = false,
  required = false,
  locale = 'uz',
  className = '',
  id,
  inline = false,
}) => {
  const generatedId = useId();
  const inputId = id || generatedId;
  const isRu = locale === 'ru';

  const defaultPlaceholder = isRu ? 'Выберите дату...' : 'Sanani tanlang...';
  const effectivePlaceholder = placeholder || defaultPlaceholder;

  // Internal view year and month (1-12)
  const todayParts = (() => {
    const now = new Date();
    // Default clinic timezone Asia/Tashkent (+5 UTC)
    const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' });
    const [y, m, d] = formatter.format(now).split('-').map(Number);
    return { year: y, month: m, day: d };
  })();

  const parsedValue = parseYMD(value);
  const [viewYear, setViewYear] = useState<number>(parsedValue ? parsedValue.year : todayParts.year);
  const [viewMonth, setViewMonth] = useState<number>(parsedValue ? parsedValue.month : todayParts.month);

  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [popoverStyle, setPopoverStyle] = useState<React.CSSProperties>({});

  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Update view when value changes from outside
  useEffect(() => {
    if (parsedValue) {
      setViewYear(parsedValue.year);
      setViewMonth(parsedValue.month);
    }
  }, [value]);

  // Position calculation for popover
  const updatePosition = useCallback(() => {
    if (inline || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;

    const popoverWidth = Math.min(320, viewportWidth - 24);
    const popoverHeight = 360;

    let top = rect.bottom + 6;
    if (top + popoverHeight > viewportHeight - 12 && rect.top > popoverHeight) {
      top = rect.top - popoverHeight - 6;
    }

    let left = rect.left;
    if (left + popoverWidth > viewportWidth - 12) {
      left = viewportWidth - popoverWidth - 12;
    }
    if (left < 12) left = 12;

    setPopoverStyle({
      position: 'fixed',
      top: `${Math.round(top)}px`,
      left: `${Math.round(left)}px`,
      width: `${popoverWidth}px`,
      zIndex: 9999,
    });
  }, [inline]);

  // Re-calc position on open / scroll
  useEffect(() => {
    if (isOpen && !inline) {
      updatePosition();
      const handleScroll = () => updatePosition();
      window.addEventListener('scroll', handleScroll, true);
      window.addEventListener('resize', handleScroll);
      return () => {
        window.removeEventListener('scroll', handleScroll, true);
        window.removeEventListener('resize', handleScroll);
      };
    }
  }, [isOpen, inline, updatePosition]);

  // Outside click handler
  useEffect(() => {
    if (!isOpen || inline) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        containerRef.current?.contains(target) ||
        triggerRef.current?.contains(target) ||
        popoverRef.current?.contains(target)
      ) {
        return;
      }
      setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, inline]);

  // Month navigation
  const prevMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (viewMonth === 1) {
      setViewYear((y) => y - 1);
      setViewMonth(12);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const nextMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (viewMonth === 12) {
      setViewYear((y) => y + 1);
      setViewMonth(1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  // Days matrix for the calendar month
  const daysInMonth = new Date(viewYear, viewMonth, 0).getDate();
  // Day of week for first day (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
  const firstDayOfWeek = new Date(viewYear, viewMonth - 1, 1).getDay();
  // Convert so Monday = 0, Sunday = 6
  const startOffset = (firstDayOfWeek + 6) % 7;

  // Format display string
  const formatFormattedDisplay = (ymdStr?: string) => {
    if (!ymdStr) return '';
    const p = parseYMD(ymdStr);
    if (!p) return ymdStr;
    const mName = isRu ? MONTH_NAMES_RU[p.month - 1] : MONTH_NAMES_UZ[p.month - 1];
    return isRu ? `${p.day} ${mName} ${p.year}` : `${p.day}-${mName}, ${p.year}`;
  };

  const isDateDisabled = (dayNum: number): boolean => {
    const curStr = toYMD(viewYear, viewMonth, dayNum);
    if (min && curStr < min) return true;
    if (max && curStr > max) return true;
    return false;
  };

  const handleDaySelect = (dayNum: number) => {
    if (isDateDisabled(dayNum) || disabled) return;
    const dateStr = toYMD(viewYear, viewMonth, dayNum);
    onChange(dateStr);
    if (!inline) {
      setIsOpen(false);
      triggerRef.current?.focus();
    }
  };

  // Quick select: Today
  const selectToday = () => {
    const todayStr = toYMD(todayParts.year, todayParts.month, todayParts.day);
    if (min && todayStr < min) return;
    if (max && todayStr > max) return;
    onChange(todayStr);
    setViewYear(todayParts.year);
    setViewMonth(todayParts.month);
    if (!inline) setIsOpen(false);
  };

  // Quick select: Tomorrow
  const selectTomorrow = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' });
    const [y, m, day] = formatter.format(d).split('-').map(Number);
    const tomorrowStr = toYMD(y, m, day);
    if (min && tomorrowStr < min) return;
    if (max && tomorrowStr > max) return;
    onChange(tomorrowStr);
    setViewYear(y);
    setViewMonth(m);
    if (!inline) setIsOpen(false);
  };

  const calendarBody = (
    <div
      ref={popoverRef}
      className={`bg-white rounded-3xl border border-[#d8e5e2] p-4 text-[#152f34] select-none ${
        inline
          ? 'w-full shadow-sm'
          : 'shadow-[0_12px_40px_rgba(21,47,52,0.12)] ring-1 ring-[#167b78]/15 animate-fade-in'
      }`}
    >
      {/* Calendar Header */}
      <div className="flex items-center justify-between mb-3 px-1">
        <button
          type="button"
          onClick={prevMonth}
          className="w-8 h-8 rounded-xl bg-[#f0f6f4] hover:bg-[#eaf5f2] text-[#167b78] flex items-center justify-center transition-colors cursor-pointer"
          aria-label="Oldingi oy"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        <span className="font-extrabold text-sm text-[#152f34]">
          {isRu ? MONTH_NAMES_RU[viewMonth - 1] : MONTH_NAMES_UZ[viewMonth - 1]} {viewYear}
        </span>

        <button
          type="button"
          onClick={nextMonth}
          className="w-8 h-8 rounded-xl bg-[#f0f6f4] hover:bg-[#eaf5f2] text-[#167b78] flex items-center justify-center transition-colors cursor-pointer"
          aria-label="Keyingi oy"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Weekdays Row */}
      <div className="grid grid-cols-7 gap-1 mb-1 text-center">
        {(isRu ? WEEKDAY_NAMES_RU : WEEKDAY_NAMES_UZ).map((dayName, idx) => (
          <span
            key={idx}
            className={`text-[11px] font-bold uppercase py-1 ${
              idx >= 5 ? 'text-[#167b78]/70' : 'text-[#52696e]'
            }`}
          >
            {dayName}
          </span>
        ))}
      </div>

      {/* Days Grid */}
      <div className="grid grid-cols-7 gap-1 text-center">
        {/* Leading empty cells */}
        {Array.from({ length: startOffset }).map((_, i) => (
          <div key={`empty-${i}`} className="h-8 sm:h-9" />
        ))}

        {/* Days of the month */}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const dayNum = i + 1;
          const dateStr = toYMD(viewYear, viewMonth, dayNum);
          const isSelected = value === dateStr;
          const isToday =
            todayParts.year === viewYear &&
            todayParts.month === viewMonth &&
            todayParts.day === dayNum;
          const isDisabled = isDateDisabled(dayNum);

          return (
            <button
              key={`day-${dayNum}`}
              type="button"
              disabled={isDisabled}
              onClick={() => handleDaySelect(dayNum)}
              className={`h-8 sm:h-9 w-full rounded-xl text-xs font-bold transition-all flex items-center justify-center relative cursor-pointer ${
                isSelected
                  ? 'bg-[#167b78] text-white shadow-md shadow-[#167b78]/30 scale-105 font-extrabold'
                  : isDisabled
                  ? 'text-slate-300 cursor-not-allowed opacity-40 line-through'
                  : isToday
                  ? 'bg-[#eaf5f2] text-[#167b78] hover:bg-[#167b78] hover:text-white ring-1 ring-[#167b78]/40'
                  : 'text-[#152f34] hover:bg-[#f0f6f4] hover:text-[#167b78]'
              }`}
            >
              <span>{dayNum}</span>
              {isToday && !isSelected && (
                <span className="absolute bottom-1 w-1 h-1 rounded-full bg-[#167b78]" />
              )}
            </button>
          );
        })}
      </div>

      {/* Quick shortcut chips */}
      <div className="mt-3 pt-3 border-t border-[#d8e5e2] flex items-center justify-between text-[11px] gap-2">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={selectToday}
            className="px-2.5 py-1 rounded-lg bg-[#eaf5f2] hover:bg-[#d8ebe7] text-[#167b78] font-bold transition-colors cursor-pointer"
          >
            {isRu ? 'Сегодня' : 'Bugun'}
          </button>
          <button
            type="button"
            onClick={selectTomorrow}
            className="px-2.5 py-1 rounded-lg bg-[#f0f6f4] hover:bg-[#eaf5f2] text-[#52696e] hover:text-[#167b78] font-semibold transition-colors cursor-pointer"
          >
            {isRu ? 'Завтра' : 'Ertaga'}
          </button>
        </div>

        {value && !required && (
          <button
            type="button"
            onClick={() => {
              onChange('');
              if (!inline) setIsOpen(false);
            }}
            className="text-rose-500 hover:text-rose-600 font-semibold px-2 py-1"
          >
            {isRu ? 'Очистить' : 'Tozalash'}
          </button>
        )}
      </div>
    </div>
  );

  if (inline) {
    return (
      <div className={`space-y-1.5 ${className}`}>
        {label && (
          <label className="block text-xs font-bold text-[#152f34]">
            {label}
            {required && <span className="text-rose-500 ml-0.5">*</span>}
          </label>
        )}
        {calendarBody}
      </div>
    );
  }

  return (
    <div ref={containerRef} className={`relative space-y-1.5 ${className}`}>
      {label && (
        <label htmlFor={inputId} className="block text-xs font-bold text-[#152f34]">
          {label}
          {required && <span className="text-rose-500 ml-0.5">*</span>}
        </label>
      )}

      <div className="relative">
        <button
          id={inputId}
          ref={triggerRef}
          type="button"
          disabled={disabled}
          onClick={() => setIsOpen((prev) => !prev)}
          className={`w-full pl-10 pr-10 py-2.5 sm:py-3 text-left rounded-2xl border text-xs sm:text-sm font-medium transition-all flex items-center justify-between cursor-pointer ${
            disabled
              ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
              : isOpen
              ? 'border-[#167b78] ring-2 ring-[#167b78]/15 bg-white text-[#152f34] shadow-sm'
              : 'border-[#d8e5e2] bg-[#f9fcfa] hover:bg-white text-[#152f34] hover:border-[#167b78]/40'
          }`}
        >
          <CalendarIcon className="absolute left-3.5 top-3 sm:top-3.5 w-4 h-4 text-[#167b78]" />

          <span className={value ? 'font-bold text-[#152f34]' : 'text-[#52696e]'}>
            {value ? formatFormattedDisplay(value) : effectivePlaceholder}
          </span>

          {value && !disabled ? (
            <span
              onClick={(e) => {
                e.stopPropagation();
                onChange('');
              }}
              className="absolute right-3.5 top-3 sm:top-3.5 text-[#52696e] hover:text-[#152f34] p-0.5 rounded-full hover:bg-slate-100 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </span>
          ) : (
            <span className="absolute right-3.5 top-3 sm:top-3.5 text-[#52696e]">
              <Clock className="w-3.5 h-3.5 text-[#167b78]/60" />
            </span>
          )}
        </button>
      </div>

      {isOpen && mounted && createPortal(<div style={popoverStyle}>{calendarBody}</div>, document.body)}
    </div>
  );
};
