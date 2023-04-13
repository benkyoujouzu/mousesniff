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
  Point,
} from 'chart.js';
import type { DecimationOptions } from 'chart.js';
import { Chart} from 'react-chartjs-2';
import zoomPlugin from 'chartjs-plugin-zoom';
import { ZoomPluginOptions } from 'chartjs-plugin-zoom/types/options';
ChartJS.register(zoomPlugin);
import "./App.css";
import { MouseData, MouseRawData, MouseDataPoint } from './MouseData';
import { ChartJSOrUndefined } from "react-chartjs-2/dist/types";

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
  threshold: 500,
  // algorithm: 'lttb',
  // samples: 100,
  algorithm: 'min-max'
};
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
const CHARTOPTION = {
  interaction: {
    mode: "nearest" as const,
    axis: "x" as const,
    intersect: false as const,
  },
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

function make_mouse_dataset(rawData: Point[], smoothedData: Point[]) {
  return {
    labels: [],
    datasets: [
      {
        hidden: true,
        label: "raw",
        data: rawData,
        borderColor: 'rgb(53, 162, 235)',
        pointStyle: 'rect',
        backgroundColor: 'rgba(53, 162, 235, 0.5)',
      },
      {
        label: "smoothed",
        data: smoothedData,
        borderColor: 'rgb(75, 192, 192)',
        backgroundColor: 'rgba(75, 192, 192, 0.5)',
      }
    ]
  };
}

function App() {
  const mouseDatabase = useRef<MouseData>(new MouseData());

  const [rawData, setRawData] = useState<Point[]>([]);
  const [smoothedData, setSmoothedData] = useState<Point[]>([]);
  const [freezed, setFreezed] = useState(true);
  const [dataSelect, setDataSelect] = useState('x');
  const [smoothFPS, setSmoothFPS] = useState(144);
  const [started, setStarted] = useState(false);
  const [updateInterval, setUpdateInterval] = useState(200);
  const [maxLogDuration, setMaxLogDuration] = useState(100000);
  const chartRef = useRef<ChartJSOrUndefined<'line', Point[], unknown>>(null);

  const select_axes: {[key: string]: {x: keyof MouseDataPoint, y: keyof MouseDataPoint}} = {
    x: {x: 't' as const, y: 'x' as const},
    y: {x: 't' as const, y: 'y' as const},
    xy: {x: 'x' as const, y: 'y' as const},
    dx: {x: 't' as const, y: 'dx' as const},
    dy: {x: 't' as const, y: 'dy' as const},
    vx: {x: 't' as const, y: 'vx' as const},
    vy: {x: 't' as const, y: 'vy' as const},
    dt: {x: 't' as const, y: 'dt' as const},
  };

  const clear_data = () => {
      invoke('log_restart');
      mouseDatabase.current!.clear();
  }

  useEffect( () => {
    if (started) {
      clear_data();
    } else {
      mouseDatabase.current.flush_output_buffer();
      setFreezed(true);
    }
  }, [started]);

  useEffect( () => {
    mouseDatabase.current.set_smooth_time(1000 / smoothFPS);
  }, [smoothFPS]);

  useEffect( () => {
    // react-chartjs-v2 seems buggy on options
    if (dataSelect === 'xy') {
      chartRef.current!.options = CHARTOPTION_XY;
    } else {
      chartRef.current!.options = CHARTOPTION;
    }
    chartRef.current!.update();
  }, [dataSelect])

  useEffect( () => {
    mouseDatabase.current.flush_output_buffer();
    const axes = select_axes[dataSelect];
    setRawData(mouseDatabase.current.data.map((d) => { return { x: d[axes.x], y: d[axes.y] } }));
    setSmoothedData(mouseDatabase.current.smoothed_data.map((d) => { return { x: d[axes.x], y: d[axes.y] } }));
  }, [dataSelect, smoothFPS, started]);

  useInterval(async () => {
    const d: MouseRawData[] = await invoke("get_mouse_data");
    if(!freezed || started) {
      d.map((x) => {mouseDatabase.current.push(x)});
    }
    if (!freezed) {
      mouseDatabase.current.flush_output_buffer();
      const axes = select_axes[dataSelect];
      setRawData(mouseDatabase.current.data.map((d) => { return { x: d[axes.x], y: d[axes.y] } }));
      setSmoothedData(mouseDatabase.current.smoothed_data.map((d) => { return { x: d[axes.x], y: d[axes.y] } }));
    }
  }, updateInterval);


  const toggle_start = () => {
    setStarted(started => !started);
  };

  const toggle_freeze = () => {
    setFreezed(freezed => !freezed);
  };

  const resetZoom = () => {
    chartRef.current!.resetZoom();
  }

  const onKeyDown = (e: KeyboardEvent) => {
    switch (e.code) {
      case 'KeyS':
        toggle_start();
        break;
      case 'KeyF':
        toggle_freeze();
        break;
      case 'KeyZ':
        resetZoom();
        break;
      case 'KeyR':
        clear_data();
        break;
    }
  };

  useEffect(() => {
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
      invoke('log_mouse_event');
  }, []);

  const onSmoothFPSChange = (e: ChangeEvent<HTMLInputElement>) => {
    let v = parseInt(e.target.value);
    if (!isNaN(v)) {
      setSmoothFPS(v);
    }
  }

  const onUpdateIntervalChange = (e: ChangeEvent<HTMLInputElement>) => {
    let v = parseInt(e.target.value);
    if (!isNaN(v)) {
      setUpdateInterval(v);
    }
  }

  const onMaxLogDurationChange = (e: ChangeEvent<HTMLInputElement>) => {
    let v = parseInt(e.target.value);
    if (!isNaN(v)) {
      setMaxLogDuration(v);
      mouseDatabase.current!.set_duration(v);
    }
  }

  
  return (
    <div> 
      <Chart type='line' ref={chartRef} data={make_mouse_dataset(rawData, smoothedData)} options={CHARTOPTION} />
      <button onClick={() => { toggle_start }}>{started ? 'stop (S)' : 'start (S)'}</button>
      <button onClick={toggle_freeze}>{freezed ? 'realtime (F)' : 'freeze (F)'}</button>
      <button onClick={clear_data}>reset (R)</button>
      <button onClick={() => { resetZoom(); }}>reset zoom (Z)</button>
      <label>&nbsp;&nbsp;data:
        <select
          value={dataSelect}
          onChange={(e) => setDataSelect(e.target.value)}
        >
          <option value='x'>x</option>
          <option value='y'>y</option>
          <option value='xy'>xy</option>
          <option value='vx'>vx</option>
          <option value='vy'>vy</option>
          <option value='dx'>dx</option>
          <option value='dy'>dy</option>
          <option value='dt'>dt</option>
        </select>
      </label>
      <div>
      <label>&nbsp;&nbsp;smoothFPS:
        <input
          type='text' 
          value={smoothFPS}
          onChange={onSmoothFPSChange}
          style={{width: "3em"}}
        />
      </label>
      <label>&nbsp;&nbsp;updateInterval:
        <input
          type='text' 
          value={updateInterval}
          onChange={onUpdateIntervalChange}
          style={{width: "3em"}}
        />
        ms
      </label>
      <label>&nbsp;&nbsp;maxLogTime:
        <input
          type='text' 
          value={maxLogDuration}
          onChange={onMaxLogDurationChange}
          style={{width: "5em"}}
        />
        ms
      </label>
</div>
      <p>drag while holding ctrl to zoom in the selected area.</p>
    </div>
  );
}

export default App;
