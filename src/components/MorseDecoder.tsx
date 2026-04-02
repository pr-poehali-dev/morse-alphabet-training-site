import { useState, useRef, useCallback, useEffect } from 'react';
import Icon from '@/components/ui/icon';
import { MORSE_RU, MORSE_EN, MORSE_DIGITS } from '@/hooks/useMorse';

// ── Таблицы декодирования ──────────────────────────────────────
const MORSE_REVERSE: Record<string, string> = {};
for (const [ch, code] of Object.entries(MORSE_RU)) MORSE_REVERSE[code] = ch;
for (const [ch, code] of Object.entries(MORSE_EN)) {
  if (!MORSE_REVERSE[code]) MORSE_REVERSE[code] = ch;
}
for (const [ch, code] of Object.entries(MORSE_DIGITS)) MORSE_REVERSE[code] = ch;

// ── Константы ─────────────────────────────────────────────────
const FFT_SIZE = 2048;
const SAMPLE_RATE = 44100;
const MIN_TONE_HZ = 300;
const MAX_TONE_HZ = 1200;
const NOISE_FLOOR = 0.015;       // порог для тона (RMS)
const SPECTRUM_BINS = 80;        // столбцов в спектре

// ── Типы ──────────────────────────────────────────────────────
interface DecodedChar {
  ch: string;
  code: string;
  ts: number;
}

