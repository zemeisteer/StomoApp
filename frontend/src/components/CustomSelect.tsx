'use client';

import React, { useState, useRef, useEffect, useId, useCallback } from 'react';
import { createPortal } from 'react-dom';
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
  locale?: 'uz' | 'ru';
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
  locale = 'uz',
}) => {
  const generatedId = useId();
  const selectId = id || generatedId;
  const listboxId = `${selectId}-listbox`;
  const labelId = `${selectId}-label`;
  const errorId = `${selectId}-error`;

  const [mounted, setMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [openUpward, setOpenUpward] = useState(false);
  const [maxListHeight, setMaxListHeight] = useState(240);
  const [popoverStyle, setPopoverStyle] = useState<React.CSSProperties>({});

  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listboxRef = useRef<HTMLUListElement>(null);

  const isRu = locale === 'ru';
  const searchPlaceholderText = isRu ? 'Поиск...' : 'Qidirish...';
  const noResultsText = isRu ? 'Ничего не найдено' : 'Hech narsa topilmadi';
  const loadingText = isRu ? 'Загрузка...' : 'Yuklanmoqda...';

  useEffect(() => {
    setMounted(true);
  }, []);

  // Automatically enable search if more than 6 options unless explicitly specified
  const isSearchable = searchable !== undefined ? searchable : options.length > 6;

  // Filtered options based on search query
  const filteredOptions = options.filter((opt) =>
    opt.label.toLowerCase().includes(searchQuery.toLowerCase().trim())
  );

  const selectedOption = options.find((opt) => opt.value === value);

  // Calculate viewport-safe drop direction, position, and height
  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;

    const spaceBelow = viewportHeight - rect.bottom - 12;
    const spaceAbove = rect.top - 12;

    const isUpward = spaceBelow < 220 && spaceAbove > spaceBelow;
    const calculatedMaxHeight = Math.max(120, Math.min(260, (isUpward ? spaceAbove : spaceBelow) - 40));

    setOpenUpward(isUpward);
    setMaxListHeight(calculatedMaxHeight);

    const popoverWidth = Math.max(rect.width, 200);
    let leftPos = rect.left;
    if (leftPos + popoverWidth > viewportWidth - 8) {
      leftPos = Math.max(8, viewportWidth - popoverWidth - 8);
    }

    setPopoverStyle({
      position: 'fixed',
      left: `${leftPos}px`,
      width: `${popoverWidth}px`,
      maxWidth: 'calc(100vw - 16px)',
      top: isUpward ? undefined : `${rect.bottom + 6}px`,
      bottom: isUpward ? `${viewportHeight - rect.top + 6}px` : undefined,
      zIndex: 99999,
    });
  }, []);

  useEffect(() => {
    if (isOpen) {
      updatePosition();
      window.addEventListener('resize', updatePosition);
      window.addEventListener('scroll', updatePosition, true);
      return () => {
        window.removeEventListener('resize', updatePosition);
        window.removeEventListener('scroll', updatePosition, true);
      };
    }
  }, [isOpen, updatePosition]);

  // Set initial highlight when opened or when search query changes
  useEffect(() => {
    if (isOpen) {
      if (isSearchable && searchInputRef.current) {
        searchInputRef.current.focus();
      }
      // Highlight selected option or first non-disabled option
      const selectedIdx = filteredOptions.findIndex((opt) => opt.value === value);
      if (selectedIdx >= 0 && !filteredOptions[selectedIdx].disabled) {
        setHighlightedIndex(selectedIdx);
      } else {
        const firstActiveIdx = filteredOptions.findIndex((opt) => !opt.disabled);
        setHighlightedIndex(firstActiveIdx >= 0 ? firstActiveIdx : 0);
      }
    } else {
      setSearchQuery('');
      setHighlightedIndex(-1);
    }
  }, [isOpen, searchQuery, isSearchable, value, filteredOptions.length]);

  // Scroll active option into view
  useEffect(() => {
    if (isOpen && highlightedIndex >= 0 && listboxRef.current) {
      const activeElement = listboxRef.current.children[highlightedIndex] as HTMLElement;
      if (activeElement && typeof activeElement.scrollIntoView === 'function') {
        activeElement.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIndex, isOpen]);

  // Close on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        popoverRef.current &&
        !popoverRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
      return () => document.removeEventListener('mousedown', handleOutsideClick);
    }
  }, [isOpen]);

  // Keyboard navigation helpers: skip disabled options
  const getNextActiveIndex = (startIndex: number, direction: 1 | -1): number => {
    const total = filteredOptions.length;
    if (total === 0) return -1;
    let curr = startIndex;
    for (let i = 0; i < total; i++) {
      curr = (curr + direction + total) % total;
      if (!filteredOptions[curr].disabled) {
        return curr;
      }
    }
    return startIndex;
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled || loading) return;

    const isSearchFocused = document.activeElement === searchInputRef.current;

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
        setHighlightedIndex((prev) => getNextActiveIndex(prev, 1));
        break;

      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex((prev) => getNextActiveIndex(prev, -1));
        break;

      case 'Home':
        if (!isSearchFocused) {
          e.preventDefault();
          const firstIdx = filteredOptions.findIndex((opt) => !opt.disabled);
          if (firstIdx >= 0) setHighlightedIndex(firstIdx);
        }
        break;

      case 'End':
        if (!isSearchFocused) {
          e.preventDefault();
          for (let i = filteredOptions.length - 1; i >= 0; i--) {
            if (!filteredOptions[i].disabled) {
              setHighlightedIndex(i);
              break;
            }
          }
        }
        break;

      case 'Enter':
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

      case ' ':
        // Do NOT intercept Space when search input is focused! Multiword typing must work.
        if (!isSearchFocused) {
          e.preventDefault();
          if (highlightedIndex >= 0 && highlightedIndex < filteredOptions.length) {
            const targetOpt = filteredOptions[highlightedIndex];
            if (!targetOpt.disabled) {
              onChange(targetOpt.value);
              setIsOpen(false);
              triggerRef.current?.focus();
            }
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

  const activeOptionId =
    highlightedIndex >= 0 && highlightedIndex < filteredOptions.length
      ? `${selectId}-opt-${highlightedIndex}`
      : undefined;

  const popoverContent = isOpen && mounted ? (
    <div
      ref={popoverRef}
      style={popoverStyle}
      className="bg-white rounded-2xl shadow-2xl border border-slate-200 py-1.5 overflow-hidden animate-fade-in"
      onKeyDown={handleKeyDown}
    >
      {/* Optional Search */}
      {isSearchable && (
        <div className="p-2 border-b border-slate-100">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={searchPlaceholderText}
              aria-label={searchPlaceholderText}
              className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-teal-600 focus:bg-white"
            />
          </div>
        </div>
      )}

      {/* Options List */}
      <ul
        id={listboxId}
        ref={listboxRef}
        role="listbox"
        tabIndex={-1}
        aria-activedescendant={activeOptionId}
        aria-labelledby={label ? labelId : selectId}
        style={{ maxHeight: `${maxListHeight}px` }}
        className="overflow-y-auto py-1 divide-y divide-slate-50 scrollbar-thin"
      >
        {filteredOptions.length > 0 ? (
          filteredOptions.map((opt, index) => {
            const isSelected = opt.value === value;
            const isHighlighted = index === highlightedIndex;
            const optionId = `${selectId}-opt-${index}`;

            return (
              <li
                id={optionId}
                key={opt.value || `empty-${index}`}
                role="option"
                aria-selected={isSelected}
                aria-disabled={opt.disabled}
                onClick={() => handleSelect(opt.value, opt.disabled)}
                onMouseEnter={() => !opt.disabled && setHighlightedIndex(index)}
                className={`min-h-[40px] px-3.5 py-2 text-xs flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                  opt.disabled
                    ? 'opacity-40 cursor-not-allowed bg-slate-50 text-slate-400'
                    : isSelected
                    ? 'bg-teal-50 font-bold text-teal-900'
                    : isHighlighted
                    ? 'bg-slate-100 text-slate-900'
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
            {noResultsText}
          </li>
        )}
      </ul>
    </div>
  ) : null;

  return (
    <div ref={containerRef} className={`relative flex flex-col ${className}`}>
      {label && (
        <label
          id={labelId}
          htmlFor={selectId}
          className="text-xs font-semibold text-slate-700 mb-1.5 block cursor-pointer"
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
        aria-controls={isOpen ? listboxId : undefined}
        aria-labelledby={label ? `${labelId} ${selectId}` : selectId}
        aria-describedby={error ? errorId : undefined}
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
              <span>{loadingText}</span>
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
      {error && (
        <p id={errorId} className="text-[11px] text-red-600 mt-1 font-medium">
          {error}
        </p>
      )}

      {/* Dropdown Popover via React Portal */}
      {mounted && typeof document !== 'undefined' && popoverContent && createPortal(popoverContent, document.body)}
    </div>
  );
};
