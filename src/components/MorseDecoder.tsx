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
const FFT_SIZE = 4096;
const SAMPLE_RATE = 44100;
const MIN_TONE_HZ = 300;
const MAX_TONE_HZ = 1200;
const SPECTRUM_BINS = 80;

// Сколько dB нужно быть громче текущего, чтобы переключить частоту
const RETUNE_DB_MARGIN = 8;
// Интервал пересканирования (мс)
const RETUNE_INTERVAL_MS = 3000;

// ── Типы ──────────────────────────────────────────────────────
// type: 'char' | 'space' (пауза слова) | 'group' (граница группы 5 зн)
interface DecodedToken {
  type: 'char' | 'space' | 'group';
  ch: string;   // символ или '' для разделителей
  code: string;
  ts: number;
}

export default function MorseDecoder() {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [lang, setLang] = useState<'ru' | 'en' | 'both'>('both');

  const [detectedHz, setDetectedHz] = useState<number | null>(null);
  const [detectedWpm, setDetectedWpm] = useState<number | null>(null);
  const [signalLevel, setSignalLevel] = useState(0);
  const [toneActive, setToneActive] = useState(false);
  const [lockedDbLevel, setLockedDbLevel] = useState<number | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tokens, setTokens] = useState<DecodedToken[]>([]);
  const [currentSymbols, setCurrentSymbols] = useState<string>('');

  // Audio refs
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const freqDataRef = useRef<Float32Array | null>(null);
  const timeDataRef = useRef<Float32Array | null>(null);

  // Morse state refs
  const toneOnTimeRef = useRef<number>(0);
  const toneOffTimeRef = useRef<number>(0);
  const lastToneRef = useRef<boolean>(false);
  const currentSymRef = useRef<string[]>([]);
  const dotEstimateRef = useRef<number>(80);
  const recentDurationsRef = useRef<number[]>([]);

  // Frequency lock refs
  const lockedHzRef = useRef<number | null>(null);
  const lockedDbRef = useRef<number>(-200);   // уровень зафиксированной частоты
  const hzHistoryRef = useRef<number[]>([]);
  const lastRetuneRef = useRef<number>(0);

  // Счётчик символов в текущей группе (не считая пробелов)
  const groupCharCountRef = useRef<number>(0);

  // ── Утилиты спектра ──────────────────────────────────────────
  const hzToIndex = (hz: number, sr: number, fft: number) =>
    Math.round((hz / sr) * fft);

  // Возвращает {hz, db} пика в диапазоне
  const findPeak = (data: Float32Array, sr: number, fft: number): { hz: number; db: number } | null => {
    const lo = hzToIndex(MIN_TONE_HZ, sr, fft);
    const hi = hzToIndex(MAX_TONE_HZ, sr, fft);
    let maxDb = -200, maxIdx = -1;
    for (let i = lo; i <= hi; i++) {
      if (data[i] > maxDb) { maxDb = data[i]; maxIdx = i; }
    }
    if (maxIdx < 0 || maxDb < -65) return null;
    return { hz: (maxIdx / fft) * sr, db: maxDb };
  };

  // Уровень (dB) вокруг конкретной частоты
  const peakDbAt = (data: Float32Array, sr: number, fft: number, hz: number, bwHz = 60): number => {
    const ci = hzToIndex(hz, sr, fft);
    const bw = Math.max(2, hzToIndex(bwHz, sr, fft));
    let maxDb = -200;
    for (let i = Math.max(0, ci - bw); i <= Math.min(data.length - 1, ci + bw); i++) {
      if (data[i] > maxDb) maxDb = data[i];
    }
    return maxDb;
  };

  // ── Рисование спектра ─────────────────────────────────────────
  const drawSpectrum = useCallback((
    freqDb: Float32Array,
    sr: number,
    fft: number,
    lockedHz: number | null,
    isTone: boolean
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
      const nearLocked = lockedHz && Math.abs(hz - lockedHz) < 40;
      const inRange = hz >= MIN_TONE_HZ && hz <= MAX_TONE_HZ;

      ctx.fillStyle =
        nearLocked && isTone ? 'rgba(251,191,36,0.95)' :
        nearLocked ? 'rgba(251,191,36,0.5)' :
        inRange ? 'rgba(99,102,241,0.55)' :
        'rgba(100,116,139,0.25)';
      ctx.fillRect(b * binW + 1, H - barH, binW - 2, barH);
    }

    // Метки
    ctx.font = '10px monospace';
    for (const hz of [400, 600, 800, 1000, 1200]) {
      const x = ((hz - displayLo) / (displayHi - displayLo)) * W;
      ctx.fillStyle = 'rgba(148,163,184,0.2)';
      ctx.fillRect(x, 0, 1, H - 14);
      ctx.fillStyle = 'rgba(148,163,184,0.6)';
      ctx.fillText(`${hz}`, x - 12, H - 2);
    }

    // Линия зафиксированной частоты
    if (lockedHz) {
      const x = ((lockedHz - displayLo) / (displayHi - displayLo)) * W;
      ctx.strokeStyle = isTone ? 'rgba(251,191,36,0.95)' : 'rgba(251,191,36,0.4)';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H - 14); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = isTone ? 'rgba(251,191,36,1)' : 'rgba(251,191,36,0.6)';
      ctx.font = 'bold 10px monospace';
      ctx.fillText(`${Math.round(lockedHz)}Гц`, Math.min(x + 4, W - 52), 12);
    }
  }, []);

  // ── Декодирование символа ─────────────────────────────────────
  const flushLetter = useCallback((isWordSpace: boolean = false) => {
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
        // Определяем: нужна ли граница группы ПЕРЕД этим символом
        // groupCharCount — сколько символов уже в текущей группе
        const beforeCount = groupCharCountRef.current;
        if (beforeCount > 0 && beforeCount % 5 === 0) {
          // вставляем разделитель группы
          setTokens(prev => [
            ...prev.slice(-500),
            { type: 'group', ch: '', code: '', ts: Date.now() },
            { type: 'char', ch, code, ts: Date.now() }
          ]);
        } else {
          setTokens(prev => [...prev.slice(-500), { type: 'char', ch, code, ts: Date.now() }]);
        }
        groupCharCountRef.current += 1;
      }
      currentSymRef.current = [];
      setCurrentSymbols('');
    }

    if (isWordSpace) {
      setTokens(prev => [...prev.slice(-500), { type: 'space', ch: ' ', code: '', ts: Date.now() }]);
      // Пробел не сбрасывает счётчик группы — группы продолжаются сквозь слова
    }
  }, [lang]);

  // ── Обработка тон вкл/выкл ───────────────────────────────────
  const processToneChange = useCallback((isOn: boolean, now: number) => {
    if (isOn && !lastToneRef.current) {
      const offDur = now - toneOffTimeRef.current;
      if (toneOffTimeRef.current > 0) {
        const dot = dotEstimateRef.current;
        // Пауза > 6 dot — слово (сброс буквы + пробел)
        // Пауза > 2.5 dot — буква (только сброс буквы)
        if (offDur > dot * 6) {
          flushLetter(true);
        } else if (offDur > dot * 2.5) {
          flushLetter(false);
        }
      }
      toneOnTimeRef.current = now;
      lastToneRef.current = true;
    } else if (!isOn && lastToneRef.current) {
      const onDur = now - toneOnTimeRef.current;
      const dot = dotEstimateRef.current;
      const sym = onDur < dot * 2.2 ? '.' : '-';

      if (sym === '.') {
        recentDurationsRef.current = [...recentDurationsRef.current.slice(-11), onDur];
        const arr = recentDurationsRef.current;
        // медиана для устойчивости к выбросам
        const sorted = [...arr].sort((a, b) => a - b);
        const median = sorted[Math.floor(sorted.length / 2)];
        dotEstimateRef.current = Math.max(25, Math.min(600, median));
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
    setSignalLevel(Math.min(1, rms * 8));

    const peak = findPeak(freqDataRef.current, sr, FFT_SIZE);
    const now = performance.now();

    // ── Автонастройка: фиксируем самый громкий сигнал ──────────
    if (peak) {
      const shouldRetune =
        // ещё не зафиксировались
        !lockedHzRef.current ||
        // прошло достаточно времени И новый сигнал значительно громче текущего
        (now - lastRetuneRef.current > RETUNE_INTERVAL_MS &&
          peak.db > lockedDbRef.current + RETUNE_DB_MARGIN);

      if (shouldRetune) {
        // накапливаем историю для стабилизации
        hzHistoryRef.current = [...hzHistoryRef.current.slice(-3), peak.hz];
        if (hzHistoryRef.current.length >= 3) {
          const avgHz = hzHistoryRef.current.reduce((a, b) => a + b, 0) / hzHistoryRef.current.length;
          lockedHzRef.current = avgHz;
          lockedDbRef.current = peak.db;
          lastRetuneRef.current = now;
          setDetectedHz(Math.round(avgHz));
          setLockedDbLevel(Math.round(peak.db));
        }
      } else if (lockedHzRef.current && Math.abs(peak.hz - lockedHzRef.current) < 80) {
        // Плавная подстройка частоты зафиксированного сигнала
        lockedHzRef.current = lockedHzRef.current * 0.97 + peak.hz * 0.03;
        // Обновляем уровень зафиксированного сигнала
        lockedDbRef.current = lockedDbRef.current * 0.95 + peak.db * 0.05;
        setDetectedHz(Math.round(lockedHzRef.current));
      }
    }

    // Детектируем тон по энергии вокруг зафиксированной частоты
    let isTone = false;
    if (lockedHzRef.current) {
      const db = peakDbAt(freqDataRef.current, sr, FFT_SIZE, lockedHzRef.current);
      // порог = зафиксированный уровень минус 20 dB
      isTone = db > lockedDbRef.current - 20;
    } else {
      isTone = rms > 0.012;
    }

    setToneActive(isTone);
    processToneChange(isTone, now);
    drawSpectrum(freqDataRef.current, sr, FFT_SIZE, lockedHzRef.current, isTone);
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
      analyser.smoothingTimeConstant = 0.25;
      source.connect(analyser);
      analyserRef.current = analyser;
      freqDataRef.current = new Float32Array(analyser.frequencyBinCount);
      timeDataRef.current = new Float32Array(analyser.fftSize);

      currentSymRef.current = [];
      recentDurationsRef.current = [];
      dotEstimateRef.current = 80;
      lockedHzRef.current = null;
      lockedDbRef.current = -200;
      hzHistoryRef.current = [];
      lastRetuneRef.current = 0;
      toneOnTimeRef.current = 0;
      toneOffTimeRef.current = 0;
      lastToneRef.current = false;
      groupCharCountRef.current = 0;
      setTokens([]);
      setCurrentSymbols('');
      setDetectedHz(null);
      setDetectedWpm(null);
      setLockedDbLevel(null);

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
    currentSymRef.current = [];
    recentDurationsRef.current = [];
    dotEstimateRef.current = 80;
    lockedHzRef.current = null;
    lockedDbRef.current = -200;
    hzHistoryRef.current = [];
    lastRetuneRef.current = 0;
    toneOnTimeRef.current = 0;
    toneOffTimeRef.current = 0;
    lastToneRef.current = false;
    groupCharCountRef.current = 0;
    setTokens([]);
    setCurrentSymbols('');
    setDetectedHz(null);
    setDetectedWpm(null);
    setLockedDbLevel(null);
  };

  const handleRetune = () => {
    lockedHzRef.current = null;
    lockedDbRef.current = -200;
    hzHistoryRef.current = [];
    lastRetuneRef.current = 0;
    setDetectedHz(null);
    setLockedDbLevel(null);
  };

  // ── Сохранение в файл ─────────────────────────────────────────
  const handleSave = () => {
    const lines: string[] = [];
    let line = '';
    let groupCount = 0;
    let charInGroup = 0;

    for (const t of tokens) {
      if (t.type === 'char') {
        line += t.ch;
        charInGroup++;
        if (charInGroup >= 5) {
          groupCount++;
          line += ' ';
          charInGroup = 0;
          if (groupCount % 10 === 0) { lines.push(line.trimEnd()); line = ''; groupCount = 0; }
        }
      } else if (t.type === 'group') {
        if (charInGroup > 0) { line += ' '; charInGroup = 0; groupCount++; }
        if (groupCount % 10 === 0 && groupCount > 0) { lines.push(line.trimEnd()); line = ''; groupCount = 0; }
      } else if (t.type === 'space') {
        line += ' ';
      }
    }
    if (line.trim()) lines.push(line.trimEnd());

    const text = lines.join('\n');
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `morse_decoded_${new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => () => stop(), [stop]);

  // ── Рендер декодированного текста с группами ─────────────────
  const renderDecoded = () => {
    const result: React.ReactNode[] = [];
    let groupBuf: DecodedToken[] = [];
    let groupIdx = 0;

    const flushGroup = () => {
      if (groupBuf.length === 0) return;
      result.push(
        <span key={`g-${groupIdx++}`} className="inline-block mr-3 mb-1">
          {groupBuf.map((t, i) => (
            <span key={i} title={t.code}
              className="font-black text-foreground hover:text-primary transition-colors cursor-default">
              {t.ch}
            </span>
          ))}
        </span>
      );
      groupBuf = [];
    };

    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (t.type === 'char') {
        groupBuf.push(t);
      } else if (t.type === 'group') {
        flushGroup();
      } else if (t.type === 'space') {
        flushGroup();
        result.push(<span key={`sp-${i}`} className="inline-block w-5" />);
      }
    }
    flushGroup();

    if (currentSymbols && running) {
      result.push(
        <span key="cur" className="font-mono text-primary opacity-60 animate-pulse">{currentSymbols}_</span>
      );
    }
    return result;
  };

  const hasContent = tokens.length > 0 || !!currentSymbols;

  return (
    <div className="space-y-4 animate-fade-in">

      {/* Панель управления */}
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

        <div className="flex items-center gap-2 ml-auto">
          {running && detectedHz && (
            <button onClick={handleRetune}
              className="flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300 border border-amber-500/30 hover:border-amber-400/50 px-3 py-1.5 rounded-lg transition-all">
              <Icon name="RefreshCw" size={12} />
              Сброс частоты
            </button>
          )}
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

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
          <Icon name="AlertCircle" size={16} />
          {error}
        </div>
      )}

      {/* Спектр */}
      <div className="card-morse p-0 overflow-hidden">
        <div className="flex items-center justify-between px-4 pt-3 pb-2 flex-wrap gap-2">
          <div className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Спектр сигнала</div>
          <div className="flex items-center gap-4 flex-wrap">
            {detectedHz ? (
              <div className="flex items-center gap-1.5 text-xs">
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                <span className="text-muted-foreground">Частота:</span>
                <span className="font-mono font-semibold text-amber-400">{detectedHz} Гц</span>
                {lockedDbLevel && (
                  <span className="font-mono text-muted-foreground">({lockedDbLevel} dB)</span>
                )}
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

      {/* Индикатор уровня */}
      {running && (
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground uppercase tracking-wider w-16 shrink-0">Сигнал</span>
          <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-75 ${toneActive ? 'bg-amber-400' : 'bg-primary/40'}`}
              style={{ width: `${signalLevel * 100}%` }}
            />
          </div>
          <div className={`w-18 text-right font-mono text-xs font-semibold transition-colors shrink-0 ${toneActive ? 'text-amber-400' : 'text-muted-foreground'}`}>
            {toneActive ? '● ТОН' : '○ тихо'}
          </div>
        </div>
      )}

      {/* Текущий символ */}
      {running && (
        <div className="flex items-center gap-3 min-h-8">
          <span className="text-xs text-muted-foreground uppercase tracking-wider w-16 shrink-0">Буква</span>
          <span className="font-mono text-primary text-lg tracking-widest font-bold">
            {currentSymbols || <span className="text-muted-foreground/40 text-sm font-normal">ожидание...</span>}
          </span>
        </div>
      )}

      {/* Декодированный текст */}
      <div className="card-morse min-h-36">
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs text-muted-foreground uppercase tracking-wider">
            Декодированный текст
            {tokens.filter(t => t.type === 'char').length > 0 && (
              <span className="ml-2 text-primary">{tokens.filter(t => t.type === 'char').length} зн</span>
            )}
          </div>
          {tokens.filter(t => t.type === 'char').length > 0 && (
            <button
              onClick={() => navigator.clipboard?.writeText(
                tokens.map(t => t.type === 'space' ? ' ' : t.ch).join('').trim()
              )}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
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

        <div className="font-mono text-2xl tracking-wider leading-relaxed break-all">
          {renderDecoded()}
        </div>
      </div>

      {/* Подсказка */}
      {!running && (
        <div className="rounded-xl p-4 bg-secondary/50 border border-border/40 text-sm text-muted-foreground space-y-1.5">
          <div className="flex items-start gap-2">
            <Icon name="Info" size={14} className="text-primary mt-0.5 shrink-0" />
            <div>
              <span className="text-foreground font-medium">Как пользоваться:</span> включите микрофон и поднесите источник сигнала Морзе (трансивер, другое устройство). Декодер автоматически найдёт частоту тона и скорость.
            </div>
          </div>
          <div className="pl-5">
            Диапазон частот: <span className="font-mono text-primary">{MIN_TONE_HZ}–{MAX_TONE_HZ} Гц</span> · Символы группируются по 5 знаков · При смене сигнала нажмите «Сброс частоты».
          </div>
        </div>
      )}
    </div>
  );
}
