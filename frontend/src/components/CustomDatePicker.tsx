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
  timezone?: string;
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

function isValidDate(year: number, month: number, day: number): boolean {
  if (isNaN(year) || isNaN(month) || isNaN(day)) return false;
  if (year < 1900 || year > 2100) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  const d = new Date(Date.UTC(year, month - 1, day));
  return (
    d.getUTCFullYear() === year &&
    d.getUTCMonth() + 1 === month &&
    d.getUTCDate() === day
  );
}

function parseYMD(str?: string): { year: number; month: number; day: number } | null {
  if (!str || typeof str !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str.trim());
  if (!match) return null;
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);
  if (!isValidDate(year, month, day)) return null;
  return { year, month, day };
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
  timezone = 'Asia/Tashkent',
}) => {
  const generatedId = useId();
  const inputId = id || generatedId;
  const isRu = locale === 'ru';

  const defaultPlaceholder = isRu ? 'Выберите дату...' : 'Sanani tanlang...';
  const effectivePlaceholder = placeholder || defaultPlaceholder;

  // Clinic timezone-anchored current date
  const todayParts = (() => {
    const now = new Date();
    try {
      const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: timezone });
      const parts = formatter.format(now).split('-').map(Number);
      return { year: parts[0], month: parts[1], day: parts[2] };
    } catch {
      return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
    }
  })();

  const parsedValue = parseYMD(value);
  const [viewYear, setViewYear] = useState<number>(parsedValue ? parsedValue.year : todayParts.year);
  const [viewMonth, setViewMonth] = useState<number>(parsedValue ? parsedValue.month : todayParts.month);

  // Active keyboard focus inside calendar grid
  const [focusedDay, setFocusedDay] = useState<number>(parsedValue ? parsedValue.day : todayParts.day);

  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [popoverStyle, setPopoverStyle] = useState<React.CSSProperties>({});

  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const dayButtonsRef = useRef<Map<number, HTMLButtonElement>>(new Map());

  useEffect(() => {
    setMounted(true);
  }, []);

  // Sync internal view when value changes
  useEffect(() => {
    if (parsedValue) {
      setViewYear(parsedValue.year);
      setViewMonth(parsedValue.month);
      setFocusedDay(parsedValue.day);
    }
  }, [value]);

  // Position calculation with viewport clamping and mobile short-viewport handling
  const updatePosition = useCallback(() => {
    if (inline || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;

    const popoverWidth = Math.min(320, viewportWidth - 24);
    const popoverMaxHeight = Math.min(420, viewportHeight - 24);
    const estimatedHeight = 360;

    let top = rect.bottom + 6;
    if (top + estimatedHeight > viewportHeight - 12 && rect.top > estimatedHeight) {
      top = rect.top - estimatedHeight - 6;
    }
    // Prevent clipping off top
    if (top < 12) top = 12;

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
      maxHeight: `${popoverMaxHeight}px`,
      overflowY: 'auto',
      zIndex: 99999,
    });
  }, [inline]);

  // Open/close side effects & focus management
  useEffect(() => {
    if (isOpen && !inline) {
      updatePosition();
      const handleScroll = () => updatePosition();
      window.addEventListener('scroll', handleScroll, true);
      window.addEventListener('resize', handleScroll);

      // Move focus into the grid after opening
      const timer = setTimeout(() => {
        const btn = dayButtonsRef.current.get(focusedDay);
        if (btn) {
          btn.focus();
        } else {
          popoverRef.current?.focus();
        }
      }, 50);

      return () => {
        clearTimeout(timer);
        window.removeEventListener('scroll', handleScroll, true);
        window.removeEventListener('resize', handleScroll);
      };
    }
  }, [isOpen, inline, updatePosition, focusedDay]);

  // Outside click & escape handling
  useEffect(() => {
    if (!isOpen || inline) return;

    const handlePointerDown = (e: MouseEvent) => {
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

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [isOpen, inline]);

  const daysInMonth = new Date(viewYear, viewMonth, 0).getDate();
  const firstDayOfWeek = new Date(viewYear, viewMonth - 1, 1).getDay();
  // Monday = 0, Sunday = 6
  const startOffset = (firstDayOfWeek + 6) % 7;

  // Month navigation
  const prevMonth = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (viewMonth === 1) {
      setViewYear((y) => y - 1);
      setViewMonth(12);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const nextMonth = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (viewMonth === 12) {
      setViewYear((y) => y + 1);
      setViewMonth(1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const isDateDisabled = (year: number, month: number, dayNum: number): boolean => {
    const curStr = toYMD(year, month, dayNum);
    if (min && curStr < min) return true;
    if (max && curStr > max) return true;
    return false;
  };

  const handleDaySelect = (dayNum: number) => {
    if (isDateDisabled(viewYear, viewMonth, dayNum) || disabled) return;
    const dateStr = toYMD(viewYear, viewMonth, dayNum);
    onChange(dateStr);
    setFocusedDay(dayNum);
    if (!inline) {
      setIsOpen(false);
      triggerRef.current?.focus();
    }
  };

  // Keyboard navigation within the calendar grid
  const handleGridKeyDown = (e: React.KeyboardEvent) => {
    let handled = false;
    let targetDay = focusedDay;

    switch (e.key) {
      case 'ArrowLeft':
        if (targetDay > 1) {
          targetDay -= 1;
        } else {
          // Wrap to previous month
          if (viewMonth === 1) {
            setViewYear((y) => y - 1);
            setViewMonth(12);
            targetDay = new Date(viewYear - 1, 12, 0).getDate();
          } else {
            setViewMonth((m) => m - 1);
            targetDay = new Date(viewYear, viewMonth - 1, 0).getDate();
          }
        }
        handled = true;
        break;

      case 'ArrowRight':
        if (targetDay < daysInMonth) {
          targetDay += 1;
        } else {
          // Wrap to next month
          if (viewMonth === 12) {
            setViewYear((y) => y + 1);
            setViewMonth(1);
          } else {
            setViewMonth((m) => m + 1);
          }
          targetDay = 1;
        }
        handled = true;
        break;

      case 'ArrowUp':
        if (targetDay > 7) {
          targetDay -= 7;
        } else {
          // Previous month
          const prevDays = new Date(viewYear, viewMonth - 1, 0).getDate();
          if (viewMonth === 1) {
            setViewYear((y) => y - 1);
            setViewMonth(12);
          } else {
            setViewMonth((m) => m - 1);
          }
          targetDay = Math.max(1, prevDays - (7 - targetDay));
        }
        handled = true;
        break;

      case 'ArrowDown':
        if (targetDay + 7 <= daysInMonth) {
          targetDay += 7;
        } else {
          // Next month
          const remaining = daysInMonth - targetDay;
          if (viewMonth === 12) {
            setViewYear((y) => y + 1);
            setViewMonth(1);
          } else {
            setViewMonth((m) => m + 1);
          }
          targetDay = 7 - remaining;
        }
        handled = true;
        break;

      case 'Home':
        targetDay = 1;
        handled = true;
        break;

      case 'End':
        targetDay = daysInMonth;
        handled = true;
        break;

      case 'PageUp':
        if (e.shiftKey) {
          setViewYear((y) => y - 1);
        } else {
          prevMonth();
        }
        handled = true;
        break;

      case 'PageDown':
        if (e.shiftKey) {
          setViewYear((y) => y + 1);
        } else {
          nextMonth();
        }
        handled = true;
        break;

      case 'Enter':
      case ' ':
        e.preventDefault();
        e.stopPropagation();
        handleDaySelect(focusedDay);
        return;

      default:
        break;
    }

    if (handled) {
      e.preventDefault();
      e.stopPropagation();
      setFocusedDay(targetDay);
      setTimeout(() => {
        const btn = dayButtonsRef.current.get(targetDay);
        btn?.focus();
      }, 20);
    }
  };

  // Quick shortcuts
  const todayStr = toYMD(todayParts.year, todayParts.month, todayParts.day);
  const isTodayDisabled = Boolean((min && todayStr < min) || (max && todayStr > max));

  const selectToday = () => {
    if (isTodayDisabled) return;
    onChange(todayStr);
    setViewYear(todayParts.year);
    setViewMonth(todayParts.month);
    setFocusedDay(todayParts.day);
    if (!inline) {
      setIsOpen(false);
      triggerRef.current?.focus();
    }
  };

  const tomorrowStr = (() => {
    const d = new Date(Date.UTC(todayParts.year, todayParts.month - 1, todayParts.day + 1));
    return toYMD(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  })();
  const isTomorrowDisabled = Boolean((min && tomorrowStr < min) || (max && tomorrowStr > max));

  const selectTomorrow = () => {
    if (isTomorrowDisabled) return;
    const parts = parseYMD(tomorrowStr)!;
    onChange(tomorrowStr);
    setViewYear(parts.year);
    setViewMonth(parts.month);
    setFocusedDay(parts.day);
    if (!inline) {
      setIsOpen(false);
      triggerRef.current?.focus();
    }
  };

  const formatFormattedDisplay = (ymdStr?: string) => {
    if (!ymdStr) return '';
    const p = parseYMD(ymdStr);
    if (!p) return ymdStr;
    const mName = isRu ? MONTH_NAMES_RU[p.month - 1] : MONTH_NAMES_UZ[p.month - 1];
    return isRu ? `${p.day} ${mName} ${p.year}` : `${p.day}-${mName}, ${p.year}`;
  };

  const calendarBody = (
    <div
      ref={popoverRef}
      role="dialog"
      aria-modal="true"
      aria-label={isRu ? 'Выбор даты' : 'Sana tanlash'}
      tabIndex={-1}
      className={`bg-white rounded-3xl border border-[#d8e5e2] p-4 text-[#152f34] select-none ${
        inline
          ? 'w-full shadow-sm'
          : 'shadow-[0_12px_40px_rgba(21,47,52,0.14)] ring-1 ring-[#167b78]/15 animate-fade-in'
      }`}
      onKeyDown={handleGridKeyDown}
    >
      {/* Calendar Header with Localized Month Controls */}
      <div className="flex items-center justify-between mb-3 px-1">
        <button
          type="button"
          onClick={prevMonth}
          className="w-8 h-8 rounded-xl bg-[#f0f6f4] hover:bg-[#eaf5f2] text-[#167b78] flex items-center justify-center transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#167b78]"
          aria-label={isRu ? 'Предыдущий месяц' : 'Oldingi oy'}
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        <span className="font-extrabold text-sm text-[#152f34]" aria-live="polite">
          {isRu ? MONTH_NAMES_RU[viewMonth - 1] : MONTH_NAMES_UZ[viewMonth - 1]} {viewYear}
        </span>

        <button
          type="button"
          onClick={nextMonth}
          className="w-8 h-8 rounded-xl bg-[#f0f6f4] hover:bg-[#eaf5f2] text-[#167b78] flex items-center justify-center transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#167b78]"
          aria-label={isRu ? 'Следующий месяц' : 'Keyingi oy'}
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Weekdays Row */}
      <div className="grid grid-cols-7 gap-1 mb-1 text-center" role="row">
        {(isRu ? WEEKDAY_NAMES_RU : WEEKDAY_NAMES_UZ).map((dayName, idx) => (
          <span
            key={idx}
            role="columnheader"
            aria-label={dayName}
            className={`text-[11px] font-bold uppercase py-1 ${
              idx >= 5 ? 'text-[#167b78]/70' : 'text-[#52696e]'
            }`}
          >
            {dayName}
          </span>
        ))}
      </div>

      {/* Days Grid */}
      <div className="grid grid-cols-7 gap-1 text-center" role="grid" aria-label={isRu ? 'Календарь' : 'Taqvim'}>
        {/* Leading empty cells */}
        {Array.from({ length: startOffset }).map((_, i) => (
          <div key={`empty-${i}`} className="h-8 sm:h-9" role="presentation" />
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
          const isDisabled = isDateDisabled(viewYear, viewMonth, dayNum);
          const isFocused = focusedDay === dayNum;
          const monthName = isRu ? MONTH_NAMES_RU[viewMonth - 1] : MONTH_NAMES_UZ[viewMonth - 1];

          return (
            <button
              key={`day-${dayNum}`}
              ref={(el) => {
                if (el) dayButtonsRef.current.set(dayNum, el);
                else dayButtonsRef.current.delete(dayNum);
              }}
              type="button"
              role="gridcell"
              tabIndex={isFocused ? 0 : -1}
              disabled={isDisabled}
              aria-selected={isSelected}
              aria-current={isToday ? 'date' : undefined}
              aria-disabled={isDisabled}
              aria-label={`${dayNum} ${monthName} ${viewYear}${isToday ? (isRu ? ' (Сегодня)' : ' (Bugun)') : ''}`}
              onClick={() => handleDaySelect(dayNum)}
              className={`h-8 sm:h-9 w-full rounded-xl text-xs font-bold transition-all flex items-center justify-center relative cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#167b78] ${
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
            disabled={isTodayDisabled}
            onClick={selectToday}
            className={`px-2.5 py-1 rounded-lg font-bold transition-colors cursor-pointer ${
              isTodayDisabled
                ? 'bg-slate-100 text-slate-400 cursor-not-allowed opacity-50'
                : 'bg-[#eaf5f2] hover:bg-[#d8ebe7] text-[#167b78]'
            }`}
          >
            {isRu ? 'Сегодня' : 'Bugun'}
          </button>
          <button
            type="button"
            disabled={isTomorrowDisabled}
            onClick={selectTomorrow}
            className={`px-2.5 py-1 rounded-lg font-semibold transition-colors cursor-pointer ${
              isTomorrowDisabled
                ? 'bg-slate-100 text-slate-400 cursor-not-allowed opacity-50'
                : 'bg-[#f0f6f4] hover:bg-[#eaf5f2] text-[#52696e] hover:text-[#167b78]'
            }`}
          >
            {isRu ? 'Завтра' : 'Ertaga'}
          </button>
        </div>

        {/* Clear action: strictly disabled when required */}
        {value && !required && (
          <button
            type="button"
            onClick={() => {
              onChange('');
              if (!inline) {
                setIsOpen(false);
                triggerRef.current?.focus();
              }
            }}
            className="text-rose-500 hover:text-rose-600 font-semibold px-2 py-1 rounded hover:bg-rose-50 transition-colors focus:outline-none focus:ring-1 focus:ring-rose-400 cursor-pointer"
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
          aria-haspopup="dialog"
          aria-expanded={isOpen}
          onClick={() => setIsOpen((prev) => !prev)}
          className={`w-full pl-10 pr-10 py-2.5 sm:py-3 text-left rounded-2xl border text-xs sm:text-sm font-medium transition-all flex items-center justify-between cursor-pointer focus:outline-none ${
            disabled
              ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
              : isOpen
              ? 'border-[#167b78] ring-2 ring-[#167b78]/15 bg-white text-[#152f34] shadow-sm'
              : 'border-[#d8e5e2] bg-[#f9fcfa] hover:bg-white text-[#152f34] hover:border-[#167b78]/40 focus:border-[#167b78] focus:ring-2 focus:ring-[#167b78]/15'
          }`}
        >
          <CalendarIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#167b78]" />

          <span className={value ? 'font-bold text-[#152f34]' : 'text-[#52696e]'}>
            {value ? formatFormattedDisplay(value) : effectivePlaceholder}
          </span>

          {(!value || required || disabled) && (
            <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#52696e] pointer-events-none">
              <Clock className="w-3.5 h-3.5 text-[#167b78]/60" />
            </span>
          )}
        </button>

        {/* Accessible clear button: sibling to trigger, strictly rendered ONLY if !required && !disabled && value */}
        {value && !required && !disabled && (
          <button
            type="button"
            aria-label={isRu ? 'Очистить дату' : 'Sanani tozalash'}
            onClick={(e) => {
              e.stopPropagation();
              onChange('');
              triggerRef.current?.focus();
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 z-10 text-[#52696e] hover:text-rose-600 p-1 rounded-full hover:bg-slate-100 transition-colors focus:outline-none focus:ring-2 focus:ring-[#167b78] cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {isOpen && mounted && createPortal(
        <div style={popoverStyle} onClick={(e) => e.stopPropagation()}>
          {calendarBody}
        </div>,
        document.body
      )}
    </div>
  );
};
