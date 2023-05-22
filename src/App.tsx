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
import { Chart } from 'react-chartjs-2';
import zoomPlugin from 'chartjs-plugin-zoom';
import "./App.css";
import { MouseData, MouseRawData, MouseDataPoint } from './MouseData';
import { ChartJSOrUndefined } from "react-chartjs-2/dist/types";
import { make_chart_options } from "./utils";

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

function make_mouse_dataset(rawData: Point[], smoothedData: Point[], showLine: boolean) {
  return {
    labels: [],
    datasets: [
      {
        hidden: true,
        showLine: showLine,
        label: "raw",
        data: rawData,
        borderColor: 'rgb(53, 162, 235)',
        pointStyle: 'rect',
        backgroundColor: 'rgba(53, 162, 235, 0.5)',
      },
      {
        showLine: showLine,
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
  const [decimationMethod, setDecimationMethod] = useState<'none' | 'min-max' | 'lttb'>('min-max');
  const [showLine, setShowLine] = useState(true);
  const [chartOptions, setChartOptions] = useState(make_chart_options('xy', 'min-max'));
  const [rawData, setRawData] = useState<Point[]>([]);
  const [smoothedData, setSmoothedData] = useState<Point[]>([]);
  const [freezed, setFreezed] = useState(true);
  const [dataSelect, setDataSelect] = useState('x');
  const [smoothFPS, setSmoothFPS] = useState(144);
  const [started, setStarted] = useState(false);
  const [updateInterval, setUpdateInterval] = useState(200);
  const [maxLogDuration, setMaxLogDuration] = useState(10000);
  const [exportFileName, setExportFileName] = useState('mouse_data');
  const [pollingRate, setPollingRate] = useState(0);
  const chartRef = useRef<ChartJSOrUndefined<'line', Point[], unknown>>(null);

  const select_axes: { [key: string]: { x: keyof MouseDataPoint, y: keyof MouseDataPoint } } = {
    x: { x: 't' as const, y: 'x' as const },
    y: { x: 't' as const, y: 'y' as const },
    xy: { x: 'x' as const, y: 'y' as const },
    dx: { x: 't' as const, y: 'dx' as const },
    dy: { x: 't' as const, y: 'dy' as const },
    vx: { x: 't' as const, y: 'vx' as const },
    vy: { x: 't' as const, y: 'vy' as const },
    dt: { x: 't' as const, y: 'dt' as const },
  };

  const clear_data = async () => {
    await invoke('log_restart');
    mouseDatabase.current!.clear();
  }

  useEffect(() => {
    setChartOptions({ ...make_chart_options(dataSelect, decimationMethod) });
  }, [dataSelect, decimationMethod]);

  useEffect(() => {
    if (started) {
      clear_data();
    } else {
      setFreezed(true);
      resetZoom();
    }
  }, [started]);

  useEffect(() => {
    mouseDatabase.current.set_smooth_time(1000 / smoothFPS);
  }, [smoothFPS]);

  useEffect(() => {
    const axes = select_axes[dataSelect];
    setRawData(mouseDatabase.current.data.map((d) => { return { x: d[axes.x], y: d[axes.y] } }));
    setSmoothedData(mouseDatabase.current.smoothed_data.map((d) => { return { x: d[axes.x], y: d[axes.y] } }));
  }, [dataSelect, smoothFPS, started]);

  useInterval(async () => {
    const d: MouseRawData[] = await invoke("get_mouse_data");
    if (!freezed || started) {
      d.map((x) => { mouseDatabase.current.push({...x, t: x.t / 1000.0}) });
    }
    if (!freezed) {
      const axes = select_axes[dataSelect];
      setRawData(mouseDatabase.current.data.map((d) => { return { x: d[axes.x], y: d[axes.y] } }));
      setSmoothedData(mouseDatabase.current.smoothed_data.map((d) => { return { x: d[axes.x], y: d[axes.y] } }));
      setPollingRate(mouseDatabase.current.polling_rate_buffer.length);
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
    if (!isNaN(v) && v > 0) {
      setSmoothFPS(v);
    }
  }

  const onUpdateIntervalChange = (e: ChangeEvent<HTMLInputElement>) => {
    let v = parseInt(e.target.value);
    if (!isNaN(v) && v > 0) {
      setUpdateInterval(v);
    }
  }

  const onMaxLogDurationChange = (e: ChangeEvent<HTMLInputElement>) => {
    let v = parseInt(e.target.value);
    if (!isNaN(v) && v > 0) {
      setMaxLogDuration(v);
      mouseDatabase.current!.set_duration(v);
    }
  }

  const exportRawData = (filename: string) => {
    const jsonString = `data:text/json;chatset=utf-8,${encodeURIComponent(JSON.stringify(mouseDatabase.current!.data))}`;
    const link = document.createElement('a');
    link.href = jsonString;
    link.download = filename + '.json';
    link.click();
  };

  const importRawData = (e: ChangeEvent<HTMLInputElement>) => {
    const fileReader = new FileReader();
    fileReader.onloadend = async () => {
      if(typeof fileReader.result === 'string' ){
        console.log("e.target.result", fileReader.result);
        await clear_data();
        const rawData = JSON.parse(fileReader.result);
        rawData.map((d : any) => mouseDatabase.current.push(d));
        const axes = select_axes[dataSelect];
        setRawData(mouseDatabase.current.data.map((d) => { return { x: d[axes.x], y: d[axes.y] } }));
        setSmoothedData(mouseDatabase.current.smoothed_data.map((d) => { return { x: d[axes.x], y: d[axes.y] } }));
      }
    };
    if (e.target.files != null) {
      fileReader.readAsText(e.target?.files[0], "UTF-8");
    }
  };

  return (
    <div>
      <Chart type='line' ref={chartRef} data={make_mouse_dataset(rawData, smoothedData, showLine)} options={chartOptions} />
      <div>
        <button onClick={toggle_start}>{started ? 'Stop (S)' : 'Start (S)'}</button>
        <button onClick={toggle_freeze}>{freezed ? 'Realtime (F)' : 'Freeze (F)'}</button>
        <button onClick={clear_data}>Reset (R)</button>
        <button onClick={resetZoom}>ResetZoom (Z)</button>
        PollingRate: {pollingRate}
        <br />
        <label>Data:
          <select
            value={dataSelect}
            onChange={(e) => setDataSelect(e.target.value)}
          >
            <option value='x'>x</option>
            <option value='y'>y</option>
            <option value='dx'>dx</option>
            <option value='dy'>dy</option>
            <option value='xy'>xy</option>
            <option value='vx'>vx</option>
            <option value='vy'>vy</option>
            <option value='dt'>dt</option>
          </select>
        </label>
        <label>ShowLine:
          <input
            type='checkbox'
            checked={showLine}
            onChange={() => setShowLine(showLine => !showLine)}
          />
        </label>
        <label>SmoothFPS:
          <input
            type='text'
            value={smoothFPS}
            onChange={onSmoothFPSChange}
            style={{ width: "3em" }}
          />
        </label>
        <label>UpdateInterval:
          <input
            type='text'
            value={updateInterval}
            onChange={onUpdateIntervalChange}
            style={{ width: "3em" }}
          />
          ms
        </label>
        <label>MaxLogTime:
          <input
            type='text'
            value={maxLogDuration}
            onChange={onMaxLogDurationChange}
            style={{ width: "5em" }}
          />
          ms
        </label>
        <br />
        <label>FileName
          <input
            type='text'
            value={exportFileName}
            onChange={(e) => {setExportFileName(e.target.value);}}
            style={{ width: "10em" }}
          />
        <button onClick={() => exportRawData(exportFileName)}>ExportRawData</button>
        </label>
        <br />
        <label> ImportRawData
          <input type='file' onChange={importRawData} accept='.json' />
        </label>
        <br />
        <label>DecimationMethod:
          <select
            value={decimationMethod}
            onChange={(e) => { const v = e.target.value; if (v === 'none' || v === 'min-max' || v === 'lttb') setDecimationMethod(v); }}>
            <option value={'none'}>none</option>
            <option value={'min-max'}>min-max</option>
            <option value={'lttb'}>lttb</option>
          </select>
        </label>
      </div>
      <p>Drag while holding ctrl to zoom in the selected area.</p>
      <p>Change DecimationMethod to lttb for performance problem.</p>
    </div>
  );
}

export default App;
