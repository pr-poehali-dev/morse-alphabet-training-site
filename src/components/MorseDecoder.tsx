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
const SPECTRUM_BINS = 80;

// Defaults
const DEFAULT_MIC_SENS = 15;   // 1–100, чем меньше — тем чувствительнее
const DEFAULT_LETTER_K = 2.0;  // межбуквенная пауза = k × dot
const DEFAULT_GAP_K    = 4.0;  // увеличенная пауза
const DEFAULT_WORD_K   = 7.0;  // пауза-слово

interface DecodedToken {
  type: 'char' | 'space' | 'gap';
  ch: string;
  code: string;
  ts: number;
}

function formatDateTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export default function MorseDecoder() {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [lang, setLang] = useState<'ru' | 'en' | 'both'>('both');
  const [showSettings, setShowSettings] = useState(false);

  // ── Настройки (state для UI + ref для RAF-loop) ────────────
  const [micSens, setMicSens] = useState(DEFAULT_MIC_SENS);
  const [letterK, setLetterK] = useState(DEFAULT_LETTER_K);
  const [gapK, setGapK]       = useState(DEFAULT_GAP_K);
  const [wordK, setWordK]      = useState(DEFAULT_WORD_K);
  const micSensRef  = useRef(DEFAULT_MIC_SENS);
  const letterKRef  = useRef(DEFAULT_LETTER_K);
  const gapKRef     = useRef(DEFAULT_GAP_K);
  const wordKRef    = useRef(DEFAULT_WORD_K);

  const [detectedHz, setDetectedHz]   = useState<number | null>(null);
  const [detectedWpm, setDetectedWpm] = useState<number | null>(null);
  const [signalLevel, setSignalLevel] = useState(0);
  const [toneActive, setToneActive]   = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tokens, setTokens]           = useState<DecodedToken[]>([]);
  const [currentSymbols, setCurrentSymbols] = useState<string>('');

  const sessionStartRef = useRef<Date | null>(null);

  // Audio refs
  const audioCtxRef  = useRef<AudioContext | null>(null);
  const analyserRef  = useRef<AnalyserNode | null>(null);
  const streamRef    = useRef<MediaStream | null>(null);
  const rafRef       = useRef<number | null>(null);
  const freqDataRef  = useRef<Float32Array | null>(null);
  const timeDataRef  = useRef<Float32Array | null>(null);

  // Morse state refs
  const toneOnTimeRef      = useRef<number>(0);
  const toneOffTimeRef     = useRef<number>(0);
  const lastToneRef        = useRef<boolean>(false);
  const currentSymRef      = useRef<string[]>([]);
  const dotEstimateRef     = useRef<number>(80);
  const recentDurationsRef = useRef<number[]>([]);
  const lockedHzRef        = useRef<number | null>(null);
  const hzHistoryRef       = useRef<number[]>([]);

  // Синхронизируем refs с state (работает без перезапуска)
  useEffect(() => { micSensRef.current = micSens; }, [micSens]);
  useEffect(() => { letterKRef.current = letterK; }, [letterK]);
  useEffect(() => { gapKRef.current    = gapK;    }, [gapK]);
  useEffect(() => { wordKRef.current   = wordK;   }, [wordK]);

  // ── Утилиты спектра ──────────────────────────────────────────
  const hzToIndex = (hz: number, sr: number, fft: number) =>
    Math.round((hz / sr) * fft);

  const findDominantHz = (data: Float32Array, sr: number, fft: number): number | null => {
    const lo = hzToIndex(MIN_TONE_HZ, sr, fft);
    const hi = hzToIndex(MAX_TONE_HZ, sr, fft);
    let maxDb = -200, maxIdx = -1;
    for (let i = lo; i <= hi; i++) {
      if (data[i] > maxDb) { maxDb = data[i]; maxIdx = i; }
    }
    if (maxIdx < 0 || maxDb < -60) return null;
    return (maxIdx / fft) * sr;
  };

  // ── Рисование спектра ─────────────────────────────────────────
  const drawSpectrum = useCallback((
    freqDb: Float32Array, sr: number, fft: number,
    lockedHz: number | null, isTone: boolean, noiseFloor: number
  ) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(0, 0, W, H);

    const displayLo = 200, displayHi = 1400;
    const loIdx = hzToIndex(displayLo, sr, fft);
    const hiIdx = hzToIndex(displayHi, sr, fft);
    const range = hiIdx - loIdx;
    const binW = W / SPECTRUM_BINS;

    for (let b = 0; b < SPECTRUM_BINS; b++) {
      const s = loIdx + Math.floor((b / SPECTRUM_BINS) * range);
      const e = loIdx + Math.floor(((b + 1) / SPECTRUM_BINS) * range);
      let maxVal = -160;
      for (let i = s; i < e && i < freqDb.length; i++) {
        if (freqDb[i] > maxVal) maxVal = freqDb[i];
      }
      const norm = Math.max(0, (maxVal + 100) / 60);
      const barH = norm * H * 0.9;
      const hz = displayLo + ((b + 0.5) / SPECTRUM_BINS) * (displayHi - displayLo);
      const inRange  = hz >= MIN_TONE_HZ && hz <= MAX_TONE_HZ;
      const nearLocked = lockedHz && Math.abs(hz - lockedHz) < 40;

      ctx.fillStyle =
        nearLocked && isTone ? 'rgba(251,191,36,0.9)' :
        nearLocked ? 'rgba(251,191,36,0.5)' :
        inRange ? 'rgba(99,102,241,0.6)' :
        'rgba(100,116,139,0.3)';
      ctx.fillRect(b * binW + 1, H - barH, binW - 2, barH);
    }

    // Линия порога чувствительности
    const threshNorm = Math.max(0, (20 * Math.log10(noiseFloor) + 100) / 60);
    const threshY = H - threshNorm * H * 0.9;
    ctx.strokeStyle = 'rgba(239,68,68,0.45)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 4]);
    ctx.beginPath(); ctx.moveTo(0, threshY); ctx.lineTo(W, threshY); ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = 'rgba(148,163,184,0.7)';
    ctx.font = '10px monospace';
    for (const hz of [400, 600, 800, 1000, 1200]) {
      const x = ((hz - displayLo) / (displayHi - displayLo)) * W;
      ctx.fillText(`${hz}`, x - 12, H - 2);
      ctx.fillStyle = 'rgba(148,163,184,0.2)';
      ctx.fillRect(x, 0, 1, H - 14);
      ctx.fillStyle = 'rgba(148,163,184,0.7)';
    }

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
  const flushLetter = useCallback((pauseType: 'letter' | 'word' | 'gap') => {
    const syms = currentSymRef.current;
    if (syms.length > 0) {
      const code = syms.join('');
      const ch = MORSE_REVERSE[code] ?? '?';
      const isRu = ch in MORSE_RU;
      const isEn = ch in MORSE_EN;
      const isDig = ch in MORSE_DIGITS;
      let show = true;
      if (lang === 'ru' && !isRu && !isDig) show = false;
      if (lang === 'en' && !isEn && !isDig) show = false;
      if (show) {
        setTokens(prev => [...prev.slice(-300), { type: 'char', ch, code, ts: Date.now() }]);
      }
      currentSymRef.current = [];
      setCurrentSymbols('');
    }
    if (pauseType === 'word') {
      setTokens(prev => [...prev.slice(-300), { type: 'space', ch: ' ', code: '', ts: Date.now() }]);
    } else if (pauseType === 'gap') {
      setTokens(prev => [...prev.slice(-300), { type: 'gap', ch: '  ', code: '', ts: Date.now() }]);
    }
  }, [lang]);

  // ── Обработка тон вкл/выкл ───────────────────────────────────
  const processToneChange = useCallback((isOn: boolean, now: number) => {
    if (isOn && !lastToneRef.current) {
      const offDur = now - toneOffTimeRef.current;
      if (toneOffTimeRef.current > 0) {
        const dot = dotEstimateRef.current;
        const lk = letterKRef.current;
        const gk = gapKRef.current;
        const wk = wordKRef.current;
        if (offDur > dot * wk) {
          flushLetter('word');
        } else if (offDur > dot * gk) {
          flushLetter('gap');
        } else if (offDur > dot * lk) {
          flushLetter('letter');
        }
      }
      toneOnTimeRef.current = now;
      lastToneRef.current = true;
    } else if (!isOn && lastToneRef.current) {
      const onDur = now - toneOnTimeRef.current;
      const dot = dotEstimateRef.current;
      const sym = onDur < dot * 2.2 ? '.' : '-';

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

    const sr = audioCtxRef.current?.sampleRate ?? SAMPLE_RATE;
    analyserRef.current.getFloatFrequencyData(freqDataRef.current);
    analyserRef.current.getFloatTimeDomainData(timeDataRef.current);

    // RMS
    let rms = 0;
    for (let i = 0; i < timeDataRef.current.length; i++) rms += timeDataRef.current[i] ** 2;
    rms = Math.sqrt(rms / timeDataRef.current.length);
    setSignalLevel(Math.min(1, rms * 6));

    // Порог чувствительности из настроек: sens 1-100 → noiseFloor 0.002..0.08
    const noiseFloor = 0.002 + (micSensRef.current / 100) * 0.078;

    // Обнаружение доминантной частоты
    const domHz = findDominantHz(freqDataRef.current, sr, FFT_SIZE);
    if (domHz && rms > noiseFloor * 0.5) {
      hzHistoryRef.current = [...hzHistoryRef.current.slice(-4), domHz];
      const avgHz = hzHistoryRef.current.reduce((a, b) => a + b, 0) / hzHistoryRef.current.length;
      if (!lockedHzRef.current) {
        lockedHzRef.current = avgHz;
      } else if (Math.abs(avgHz - lockedHzRef.current) < 100) {
        lockedHzRef.current = lockedHzRef.current * 0.9 + avgHz * 0.1;
      }
      setDetectedHz(Math.round(lockedHzRef.current));
    }

    // Детектирование тона
    let isTone = false;
    if (lockedHzRef.current) {
      const ci = hzToIndex(lockedHzRef.current, sr, FFT_SIZE);
      const bw = Math.max(2, hzToIndex(60, sr, FFT_SIZE));
      let energy = 0;
      for (let i = Math.max(0, ci - bw); i <= Math.min(freqDataRef.current.length - 1, ci + bw); i++) {
        energy += Math.pow(10, freqDataRef.current[i] / 20);
      }
      isTone = energy > noiseFloor * (bw * 2 + 1);
    } else {
      isTone = rms > noiseFloor;
    }

    setToneActive(isTone);
    processToneChange(isTone, performance.now());
    drawSpectrum(freqDataRef.current, sr, FFT_SIZE, lockedHzRef.current, isTone, noiseFloor);
  }, [processToneChange, drawSpectrum]);

  // ── Запуск / остановка ────────────────────────────────────────
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
      timeDataRef.current  = new Float32Array(analyser.fftSize);

      currentSymRef.current      = [];
      recentDurationsRef.current = [];
      dotEstimateRef.current     = 80;
      lockedHzRef.current        = null;
      hzHistoryRef.current       = [];
      toneOnTimeRef.current      = 0;
      toneOffTimeRef.current     = 0;
      lastToneRef.current        = false;
      sessionStartRef.current    = new Date();
      setTokens([]);
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
    const canvas = canvasRef.current;
    if (canvas) {
      const c = canvas.getContext('2d');
      if (c) { c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(0, 0, canvas.width, canvas.height); }
    }
  }, []);

  const handleReset = () => {
    currentSymRef.current      = [];
    recentDurationsRef.current = [];
    dotEstimateRef.current     = 80;
    lockedHzRef.current        = null;
    hzHistoryRef.current       = [];
    toneOnTimeRef.current      = 0;
    toneOffTimeRef.current     = 0;
    lastToneRef.current        = false;
    sessionStartRef.current    = running ? new Date() : null;
    setTokens([]);
    setCurrentSymbols('');
    setDetectedHz(null);
    setDetectedWpm(null);
  };

  const handleResetSettings = () => {
    setMicSens(DEFAULT_MIC_SENS);
    setLetterK(DEFAULT_LETTER_K);
    setGapK(DEFAULT_GAP_K);
    setWordK(DEFAULT_WORD_K);
  };

  // ── Сохранение в файл ─────────────────────────────────────────
  const handleSave = () => {
    const sStart = sessionStartRef.current ?? new Date();
    const sEnd   = new Date();
    const text   = tokens.map(t => t.ch).join('').trim();
    const content = [
      `Сеанс декодирования азбуки Морзе`,
      `Начало:    ${formatDateTime(sStart)}`,
      `Конец:     ${formatDateTime(sEnd)}`,
      `Частота:   ${detectedHz ?? '—'} Гц`,
      `Скорость:  ${detectedWpm ?? '—'} зн/мин`,
      ``,
      `─────────────────────────────────`,
      ``,
      text,
      ``,
    ].join('\n');

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    const ts   = sStart.toISOString().slice(0, 16).replace('T', '_').replace(':', '-');
    a.download = `morse_${ts}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => () => stop(), [stop]);

  const charCount  = tokens.filter(t => t.type === 'char').length;
  const hasContent = tokens.length > 0 || !!currentSymbols;

  return (
    <div className="space-y-4 animate-fade-in">

      {/* ── Панель управления ── */}
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
          <button onClick={stop}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500/15 border border-red-500/30 text-red-400 text-sm font-semibold hover:bg-red-500/25 transition-all">
            <Icon name="Square" size={14} />
            Остановить
          </button>
        ) : (
          <button onClick={start} className="btn-primary flex items-center gap-2">
            <Icon name="Mic" size={14} />
            Включить микрофон
          </button>
        )}

        <button
          onClick={() => setShowSettings(s => !s)}
          className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-all ${showSettings ? 'border-primary/40 text-primary bg-primary/10' : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground'}`}>
          <Icon name="SlidersHorizontal" size={12} />
          Настройки
        </button>

        <div className="flex items-center gap-2 ml-auto">
          {hasContent && (
            <>
              <button onClick={handleSave}
                className="flex items-center gap-1.5 text-xs text-foreground hover:text-primary border border-border hover:border-primary/40 px-3 py-1.5 rounded-lg transition-all">
                <Icon name="Download" size={12} />
                Сохранить
              </button>
              <button onClick={handleReset}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-border hover:border-primary/40 px-3 py-1.5 rounded-lg transition-all">
                <Icon name="RotateCcw" size={12} />
                Очистить
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Панель настроек ── */}
      {showSettings && (
        <div className="card-morse border-primary/20 space-y-5 animate-fade-in">
          <div className="flex items-center justify-between">
            <div className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Настройки декодирования</div>
            <button onClick={handleResetSettings}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
              <Icon name="RotateCcw" size={11} />
              По умолчанию
            </button>
          </div>

          {/* Чувствительность микрофона */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <div className="text-sm font-medium text-foreground flex items-center gap-2">
                <Icon name="Mic" size={14} className="text-primary" />
                Чувствительность микрофона
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {micSens <= 20 ? 'Очень высокая' : micSens <= 40 ? 'Высокая' : micSens <= 60 ? 'Средняя' : micSens <= 80 ? 'Низкая' : 'Очень низкая'}
                </span>
                <span className="font-mono text-xs text-primary w-6 text-right">{micSens}</span>
              </div>
            </div>
            <input type="range" min={1} max={100} step={1} value={micSens}
              onChange={e => setMicSens(Number(e.target.value))}
              className="w-full accent-[hsl(var(--primary))]" />
            <p className="mt-1 text-xs text-muted-foreground">
              Меньше = реагирует на слабый сигнал, но может ловить шум. Больше = только громкий сигнал.
              Красная линия на спектре показывает текущий порог.
            </p>
          </div>

          {/* Пороги паузы */}
          <div className="space-y-4">
            <div className="text-sm font-medium text-foreground flex items-center gap-2">
              <Icon name="Timer" size={14} className="text-primary" />
              Пороги паузы (в длительностях точки)
            </div>

            <div className="grid sm:grid-cols-3 gap-4">
              {/* Межбуквенная */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-muted-foreground">Буква</span>
                  <span className="font-mono text-xs text-primary">{letterK.toFixed(1)}×</span>
                </div>
                <input type="range" min={1.5} max={4.0} step={0.1} value={letterK}
                  onChange={e => {
                    const v = Number(e.target.value);
                    setLetterK(v);
                    if (v >= gapK) setGapK(Math.min(10, v + 0.5));
                  }}
                  className="w-full accent-[hsl(var(--primary))]" />
                <p className="mt-1 text-xs text-muted-foreground">Разделяет знаки одной буквы от разных</p>
              </div>

              {/* Двойной пробел */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-muted-foreground">Двойной пробел</span>
                  <span className="font-mono text-xs text-primary">{gapK.toFixed(1)}×</span>
                </div>
                <input type="range" min={2.0} max={8.0} step={0.5} value={gapK}
                  onChange={e => {
                    const v = Number(e.target.value);
                    setGapK(v);
                    if (v <= letterK) setLetterK(Math.max(1.5, v - 0.5));
                    if (v >= wordK)   setWordK(Math.min(15, v + 1));
                  }}
                  className="w-full accent-[hsl(var(--primary))]" />
                <p className="mt-1 text-xs text-muted-foreground">Увеличенная пауза (замедление, граница группы)</p>
              </div>

              {/* Слово */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-muted-foreground">Новое слово</span>
                  <span className="font-mono text-xs text-primary">{wordK.toFixed(1)}×</span>
                </div>
                <input type="range" min={4.0} max={15.0} step={0.5} value={wordK}
                  onChange={e => {
                    const v = Number(e.target.value);
                    setWordK(v);
                    if (v <= gapK) setGapK(Math.max(2, v - 1));
                  }}
                  className="w-full accent-[hsl(var(--primary))]" />
                <p className="mt-1 text-xs text-muted-foreground">Пауза длиннее этого = пробел между словами</p>
              </div>
            </div>

            {/* Наглядная шкала */}
            <div className="flex items-center gap-1 text-xs text-muted-foreground bg-secondary/50 rounded-lg px-3 py-2">
              <span className="font-mono text-foreground">0</span>
              <div className="flex-1 flex">
                <div className="bg-primary/20 rounded-l h-4 flex items-center justify-center text-[10px] font-mono text-primary/70 px-1" style={{ flex: letterK }}>знак</div>
                <div className="bg-amber-500/20 h-4 flex items-center justify-center text-[10px] font-mono text-amber-400/70 px-1" style={{ flex: gapK - letterK }}>буква</div>
                <div className="bg-violet-500/20 h-4 flex items-center justify-center text-[10px] font-mono text-violet-400/70 px-1" style={{ flex: wordK - gapK }}>2×пробел</div>
                <div className="bg-emerald-500/20 rounded-r h-4 flex items-center justify-center text-[10px] font-mono text-emerald-400/70 px-1" style={{ flex: 2 }}>слово</div>
              </div>
            </div>
          </div>

          {detectedWpm && (
            <div className="text-xs text-muted-foreground border-t border-border pt-3">
              Текущая длина точки: <span className="font-mono text-primary">{Math.round(dotEstimateRef.current)} мс</span>
              {' · '}Буква = <span className="font-mono text-amber-400">{Math.round(dotEstimateRef.current * letterK)} мс</span>
              {' · '}2×пробел = <span className="font-mono text-violet-400">{Math.round(dotEstimateRef.current * gapK)} мс</span>
              {' · '}Слово = <span className="font-mono text-emerald-400">{Math.round(dotEstimateRef.current * wordK)} мс</span>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
          <Icon name="AlertCircle" size={16} />
          {error}
        </div>
      )}

      {/* ── Спектр ── */}
      <div className="card-morse p-0 overflow-hidden">
        <div className="flex items-center justify-between px-4 pt-3 pb-2 flex-wrap gap-2">
          <div className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Спектр сигнала</div>
          <div className="flex items-center gap-4 flex-wrap">
            {detectedHz ? (
              <div className="flex items-center gap-1.5 text-xs">
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                <span className="text-muted-foreground">Частота:</span>
                <span className="font-mono font-semibold text-amber-400">{detectedHz} Гц</span>
              </div>
            ) : running ? (
              <span className="text-xs text-muted-foreground animate-pulse">Поиск сигнала...</span>
            ) : null}
            {detectedWpm && (
              <div className="flex items-center gap-1.5 text-xs">
                <span className="w-2 h-2 rounded-full bg-primary" />
                <span className="text-muted-foreground">Скорость:</span>
                <span className="font-mono font-semibold text-primary">{detectedWpm} зн/мин</span>
              </div>
            )}
          </div>
        </div>
        <canvas ref={canvasRef} width={800} height={120} className="w-full"
          style={{ display: 'block', background: 'rgba(0,0,0,0.15)' }} />
      </div>

      {/* ── Индикатор уровня ── */}
      {running && (
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground uppercase tracking-wider w-16 shrink-0">Сигнал</span>
          <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-75 ${toneActive ? 'bg-amber-400' : 'bg-primary/40'}`}
              style={{ width: `${signalLevel * 100}%` }}
            />
          </div>
          <div className={`w-16 text-right font-mono text-xs font-semibold transition-colors shrink-0 ${toneActive ? 'text-amber-400' : 'text-muted-foreground'}`}>
            {toneActive ? '● ТОН' : '○ тихо'}
          </div>
        </div>
      )}

      {/* ── Текущий символ ── */}
      {running && (
        <div className="flex items-center gap-3 min-h-8">
          <span className="text-xs text-muted-foreground uppercase tracking-wider w-16 shrink-0">Буква</span>
          <span className="font-mono text-primary text-lg tracking-widest font-bold">
            {currentSymbols || <span className="text-muted-foreground/40 text-sm font-normal">ожидание...</span>}
          </span>
        </div>
      )}

      {/* ── Декодированный текст ── */}
      <div className="card-morse min-h-36">
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs text-muted-foreground uppercase tracking-wider">
            Декодированный текст
            {charCount > 0 && <span className="ml-2 text-primary">{charCount} зн</span>}
          </div>
          {charCount > 0 && (
            <button
              onClick={() => navigator.clipboard?.writeText(tokens.map(t => t.ch).join('').trim())}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
              <Icon name="Copy" size={11} />
              Копировать
            </button>
          )}
        </div>

        {tokens.length === 0 && !running && (
          <div className="text-muted-foreground text-sm italic">Включите микрофон и начните передачу...</div>
        )}
        {tokens.length === 0 && running && (
          <div className="text-muted-foreground text-sm italic animate-pulse">Слушаю сигнал...</div>
        )}

        <div className="font-mono text-2xl font-bold tracking-widest text-foreground leading-relaxed break-all">
          {tokens.map((t, i) => {
            if (t.type === 'char') return (
              <span key={i} title={t.code} className="text-foreground hover:text-primary transition-colors cursor-default">{t.ch}</span>
            );
            if (t.type === 'space') return <span key={i} className="inline-block w-5" />;
            if (t.type === 'gap')   return <span key={i} className="inline-block w-10 border-b border-dashed border-primary/25 mx-0.5" />;
            return null;
          })}
          {currentSymbols && running && (
            <span className="text-primary opacity-60 animate-pulse">_</span>
          )}
        </div>
      </div>

      {/* ── Подсказка ── */}
      {!running && (
        <div className="rounded-xl p-4 bg-secondary/50 border border-border/40 text-sm text-muted-foreground space-y-1.5">
          <div className="flex items-start gap-2">
            <Icon name="Info" size={14} className="text-primary mt-0.5 shrink-0" />
            <div>
              <span className="text-foreground font-medium">Как пользоваться:</span> включите микрофон и поднесите источник сигнала Морзе. Декодер автоматически найдёт частоту тона и скорость.
            </div>
          </div>
          <div className="pl-5">
            Диапазон: <span className="font-mono text-primary">{MIN_TONE_HZ}–{MAX_TONE_HZ} Гц</span>
            {' · '}при нестабильном декодировании откройте <strong>Настройки</strong> и подберите чувствительность и пороги паузы.
          </div>
        </div>
      )}
    </div>
  );
}
