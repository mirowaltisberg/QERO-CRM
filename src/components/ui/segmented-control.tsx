'use client';

import { useState, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils/cn';

interface SegmentedControlOption<T extends string> {
  value: T;
  label: string;
  color?: string;
}

interface SegmentedControlProps<T extends string> {
  options: SegmentedControlOption<T>[];
  value: T | null;
  onChange: (value: T | null) => void;
  allowDeselect?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  allowDeselect = false,
  size = 'sm',
  className,
}: SegmentedControlProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [indicatorStyle, setIndicatorStyle] = useState<React.CSSProperties>({});
  
  // Update indicator position when value changes
  useEffect(() => {
    if (!containerRef.current || !value) {
      setIndicatorStyle({ opacity: 0 });
      return;
    }
    
    const activeIndex = options.findIndex((opt) => opt.value === value);
    if (activeIndex === -1) {
      setIndicatorStyle({ opacity: 0 });
      return;
    }
    
    const buttons = containerRef.current.querySelectorAll('[data-segment-button]');
    const activeButton = buttons[activeIndex] as HTMLElement;
    
    if (activeButton) {
      const activeOption = options[activeIndex];
      setIndicatorStyle({
        width: activeButton.offsetWidth,
        transform: `translateX(${activeButton.offsetLeft}px)`,
        opacity: 1,
        backgroundColor: activeOption.color || 'rgb(17 24 39)', // gray-900
      });
    }
  }, [value, options]);

  const handleClick = (optionValue: T) => {
    if (allowDeselect && value === optionValue) {
      onChange(null);
    } else {
      onChange(optionValue);
    }
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative inline-flex items-center rounded-lg bg-gray-100/80 p-0.5',
        size === 'sm' ? 'h-7' : 'h-8',
        className
      )}
    >
      {/* Sliding indicator */}
      <div
        className={cn(
          'absolute top-0.5 left-0 rounded-md shadow-sm transition-all duration-200 ease-out',
          size === 'sm' ? 'h-6' : 'h-7'
        )}
        style={indicatorStyle}
      />
      
      {/* Buttons */}
      {options.map((option) => {
        const isActive = value === option.value;
        return (
          <button
            key={option.value}
            data-segment-button
            type="button"
            onClick={() => handleClick(option.value)}
            className={cn(
              'relative z-10 px-3 font-medium transition-colors duration-150',
              size === 'sm' ? 'text-xs' : 'text-sm',
              isActive ? 'text-white' : 'text-gray-600 hover:text-gray-900'
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}


