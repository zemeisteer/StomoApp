'use client';

import React, { useState, useRef, useEffect, useId } from 'react';
import { ChevronDown, Check, Search, Loader2 } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
  badge?: string;
  disabled?: boolean;
}

interface CustomSelectProps {
  label?: string;
  placeholder?: string;
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  loading?: boolean;
  error?: string;
  searchable?: boolean;
  className?: string;
  id?: string;
}

export const CustomSelect: React.FC<CustomSelectProps> = ({
  label,
  placeholder = 'Tanlang...',
  options,
  value,
  onChange,
  disabled = false,
  loading = false,
  error,
  searchable,
  className = '',
  id,
}) => {
  const generatedId = useId();
  const selectId = id || generatedId;

  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [openUpward, setOpenUpward] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listboxRef = useRef<HTMLUListElement>(null);

  // Automatically enable search if more than 7 options unless explicitly disabled
  const isSearchable = searchable !== undefined ? searchable : options.length > 7;

  // Filtered options based on search query
  const filteredOptions = options.filter((opt) =>
    opt.label.toLowerCase().includes(searchQuery.toLowerCase().trim())
  );

  const selectedOption = options.find((opt) => opt.value === value);

  // Viewport-safe positioning check
  useEffect(() => {
    if (isOpen && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;

      // If space below is less than 240px and space above is greater, open upward
      if (spaceBelow < 240 && spaceAbove > 240) {
        setOpenUpward(true);
      } else {
        setOpenUpward(false);
      }
    }
  }, [isOpen]);

  // Focus search input when opened
  useEffect(() => {
    if (isOpen) {
      if (isSearchable && searchInputRef.current) {
        searchInputRef.current.focus();
      }
      // Set initial highlighted index to selected item
      const idx = filteredOptions.findIndex((opt) => opt.value === value);
      setHighlightedIndex(idx >= 0 ? idx : 0);
    } else {
      setSearchQuery('');
      setHighlightedIndex(-1);
    }
  }, [isOpen, isSearchable, value]);

  // Close on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled || loading) return;

    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        triggerRef.current?.focus();
        break;
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev < filteredOptions.length - 1 ? prev + 1 : 0
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev > 0 ? prev - 1 : filteredOptions.length - 1
        );
        break;
      case 'Enter':
      case ' ':
        if (highlightedIndex >= 0 && highlightedIndex < filteredOptions.length) {
          e.preventDefault();
          const targetOpt = filteredOptions[highlightedIndex];
          if (!targetOpt.disabled) {
            onChange(targetOpt.value);
            setIsOpen(false);
            triggerRef.current?.focus();
          }
        }
        break;
      case 'Tab':
        setIsOpen(false);
        break;
    }
  };

  const handleSelect = (optValue: string, isOptDisabled?: boolean) => {
    if (isOptDisabled) return;
    onChange(optValue);
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  return (
    <div ref={containerRef} className={`relative flex flex-col ${className}`}>
      {label && (
        <label
          id={`${selectId}-label`}
          htmlFor={selectId}
          className="text-xs font-semibold text-slate-700 mb-1.5 block"
        >
          {label}
        </label>
      )}

      {/* Trigger Button */}
      <button
        id={selectId}
        ref={triggerRef}
        type="button"
        disabled={disabled || loading}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-labelledby={label ? `${selectId}-label ${selectId}` : selectId}
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown}
        className={`w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border text-sm text-left flex items-center justify-between gap-2.5 transition-all outline-none ${
          disabled
            ? 'bg-slate-100/80 text-slate-400 border-slate-200 cursor-not-allowed'
            : error
            ? 'bg-red-50/40 border-red-300 text-slate-900 focus-visible:ring-2 focus-visible:ring-red-500'
            : isOpen
            ? 'bg-white border-teal-600 ring-2 ring-teal-600/20 shadow-sm'
            : 'bg-white border-slate-200 hover:border-slate-300 text-slate-900 shadow-sm focus-visible:ring-2 focus-visible:ring-teal-700'
        }`}
      >
        <div className="flex items-center gap-2 truncate">
          {loading ? (
            <span className="flex items-center gap-2 text-slate-400">
              <Loader2 className="w-4 h-4 animate-spin text-teal-600" />
              <span>Yuklanmoqda...</span>
            </span>
          ) : selectedOption ? (
            <span className="font-medium text-slate-900 truncate">
              {selectedOption.label}
            </span>
          ) : (
            <span className="text-slate-400 truncate">{placeholder}</span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {selectedOption?.badge && (
            <span className="px-2 py-0.5 rounded-md bg-teal-50 text-teal-800 text-[10px] font-bold">
              {selectedOption.badge}
            </span>
          )}
          <ChevronDown
            className={`w-4 h-4 transition-transform duration-200 ${
              disabled ? 'text-slate-300' : 'text-slate-400'
            } ${isOpen ? 'rotate-180 text-teal-700' : ''}`}
          />
        </div>
      </button>

      {/* Error state hint */}
      {error && <p className="text-[11px] text-red-600 mt-1 font-medium">{error}</p>}

      {/* Dropdown Popover */}
      {isOpen && (
        <div
          className={`absolute left-0 right-0 z-50 w-full min-w-[200px] bg-white rounded-2xl shadow-xl border border-slate-100 py-1.5 overflow-hidden animate-fade-in ${
            openUpward ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
          }`}
          onKeyDown={handleKeyDown}
        >
          {/* Optional Search */}
          {isSearchable && (
            <div className="p-2 border-b border-slate-100">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Qidirish..."
                  className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-teal-600 focus:bg-white"
                />
              </div>
            </div>
          )}

          {/* Options List */}
          <ul
            ref={listboxRef}
            role="listbox"
            tabIndex={-1}
            className="max-h-60 overflow-y-auto py-1 divide-y divide-slate-50 scrollbar-thin"
          >
            {filteredOptions.length > 0 ? (
              filteredOptions.map((opt, index) => {
                const isSelected = opt.value === value;
                const isHighlighted = index === highlightedIndex;

                return (
                  <li
                    key={opt.value}
                    role="option"
                    aria-selected={isSelected}
                    aria-disabled={opt.disabled}
                    onClick={() => handleSelect(opt.value, opt.disabled)}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    className={`min-h-[40px] px-3.5 py-2 text-xs flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                      opt.disabled
                        ? 'opacity-40 cursor-not-allowed bg-slate-50'
                        : isSelected
                        ? 'bg-teal-50/80 font-bold text-teal-900'
                        : isHighlighted
                        ? 'bg-slate-50 text-slate-900'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span className="truncate">{opt.label}</span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {opt.badge && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600">
                          {opt.badge}
                        </span>
                      )}
                      {isSelected && <Check className="w-4 h-4 text-teal-700" />}
                    </div>
                  </li>
                );
              })
            ) : (
              <li className="p-4 text-center text-xs text-slate-400">
                Natija topilmadi
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
};
