'use client';

import { useRef } from 'react';

export default function PhSeg({ items, value, onChange, label }) {
    const refs = useRef([]);

    function focusIndex(index) {
        const next = (index + items.length) % items.length;
        onChange(items[next].value);
        refs.current[next]?.focus();
    }

    function onKeyDown(event, index) {
        if (event.key === 'ArrowRight') { event.preventDefault(); focusIndex(index + 1); }
        else if (event.key === 'ArrowLeft') { event.preventDefault(); focusIndex(index - 1); }
        else if (event.key === 'Home') { event.preventDefault(); focusIndex(0); }
        else if (event.key === 'End') { event.preventDefault(); focusIndex(items.length - 1); }
    }

    return (
        <div className="ph-seg" role="tablist" aria-label={label}>
            {items.map((item, index) => {
                const selected = item.value === value;
                return (
                    <button
                        key={item.value}
                        type="button"
                        role="tab"
                        aria-selected={selected}
                        tabIndex={selected ? 0 : -1}
                        className="ph-seg__item"
                        ref={(node) => { refs.current[index] = node; }}
                        onKeyDown={(event) => onKeyDown(event, index)}
                        onClick={() => onChange(item.value)}
                    >
                        {item.label}
                    </button>
                );
            })}
        </div>
    );
}