export default function MorseDecoder() {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [lang, setLang] = useState<'ru' | 'en' | 'both'>('both');

  // Авто-настройка
  const [detectedHz, setDetectedHz] = useState<number | null>(null);
  const [detectedWpm, setDetectedWpm] = useState<number | null>(null);
  const [signalLevel, setSignalLevel] = useState(0); // 0-1
  const [toneActive, setToneActive] = useState(false);

  // Спектр
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Декодированный текст
  const [decoded, setDecoded] = useState<DecodedChar[]>([]);
  const [currentSymbols, setCurrentSymbols] = useState<string>('');

  // Refs для audio processing
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const freqDataRef = useRef<Float32Array | null>(null);
  const timeDataRef = useRef<Float32Array | null>(null);

  // Состояние детектора Морзе
  const toneOnTimeRef = useRef<number>(0);
  const toneOffTimeRef = useRef<number>(0);
  const lastToneRef = useRef<boolean>(false);
  const currentSymRef = useRef<string[]>([]); // накопленные точки/тире текущей буквы
  const dotEstimateRef = useRef<number>(80);  // авто-оценка длины точки в мс
  const recentDurationsRef = useRef<number[]>([]); // для адаптации скорости
  const lockedHzRef = useRef<number | null>(null);  // зафиксированная частота
  const hzHistoryRef = useRef<number[]>([]);        // история частот для усреднения

  // ── Утилиты спектра ──────────────────────────────────────────
  const hzToIndex = (hz: number, sampleRate: number, fftSize: number) =>
    Math.round((hz / sampleRate) * fftSize);

  const findDominantHz = (data: Float32Array, sampleRate: number, fftSize: number): number | null => {
    const lo = hzToIndex(MIN_TONE_HZ, sampleRate, fftSize);
    const hi = hzToIndex(MAX_TONE_HZ, sampleRate, fftSize);
    let maxDb = -200;
    let maxIdx = -1;
    for (let i = lo; i <= hi; i++) {
      if (data[i] > maxDb) { maxDb = data[i]; maxIdx = i; }
    }
    if (maxIdx < 0 || maxDb < -60) return null;
    return (maxIdx / fftSize) * sampleRate;
  };

  // ── Рисование спектра ─────────────────────────────────────────
  const drawSpectrum = useCallback((
    freqDb: Float32Array,
    sampleRate: number,
    fftSize: number,
    lockedHz: number | null,
    isTone: boolean
  ) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    // Фон
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(0, 0, W, H);

    // Диапазон для отображения: 200–1400 Гц
    const displayLo = 200, displayHi = 1400;
    const loIdx = hzToIndex(displayLo, sampleRate, fftSize);
    const hiIdx = hzToIndex(displayHi, sampleRate, fftSize);
    const range = hiIdx - loIdx;
    const binW = W / SPECTRUM_BINS;

    for (let b = 0; b < SPECTRUM_BINS; b++) {
      const startIdx = loIdx + Math.floor((b / SPECTRUM_BINS) * range);
      const endIdx = loIdx + Math.floor(((b + 1) / SPECTRUM_BINS) * range);
      let maxVal = -160;
      for (let i = startIdx; i < endIdx && i < freqDb.length; i++) {
        if (freqDb[i] > maxVal) maxVal = freqDb[i];
      }
      const norm = Math.max(0, (maxVal + 100) / 60); // -100 dB...-40 dB -> 0..1
      const barH = norm * H * 0.9;
      const hz = displayLo + ((b + 0.5) / SPECTRUM_BINS) * (displayHi - displayLo);

      const inRange = hz >= MIN_TONE_HZ && hz <= MAX_TONE_HZ;
      const nearLocked = lockedHz && Math.abs(hz - lockedHz) < 40;

      let color: string;
      if (nearLocked && isTone) color = 'rgba(251,191,36,0.9)';
      else if (nearLocked) color = 'rgba(251,191,36,0.5)';
      else if (inRange) color = 'rgba(99,102,241,0.6)';
      else color = 'rgba(100,116,139,0.3)';

      ctx.fillStyle = color;
      ctx.fillRect(b * binW + 1, H - barH, binW - 2, barH);
    }

    // Метки Гц
    ctx.fillStyle = 'rgba(148,163,184,0.7)';
    ctx.font = '10px monospace';
    for (const hz of [400, 600, 800, 1000, 1200]) {
      const x = ((hz - displayLo) / (displayHi - displayLo)) * W;
      ctx.fillText(`${hz}`, x - 12, H - 2);
      ctx.fillStyle = 'rgba(148,163,184,0.2)';
      ctx.fillRect(x, 0, 1, H - 14);
      ctx.fillStyle = 'rgba(148,163,184,0.7)';
    }

    // Линия зафиксированной частоты
    if (lockedHz) {
      const x = ((lockedHz - displayLo) / (displayHi - displayLo)) * W;
      ctx.strokeStyle = isTone ? 'rgba(251,191,36,0.9)' : 'rgba(251,191,36,0.4)';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H - 14); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = isTone ? 'rgba(251,191,36,1)' : 'rgba(251,191,36,0.6)';
      ctx.font = 'bold 10px monospace';
      ctx.fillText(`${Math.round(lockedHz)}Гц`, Math.min(x + 3, W - 50), 12);
    }
  }, []);

  // ── Декодирование символа ─────────────────────────────────────
  const flushLetter = useCallback(() => {
    const syms = currentSymRef.current;
    if (syms.length === 0) return;
    const code = syms.join('');
    let ch = MORSE_REVERSE[code];
    if (!ch) ch = '?';

    // фильтр по языку
    const isRu = ch in MORSE_RU;
    const isEn = ch in MORSE_EN;
    const isDig = ch in MORSE_DIGITS;
    let show = true;
    if (lang === 'ru' && !isRu && !isDig) show = false;
    if (lang === 'en' && !isEn && !isDig) show = false;

    if (show) {
      setDecoded(prev => [...prev.slice(-200), { ch, code, ts: Date.now() }]);
    }
    setCurrentSymbols('');
    currentSymRef.current = [];
  }, [lang]);

  // ── Обработка тон вкл/выкл ───────────────────────────────────
  const processToneChange = useCallback((isOn: boolean, now: number) => {
    if (isOn && !lastToneRef.current) {
      // фронт: тон включился
      const offDur = now - toneOffTimeRef.current;
      // пауза между буквами / словами
      if (toneOffTimeRef.current > 0) {
        const dot = dotEstimateRef.current;
        if (offDur > dot * 5) {
          flushLetter();
          setDecoded(prev => [...prev.slice(-200), { ch: ' ', code: '', ts: now }]);
        } else if (offDur > dot * 2) {
          flushLetter();
        }
      }
      toneOnTimeRef.current = now;
      lastToneRef.current = true;
    } else if (!isOn && lastToneRef.current) {
      // спад: тон выключился
      const onDur = now - toneOnTimeRef.current;
      const dot = dotEstimateRef.current;
      const sym = onDur < dot * 2.2 ? '.' : '-';

      // адаптация скорости: копим длительности точек
      if (sym === '.') {
        recentDurationsRef.current = [...recentDurationsRef.current.slice(-9), onDur];
        const avg = recentDurationsRef.current.reduce((a, b) => a + b, 0) / recentDurationsRef.current.length;
        dotEstimateRef.current = Math.max(30, Math.min(500, avg));
        setDetectedWpm(Math.round(1200 / dotEstimateRef.current));
      }

      currentSymRef.current = [...currentSymRef.current, sym];
      setCurrentSymbols(currentSymRef.current.join(''));

      toneOffTimeRef.current = now;
      lastToneRef.current = false;
    }
  }, [flushLetter]);

  // ── RAF loop ──────────────────────────────────────────────────
  const tick = useCallback(() => {
    rafRef.current = requestAnimationFrame(tick);
    if (!analyserRef.current || !freqDataRef.current || !timeDataRef.current) return;

    const analyser = analyserRef.current;
    const sampleRate = audioCtxRef.current?.sampleRate ?? SAMPLE_RATE;

    analyser.getFloatFrequencyData(freqDataRef.current);
    analyser.getFloatTimeDomainData(timeDataRef.current);

    // RMS уровень сигнала
    let rms = 0;
    for (let i = 0; i < timeDataRef.current.length; i++) {
      rms += timeDataRef.current[i] ** 2;
    }
    rms = Math.sqrt(rms / timeDataRef.current.length);
    setSignalLevel(Math.min(1, rms * 6));

    // Доминантная частота в рабочем диапазоне
    const domHz = findDominantHz(freqDataRef.current, sampleRate, FFT_SIZE);

    // Обновляем историю и усредняем частоту
    if (domHz && rms > NOISE_FLOOR * 0.5) {
      hzHistoryRef.current = [...hzHistoryRef.current.slice(-4), domHz];
      const avgHz = hzHistoryRef.current.reduce((a, b) => a + b, 0) / hzHistoryRef.current.length;

      // если уже есть зафиксированная частота — проверяем близость
      if (!lockedHzRef.current) {
        lockedHzRef.current = avgHz;
      } else if (Math.abs(avgHz - lockedHzRef.current) < 100) {
        // плавная подстройка
        lockedHzRef.current = lockedHzRef.current * 0.9 + avgHz * 0.1;
      }
      setDetectedHz(Math.round(lockedHzRef.current));
    }

    // Детектируем тон: энергия вокруг зафиксированной частоты
    let isTone = false;
    if (lockedHzRef.current) {
      const centerIdx = hzToIndex(lockedHzRef.current, sampleRate, FFT_SIZE);
      const bw = Math.max(2, hzToIndex(60, sampleRate, FFT_SIZE));
      let energy = 0;
      for (let i = Math.max(0, centerIdx - bw); i <= Math.min(freqDataRef.current.length - 1, centerIdx + bw); i++) {
        energy += Math.pow(10, freqDataRef.current[i] / 20);
      }
      isTone = energy > NOISE_FLOOR * (bw * 2 + 1);
    } else {
      // до локации — широкополосный порог
      isTone = rms > NOISE_FLOOR;
    }

    setToneActive(isTone);
    processToneChange(isTone, performance.now());

    // Спектр
    drawSpectrum(freqDataRef.current, sampleRate, FFT_SIZE, lockedHzRef.current, isTone);
  }, [processToneChange, drawSpectrum]);

  // ── Запуск/остановка ─────────────────────────────────────────
  const start = useCallback(async () => {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
      });
      streamRef.current = stream;
      const ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = FFT_SIZE;
      analyser.smoothingTimeConstant = 0.3;
      source.connect(analyser);
      analyserRef.current = analyser;
      freqDataRef.current = new Float32Array(analyser.frequencyBinCount);
      timeDataRef.current = new Float32Array(analyser.fftSize);

      // сброс состояния
      currentSymRef.current = [];
      recentDurationsRef.current = [];
      dotEstimateRef.current = 80;
      lockedHzRef.current = null;
      hzHistoryRef.current = [];
      toneOnTimeRef.current = 0;
      toneOffTimeRef.current = 0;
      lastToneRef.current = false;
      setDecoded([]);
      setCurrentSymbols('');
      setDetectedHz(null);
      setDetectedWpm(null);

      rafRef.current = requestAnimationFrame(tick);
      setRunning(true);
    } catch {
      setError('Нет доступа к микрофону. Разрешите доступ в браузере.');
    }
  }, [tick]);

  const stop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (audioCtxRef.current) { audioCtxRef.current.close(); audioCtxRef.current = null; }
    analyserRef.current = null;
    setRunning(false);
    setToneActive(false);
    setSignalLevel(0);

    // очистить canvas
    const canvas = canvasRef.current;
    if (canvas) {
      const c = canvas.getContext('2d');
      if (c) { c.clearRect(0, 0, canvas.width, canvas.height); c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(0, 0, canvas.width, canvas.height); }
    }
  }, []);

  const handleReset = () => {
    currentSymRef.current = [];
    recentDurationsRef.current = [];
    dotEstimateRef.current = 80;
    lockedHzRef.current = null;
    hzHistoryRef.current = [];
    toneOnTimeRef.current = 0;
    toneOffTimeRef.current = 0;
    lastToneRef.current = false;
    setDecoded([]);
    setCurrentSymbols('');
    setDetectedHz(null);
    setDetectedWpm(null);
  };

  useEffect(() => () => stop(), [stop]);

  // Текст для отображения
  const decodedText = decoded.map(d => d.ch).join('');

  return (
    <div className="space-y-4 animate-fade-in">

      {/* Заголовок и управление */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 bg-secondary p-1 rounded-xl">
          {(['both', 'ru', 'en'] as const).map(l => (
            <button key={l} onClick={() => setLang(l)}
              className={`px-3 py-2 rounded-lg text-sm font-semibold transition-all ${lang === l ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
              {l === 'both' ? 'Авто' : l === 'ru' ? 'Рус' : 'Eng'}
            </button>
          ))}
        </div>

        {running ? (
          <button onClick={stop} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500/15 border border-red-500/30 text-red-400 text-sm font-semibold hover:bg-red-500/25 transition-all">
            <Icon name="Square" size={14} />
            Остановить
          </button>
        ) : (
          <button onClick={start} className="btn-primary flex items-center gap-2">
            <Icon name="Mic" size={14} />
            Включить микрофон
          </button>
        )}

        {(decoded.length > 0 || currentSymbols) && (
          <button onClick={handleReset} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-border hover:border-primary/40 px-3 py-1.5 rounded-lg transition-all ml-auto">
            <Icon name="RotateCcw" size={12} />
            Очистить
          </button>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
          <Icon name="AlertCircle" size={16} />
          {error}
        </div>
      )}

      {/* Спектр */}
      <div className="card-morse p-0 overflow-hidden">
        <div className="flex items-center justify-between px-4 pt-3 pb-2">
          <div className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Спектр сигнала</div>
          <div className="flex items-center gap-4">
            {detectedHz && (
              <div className="flex items-center gap-1.5 text-xs">
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                <span className="text-muted-foreground">Частота:</span>
                <span className="font-mono font-semibold text-amber-400">{detectedHz} Гц</span>
              </div>
            )}
            {detectedWpm && (
              <div className="flex items-center gap-1.5 text-xs">
                <span className="w-2 h-2 rounded-full bg-primary" />
                <span className="text-muted-foreground">Скорость:</span>
                <span className="font-mono font-semibold text-primary">{detectedWpm} зн/мин</span>
              </div>
            )}
          </div>
        </div>
        <canvas
          ref={canvasRef}
          width={800}
          height={120}
          className="w-full"
          style={{ display: 'block', background: 'rgba(0,0,0,0.15)' }}
        />
      </div>

      {/* Индикатор сигнала */}
      {running && (
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground uppercase tracking-wider w-16">Сигнал</span>
          <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-75 ${toneActive ? 'bg-amber-400' : 'bg-primary/40'}`}
              style={{ width: `${signalLevel * 100}%` }}
            />
          </div>
          <div className={`w-16 text-right font-mono text-xs font-semibold transition-colors ${toneActive ? 'text-amber-400' : 'text-muted-foreground'}`}>
            {toneActive ? '● ТОН' : '○ тихо'}
          </div>
        </div>
      )}

      {/* Текущий символ */}
      {running && (
        <div className="flex items-center gap-3 min-h-8">
          <span className="text-xs text-muted-foreground uppercase tracking-wider w-16">Буква</span>
          <span className="font-mono text-primary text-lg tracking-widest font-bold">
            {currentSymbols || <span className="text-muted-foreground/40 text-sm font-normal">ожидание...</span>}
          </span>
        </div>
      )}

      {/* Декодированный текст */}
      <div className="card-morse min-h-32">
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs text-muted-foreground uppercase tracking-wider">Декодированный текст</div>
          {decodedText.trim() && (
            <button
              onClick={() => navigator.clipboard?.writeText(decodedText.trim())}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <Icon name="Copy" size={11} />
              Копировать
            </button>
          )}
        </div>

        {decoded.length === 0 && !running && (
          <div className="text-muted-foreground text-sm italic">Включите микрофон и начните передачу...</div>
        )}
        {decoded.length === 0 && running && (
          <div className="text-muted-foreground text-sm italic animate-pulse">Слушаю сигнал...</div>
        )}

        <div className="font-mono text-2xl font-bold tracking-widest text-foreground leading-relaxed break-all">
          {decoded.map((d, i) => (
            d.ch === ' '
              ? <span key={i} className="inline-block w-6" />
              : <span key={i} title={d.code} className="text-foreground hover:text-primary transition-colors cursor-default">{d.ch}</span>
          ))}
          {currentSymbols && running && (
            <span className="text-primary opacity-60 animate-pulse">_</span>
          )}
        </div>
      </div>

      {/* Подсказка */}
      {!running && (
        <div className="rounded-xl p-4 bg-secondary/50 border border-border/40 text-sm text-muted-foreground space-y-1.5">
          <div className="flex items-start gap-2">
            <Icon name="Info" size={14} className="text-primary mt-0.5 shrink-0" />
            <div>
              <span className="text-foreground font-medium">Как пользоваться:</span> включите микрофон и поднесите источник сигнала Морзе (трансивер, другое устройство). Декодер автоматически найдёт частоту тона и скорость передачи.
            </div>
          </div>
          <div className="flex items-start gap-2 pl-5">
            <div>Поддерживаемые частоты тона: <span className="font-mono text-primary">{MIN_TONE_HZ}–{MAX_TONE_HZ} Гц</span>. Чем чище сигнал — тем точнее декодирование.</div>
          </div>
        </div>
      )}
    </div>
  );
}
