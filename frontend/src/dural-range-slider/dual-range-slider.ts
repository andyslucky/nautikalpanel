import Alpine, {type AlpineComponent} from "alpinejs";
import dualSliderContent from "./dual-range-slider.html?raw";
type DualRangeSliderArgs = {
    label : string,
    min : number,
    max : number,
    minValue : number,
    maxValue: number,
    step : number,
    minValueChanged?() : void,
    maxValueChanged?() : void,
    formatValue?(value : number) : string
}
Alpine.data('dualRangeSlider', (args : Partial<DualRangeSliderArgs>) : AlpineComponent<{ content: string } & DualRangeSliderArgs> => ({
    content: dualSliderContent,
    ...args,
    step: args.step || 50,
    get minPercent() {
        return ((this.minValue - this.min) / (this.max - this.min)) * 100;
    },
    get maxPercent() {
        return ((this.maxValue - this.min) / (this.max - this.min)) * 100;
    },
    //@ts-ignore
    validateValues() : boolean {
        if (this.minValue > this.maxValue || this.maxValue < this.minValue) {
            this.minValue = this.min;
            this.maxValue = this.max;
            return false;
        }
        return true;
    }
}));