import { useEffect, useState } from 'preact/compat';

type Props = {
    label: string;
    min: number;
    max: number;
    step: number;
    minValue: number;
    maxValue: number;
    onMinChange: (value: number) => void;
    onMaxChange: (value: number) => void;
    formatValue: (value: number) => string;
    parseValue?: (value: string) => number;
};

export default function DualRangeSlider({ label, min, max, step, minValue, maxValue, onMinChange, onMaxChange, formatValue, parseValue }: Props) {
    // Allow free-text editing of the min/max labels. We track local input state
    // so the user can type intermediate values like '' or '250mm' without the
    // parent's formatted value fighting them on every keystroke. We commit the
    // parsed numeric value on blur (and on Enter) and resync from props whenever
    // the parent's value changes from elsewhere (e.g. the slider).
    const [minText, setMinText] = useState<string>(formatValue(minValue));
    const [maxText, setMaxText] = useState<string>(formatValue(maxValue));

    useEffect(() => { setMinText(formatValue(minValue)); }, [minValue, formatValue]);
    useEffect(() => { setMaxText(formatValue(maxValue)); }, [maxValue, formatValue]);

    const minPercent = ((minValue - min) / (max - min)) * 100;
    const maxPercent = ((maxValue - min) / (max - min)) * 100;

    function clampMin(value: number) {
        const v = Math.max(min, Math.min(value, maxValue));
        onMinChange(v);
    }
    function clampMax(value: number) {
        const v = Math.max(minValue, Math.min(value, max));
        onMaxChange(v);
    }

    function commitMin(raw: string) {
        if (!parseValue) return;
        const parsed = parseValue(raw);
        if (isNaN(parsed)) {
            setMinText(formatValue(minValue));
            return;
        }
        clampMin(parsed);
        // Reformat after commit so the displayed text matches the stored value.
        setMinText(formatValue(Math.max(min, Math.min(parsed, maxValue))));
    }
    function commitMax(raw: string) {
        if (!parseValue) return;
        const parsed = parseValue(raw);
        if (isNaN(parsed)) {
            setMaxText(formatValue(maxValue));
            return;
        }
        clampMax(parsed);
        setMaxText(formatValue(Math.max(minValue, Math.min(parsed, max))));
    }

    return (
        <div>
            <label class="form-label-sm mb-2 block">{label}</label>
            <div class="range-slider">
                <div class="range-slider-track" />
                <div class="range-slider-fill" style={{ left: `${minPercent}%`, right: `${100 - maxPercent}%` }} />
                <input
                    id="minSlider"
                    type="range"
                    min={min}
                    max={max}
                    step={step}
                    value={minValue}
                    onInput={(e) => clampMin(parseInt((e.target as HTMLInputElement).value))}
                    onChange={(e) => clampMin(parseInt((e.target as HTMLInputElement).value))}
                />
                <input
                    id="maxSlider"
                    type="range"
                    min={min}
                    max={max}
                    step={step}
                    value={maxValue}
                    onInput={(e) => clampMax(parseInt((e.target as HTMLInputElement).value))}
                    onChange={(e) => clampMax(parseInt((e.target as HTMLInputElement).value))}
                />
            </div>
            <div class="range-slider-labels">
                <span>
                    Request:
                    {parseValue ? (
                        <input
                            type="text"
                            value={minText}
                            onInput={(e) => setMinText((e.target as HTMLInputElement).value)}
                            onBlur={(e) => commitMin((e.target as HTMLInputElement).value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); } }}
                            class="range-slider-value-input"
                            aria-label={`${label} request`}
                        />
                    ) : (
                        <strong>{formatValue(minValue)}</strong>
                    )}
                </span>
                <span>
                    Limit:
                    {parseValue ? (
                        <input
                            type="text"
                            value={maxText}
                            onInput={(e) => setMaxText((e.target as HTMLInputElement).value)}
                            onBlur={(e) => commitMax((e.target as HTMLInputElement).value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); } }}
                            class="range-slider-value-input"
                            aria-label={`${label} limit`}
                        />
                    ) : (
                        <strong>{formatValue(maxValue)}</strong>
                    )}
                </span>
            </div>
        </div>
    );
}