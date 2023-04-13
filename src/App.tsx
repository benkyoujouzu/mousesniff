import { ChangeEvent, useEffect, useRef, useState } from "react";;
import { invoke } from "@tauri-apps/api/tauri";
import {
  Chart as ChartJS,
  PointElement,
  LineElement,
  LineController,
  LinearScale,
  CategoryScale,
  TimeScale,
  Title,
  Tooltip,
  Legend,
  Decimation,
} from 'chart.js';
import type { DecimationOptions } from 'chart.js';
import { Chart } from 'react-chartjs-2';
import zoomPlugin from 'chartjs-plugin-zoom';
import { ZoomPluginOptions } from 'chartjs-plugin-zoom/types/options';
ChartJS.register(zoomPlugin);
import "./App.css";
import { MouseData, MouseRawData, MouseDataPoint } from './MouseData';
import { clear } from "console";

ChartJS.register(
  PointElement,
  LineElement,
  LineController,
  LinearScale,
  CategoryScale,
  TimeScale,
  Title,
  Tooltip,
  Legend,
  Decimation,
  zoomPlugin,
);

const decimationOption: DecimationOptions = {
  enabled: true,
  threshold: 100,
  algorithm: 'min-max'
  // algorithm: 'lttb',
  // samples: 1000,
};
const zoomOption: ZoomPluginOptions = {
  zoom: {
    wheel: {
      enabled: true,
    },
    pinch: {
      enabled: true,
    },
    mode: 'xy',
  },
  pan: {
    enabled: true,
    mode: 'xy',
  },

}
const CHARTOPTION = {
  interaction: {
    mode: "nearest" as const,
    axis: "x" as const,
    intersect: false as const,
  },
  spanGaps: true as const,
  normalized: true as const,
  parsing: false as const,
  responsive: true as const,
  animation: false as const,
  scales: {
    x: {
      type: 'linear' as const,
    },
  },
    plugins: {
      decimation: decimationOption,
      zoom: zoomOption,
    }
};

const CHARTOPTION_XY = {
  interaction: {
  },
  normalized: false as const,
  responsive: true as const,
  animation: false as const,
  scales: {
    x: {
      type: 'linear' as const,
    },
  },
    plugins: {
      zoom: zoomOption,
    }
};


function useInterval(callback: () => void, delay: number) {
  const savedCallback = useRef<() => void>(callback);

  useEffect(() => {
    savedCallback.current = callback;
  });

  useEffect(() => {
    function tick() {
      savedCallback.current();
    }

    let id = setInterval(tick, delay);
    return () => clearInterval(id);
  }, [delay]);
}

function App() {
  const chartRef: any = useRef(null);
  const mouseDatabase = useRef<MouseData>(new MouseData());
  const [freezed, setFreezed] = useState(false);
  const [dataSelect, setDataSelect] = useState('x');
  const [smoothFPS, setSmoothFPS] = useState('144');
  const [started, setStarted] = useState(false);

  const dataset: any = useRef({
    labels: [],
    datasets: [
      {
        label: "raw",
        data: [],
        borderColor: 'rgb(53, 162, 235)',
        backgroundColor: 'rgba(53, 162, 235, 0.5)',
      },
      {
        label: "smoothed",
        data: [],
        borderColor: 'rgb(75, 192, 192)',
        backgroundColor: 'rgba(75, 192, 192, 0.5)',
      }
    ]
  });

  const select_axes: {[key: string]: {x: keyof MouseDataPoint, y: keyof MouseDataPoint}} = {
    x: {x: 't' as const, y: 'x' as const},
    y: {x: 't' as const, y: 'y' as const},
    xy: {x: 'x' as const, y: 'y' as const},
    dx: {x: 't' as const, y: 'dx' as const},
    dy: {x: 't' as const, y: 'dy' as const},
    dt: {x: 't' as const, y: 'dt' as const},
  };

  const update_data = async () => {
      let d: MouseRawData[] = await invoke("get_mouse_data");
      d.map((x) => {mouseDatabase.current.push(x)});
  }

  const regenerate_chart = (axes: {x: keyof MouseDataPoint, y: keyof MouseDataPoint}) => {
      dataset.current!.datasets[0]!.data = mouseDatabase.current.data.map((d) => { return { x: d[axes.x], y: d[axes.y] } });
      dataset.current!.datasets[1]!.data = mouseDatabase.current.smoothed_data.map((d) => { return { x: d[axes.x], y: d[axes.y] } });
      chartRef.current!.data = dataset.current;
      chartRef.current!.update();
  }

  useInterval(async () => {
    await update_data();
    if (!freezed) {
      mouseDatabase.current.flush_output_buffer();
      regenerate_chart(select_axes[dataSelect]);
    }
  }, 500);

  const clear_data = () => {
    dataset.current!.datasets[0]!.data = [];
    dataset.current!.datasets[1]!.data = [];
    mouseDatabase.current.clear();
  };

  const restart = async () => {
    if (started) {
      await invoke('log_restart');
      clear_data();
    } else {
      setStarted(true);
      await invoke('log_mouse_event');
      clear_data()
    }
  };

  const toggle_freeze = () => {
    setFreezed(freezed => !freezed);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    switch (e.code) {
      case 'KeyR':
        restart();
        break;
      case 'KeyF':
        toggle_freeze();
        break;
    }
  };

  const onDataSelected = (e: ChangeEvent<HTMLSelectElement>) => {
    let v = e.target.value;
    setDataSelect(v);
    const op = chartRef.current!.options
    if (v === 'xy') {
      console.log(chartRef.current!.options);
      chartRef.current!.options = { ...CHARTOPTION_XY, data: dataset.current };
      console.log(chartRef.current!.options);
    } else {
      chartRef.current!.options = { ...CHARTOPTION, data: dataset.current };
    }
    regenerate_chart(select_axes[v]);
  };

  const onSmoothFPSChange = (e: ChangeEvent<HTMLInputElement>) => {
    setSmoothFPS(e.target.value);
    let v = parseInt(e.target.value);
    if (!isNaN(v)) {
      mouseDatabase.current.set_smooth_time(1000.0 / v);
      regenerate_chart(select_axes[dataSelect]);
    }
  };


  useEffect(() => {
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  
  return (
    <div> 
      <Chart ref={chartRef} type='line' data={dataset.current} options={CHARTOPTION} />
      <button onClick={() => { restart(); }}>{started ? 'restart (R)' : 'start (R)'}</button>
      <button onClick={toggle_freeze}>{freezed ? 'unfreeze (F)' : 'freeze (F)'}</button>
      <button onClick={() => { chartRef.current!.resetZoom(); }}>reset zoom</button>
      <label>data:
        <select
          value={dataSelect}
          onChange={onDataSelected}
        >
          <option value='x'>x</option>
          <option value='y'>y</option>
          <option value='xy'>xy</option>
          <option value='dx'>dx</option>
          <option value='dy'>dy</option>
          <option value='dt'>dt</option>
        </select>
      </label>
      <label>FPS
        <input
          type='text' value={smoothFPS}
          onChange={onSmoothFPSChange}
        />
      </label>
    </div>
  );
}

export default App;
