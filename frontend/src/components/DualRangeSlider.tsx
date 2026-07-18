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
};

export default function DualRangeSlider({ label, min, max, step, minValue, maxValue, onMinChange, onMaxChange, formatValue }: Props) {
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
                <span>Request: <strong>{formatValue(minValue)}</strong></span>
                <span>Limit: <strong>{formatValue(maxValue)}</strong></span>
            </div>
        </div>
    );
}
