import { ChartOptions, DecimationOptions } from "chart.js";
import { ZoomPluginOptions } from "chartjs-plugin-zoom/types/options";

const DECIMATION_MINMAX: DecimationOptions = {
  enabled: true as const,
  threshold: 500 as const,
  algorithm: 'min-max' as const,
};

const DECIMATION_LTTB: DecimationOptions = {
  enabled: true as const,
  threshold: 500 as const,
  samples: 500 as const,
  algorithm: 'lttb' as const,
};

const DECIMATION_NONE: DecimationOptions = {
  enabled: false as const,
  algorithm: 'min-max' as const,
};

const DECIMATION_OPTIONS = {
    'none': DECIMATION_NONE,
    'min-max': DECIMATION_MINMAX,
    'lttb': DECIMATION_LTTB,
}

const zoomOption: ZoomPluginOptions = {
  zoom: {
    wheel: {
      enabled: true,
    },
    pinch: {
      enabled: true,
    },
    drag: {
      modifierKey: "ctrl",
      enabled: true,
    },
    mode: 'xy',
  },
  pan: {
    enabled: true,
    mode: 'xy',
  },

}

const CHARTOPTION: ChartOptions<'line'> = {
  interaction: {
    mode: "nearest" as const,
    axis: "x" as const,
    intersect: false as const,
  },
  normalized: true,
  parsing: false,
  responsive: true as const,
  animation: false as const,
  scales: {
    x: {
      type: 'linear' as const,
    },
  },
  plugins: {
    zoom: zoomOption,
    decimation: DECIMATION_MINMAX,
  }
};

const CHARTOPTION_XY: ChartOptions<'line'> = {
  interaction: {
  },
  normalized: false,
  parsing: {
    xAxisKey: 'x',
    yAxisKey: 'y',
  },
  responsive: true as const,
  animation: false as const,
  scales: {
    x: {
      type: 'linear' as const,
    },
  },
  plugins: {
    zoom: zoomOption,
    decimation: DECIMATION_MINMAX,
  }
};

export function make_chart_options(dataSelect: string, decimationMethod: 'none' | 'min-max' | 'lttb'){
    let options = dataSelect === 'xy' ? {...CHARTOPTION_XY} : {...CHARTOPTION};
    const decimation = dataSelect === 'xy' ? undefined : DECIMATION_OPTIONS[decimationMethod];
    options!.plugins!.decimation = decimation;
    return options;
}