import { JSX, Component, createEffect, createSignal, on, onCleanup, onMount } from "solid-js";
import { MouseData, MouseRawData, MouseDataPoint } from './MouseData';
import { invoke } from "@tauri-apps/api/tauri";
import "./App.css";
import {
  Chart,
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
import zoomPlugin from 'chartjs-plugin-zoom';
import { make_chart_options, make_mouse_dataset } from "./utils";

Chart.register(
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

const App: Component = () => {
  const mouseDatabase = new MouseData();
  const [updateInterval, setUpdateInterval] = createSignal(200);
  const [maxLogDuration, setMaxLogDuration] = createSignal(10000);
  const [freezed, setFreezed] = createSignal(true);
  const [started, setStarted] = createSignal(false);
  const [showLine, setShowLine] = createSignal(true);
  const [dataSelect, setDataSelect] = createSignal('x');
  const [pollingRate, setPollingRate] = createSignal(0);
  const [smoothFPS, setSmoothFPS] = createSignal(144);
  const [exportFileName, setExportFileName] = createSignal('mouse_data');
  const [decimationMethod, setDecimationMethod] = createSignal<'none' | 'min-max' | 'lttb'>('min-max');

  let chartRef: HTMLCanvasElement;
  let chart: Chart<'line'>;

  onMount(() => {
    chart = new Chart(chartRef, {type: 'line', data: make_mouse_dataset([], [], true), options: make_chart_options('x', 'min-max')});
    window.addEventListener('keydown', onKeyDown);
  });

  let updateHandler: ReturnType<typeof setInterval>;
  onCleanup(() => {
    window.removeEventListener('keydown', onKeyDown);
    clearInterval(updateHandler);
  });
  
  const chartDataUpdate = () => {
    const axes = select_axes[dataSelect()];
    let rawData = mouseDatabase.data.map((d) => { return { x: d[axes.x], y: d[axes.y] } });
    let smoothedData = mouseDatabase.smoothed_data.map((d) => { return { x: d[axes.x], y: d[axes.y] } });
    const pollingRate = mouseDatabase.polling_rate_buffer.length;
    setPollingRate(pollingRate);
    chart.data.datasets[0].data = rawData;
    chart.data.datasets[1].data = smoothedData;
    chart.update();
  };

  createEffect(on(updateInterval, (updateInterval) => {
    if (updateHandler != null) {
      clearInterval(updateHandler);
    }

    updateHandler = setInterval(async () => {
      const d: MouseRawData[] = await invoke("get_mouse_data");
      if (!freezed() || started()) {
        d.map((x) => { mouseDatabase.push({ ...x, t: x.t / 1000.0 }) });
      }
      if (!freezed()) {
        chartDataUpdate();
      }
    }, updateInterval);
  }));

  createEffect(() => {
    if (started()) {
      clear_data();
    } else {
      setFreezed(true);
      resetZoom();
    }
  });

  createEffect(() => {
    chart.data.datasets[0].showLine = showLine();
    chart.data.datasets[1].showLine = showLine();
    chart.update();
  });

  createEffect(() => {
    const options = make_chart_options(dataSelect(), decimationMethod());
    chart.options = options;
    chart.update();
  });

  createEffect(() => {
    mouseDatabase.set_smooth_time(1000 / smoothFPS());
  })

  createEffect(() => {
    started();
    dataSelect();
    smoothFPS();
    chartDataUpdate();
  })

  const toggle_freeze = () => {
    setFreezed(freezed => !freezed);
  }

  const toggle_start = () => {
    setStarted(started => !started);
  };

  const resetZoom = () => {
    chart.resetZoom();
  }

  const clear_data = async () => {
    await invoke('log_restart');
    mouseDatabase.clear();
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

  const onSmoothFPSChange: JSX.ChangeEventHandler<HTMLInputElement, Event> = (e) => {
    let v = parseInt(e.target.value);
    if (!isNaN(v) && v > 0) {
      setSmoothFPS(v);
    }
  }

  const onUpdateIntervalChange: JSX.ChangeEventHandler<HTMLInputElement, Event> = (e) => {
    let v = parseInt(e.target.value);
    if (!isNaN(v) && v > 0) {
      setUpdateInterval(v);
    }
  }
  const onMaxLogDurationChange: JSX.ChangeEventHandler<HTMLInputElement, Event> = (e) => {
    let v = parseInt(e.target.value);
    if (!isNaN(v) && v > 0) {
      setMaxLogDuration(v);
      mouseDatabase.set_duration(v);
    }
  }

  const exportRawData = (filename: string) => {
    const jsonString = `data:text/json;chatset=utf-8,${encodeURIComponent(JSON.stringify(mouseDatabase.data))}`;
    const link = document.createElement('a');
    link.href = jsonString;
    link.download = filename + '.json';
    link.click();
  };

  const importRawData: JSX.ChangeEventHandler<HTMLInputElement, Event> = (e) => {
    const fileReader = new FileReader();
    fileReader.onloadend = async () => {
      if(typeof fileReader.result === 'string' ){
        console.log("e.target.result", fileReader.result);
        await clear_data();
        const rawData = JSON.parse(fileReader.result);
        rawData.map((d : any) => mouseDatabase.push(d));
        chartDataUpdate();
      }
    };
    if (e.target.files != null) {
      fileReader.readAsText(e.target?.files[0], "UTF-8");
    }
  };

  invoke('log_mouse_event');

  return (
    <div>
      <canvas ref={chartRef!} />
      <div>
        <button onClick={toggle_start}>{started() ? 'Stop (S)' : 'Start (S)'}</button>
        <button onClick={toggle_freeze}>{freezed() ? 'Realtime (F)' : 'Freeze (F)'}</button>
        <button onClick={clear_data}>Reset (R)</button>
        <button onClick={resetZoom}>ResetZoom (Z)</button>
        PollingRate: {pollingRate()}
        <br />
        <label>Data:
          <select
            value={dataSelect()}
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
            checked={showLine()}
            onChange={() => setShowLine(showLine => !showLine)}
          />
        </label>
        <label>SmoothFPS:
          <input
            type='text'
            value={smoothFPS()}
            onChange={onSmoothFPSChange}
            style={{ width: "3em" }}
          />
        </label>
        <label>UpdateInterval:
          <input
            type='text'
            value={updateInterval()}
            onChange={onUpdateIntervalChange}
            style={{ width: "3em" }}
          />
          ms
        </label>
        <label>MaxLogTime:
          <input
            type='text'
            value={maxLogDuration()}
            onChange={onMaxLogDurationChange}
            style={{ width: "5em" }}
          />
          ms
        </label>
        <br />
        <label>FileName
          <input
            type='text'
            value={exportFileName()}
            onChange={(e) => {setExportFileName(e.target.value);}}
            style={{ width: "10em" }}
          />
        <button onClick={() => exportRawData(exportFileName())}>ExportRawData</button>
        </label>
        <br />
        <label> ImportRawData
          <input type='file' onChange={importRawData} accept='.json' />
        </label>
        <br />
        <label>DecimationMethod:
          <select
            value={decimationMethod()}
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
