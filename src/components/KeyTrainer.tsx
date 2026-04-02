import { useState, useRef, useCallback, useEffect } from 'react';
import Icon from '@/components/ui/icon';
import { MORSE_RU, MORSE_EN, MORSE_DIGITS } from '@/hooks/useMorse';

const ALL_CHARS_RU = Object.keys(MORSE_RU);
const ALL_CHARS_EN = Object.keys(MORSE_EN);
const ALL_CHARS_DIG = Object.keys(MORSE_DIGITS);

const MORSE_REVERSE_RU = Object.fromEntries(
  [...Object.entries(MORSE_RU), ...Object.entries(MORSE_DIGITS)].map(([k, v]) => [v, k])
);
const MORSE_REVERSE_EN = Object.fromEntries(
  [...Object.entries(MORSE_EN), ...Object.entries(MORSE_DIGITS)].map(([k, v]) => [v, k])
);

function generateGroups(count: number, lang: 'ru' | 'en'): string[] {
  const pool = lang === 'ru'
    ? [...ALL_CHARS_RU, ...ALL_CHARS_DIG]
    : [...ALL_CHARS_EN, ...ALL_CHARS_DIG];
  const groups: string[] = [];
  for (let i = 0; i < count; i++) {
    let g = '';
    for (let j = 0; j < 5; j++) g += pool[Math.floor(Math.random() * pool.length)];
    groups.push(g);
  }
  return groups;
}

function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}м ${s % 60}с` : `${s}с`;
}

type CharResult = 'pending' | 'correct' | 'wrong';

export default function KeyTrainer() {
  const [lang, setLang] = useState<'ru' | 'en'>('ru');
  const [groupCount, setGroupCount] = useState(5);
  const [groups, setGroups] = useState<string[]>(() => generateGroups(5, 'ru'));
  const [showSettings, setShowSettings] = useState(false);
  const [dotDuration, setDotDuration] = useState(120);

  const [charIndex, setCharIndex] = useState(0);
  const [charResults, setCharResults] = useState<CharResult[]>(() => Array(5 * 5).fill('pending'));
  const [isPressed, setIsPressed] = useState(false);
  const [currentLetterSymbols, setCurrentLetterSymbols] = useState<string[]>([]);
  const [showHint, setShowHint] = useState(false);

  const [startTime, setStartTime] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [finished, setFinished] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const pressStartRef = useRef<number>(0);
  const letterTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const oscillatorRef = useRef<OscillatorNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);

  const totalChars = groups.join('').length;
  const allChars = groups.join('');

  const getAudioCtx = () => {
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed')
      audioCtxRef.current = new AudioContext();
    return audioCtxRef.current;
  };

  const startTone = useCallback(() => {
    const ctx = getAudioCtx();
    if (ctx.state === 'suspended') ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.value = 700; osc.type = 'sine';
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 0.005);
    osc.start();
    oscillatorRef.current = osc; gainRef.current = gain;
  }, []);

  const stopTone = useCallback(() => {
    if (oscillatorRef.current && gainRef.current && audioCtxRef.current) {
      const ctx = audioCtxRef.current;
      gainRef.current.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.005);
      oscillatorRef.current.stop(ctx.currentTime + 0.01);
      oscillatorRef.current = null; gainRef.current = null;
    }
  }, []);

  const startTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    const t = Date.now();
    setStartTime(t);
    timerRef.current = setInterval(() => setElapsed(Date.now() - t), 100);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);

  const commitLetter = useCallback((syms: string[], currentIndex: number) => {
    if (syms.length === 0) return;
    const code = syms.join('');
    const rev = lang === 'ru' ? MORSE_REVERSE_RU : MORSE_REVERSE_EN;
    const decoded = rev[code] || '?';
    const isCorrect = decoded === allChars[currentIndex];
    setCharResults(prev => {
      const next = [...prev];
      next[currentIndex] = isCorrect ? 'correct' : 'wrong';
      return next;
    });
    setCurrentLetterSymbols([]);
    const next = currentIndex + 1;
    setCharIndex(next);
    if (next >= totalChars) { stopTimer(); setFinished(true); }
  }, [lang, allChars, totalChars, stopTimer]);

  const handlePressStart = useCallback(() => {
    if (finished || charIndex >= totalChars) return;
    if (letterTimerRef.current) clearTimeout(letterTimerRef.current);
    pressStartRef.current = Date.now();
    setIsPressed(true);
    startTone();
    if (startTime === null) startTimer();
  }, [finished, charIndex, totalChars, startTone, startTime, startTimer]);

  const handlePressEnd = useCallback(() => {
    if (!isPressed) return;
    const duration = Date.now() - pressStartRef.current;
    setIsPressed(false);
    stopTone();
    const sym: '.' | '-' = duration < dotDuration * 2.5 ? '.' : '-';
    setCurrentLetterSymbols(prev => {
      const next = [...prev, sym];
      if (letterTimerRef.current) clearTimeout(letterTimerRef.current);
      letterTimerRef.current = setTimeout(() => {
        setCharIndex(ci => { commitLetter(next, ci); return ci; });
      }, dotDuration * 3);
      return next;
    });
  }, [isPressed, stopTone, commitLetter, dotDuration]);

  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat) { e.preventDefault(); handlePressStart(); }
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') { e.preventDefault(); handlePressEnd(); }
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => { window.removeEventListener('keydown', onDown); window.removeEventListener('keyup', onUp); };
  }, [handlePressStart, handlePressEnd]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (letterTimerRef.current) clearTimeout(letterTimerRef.current);
    };
  }, []);

  const handleReset = useCallback(() => {
    if (letterTimerRef.current) clearTimeout(letterTimerRef.current);
    stopTimer(); stopTone();
    setGroups(generateGroups(groupCount, lang));
    setCharIndex(0);
    setCharResults(Array(groupCount * 5).fill('pending'));
    setCurrentLetterSymbols([]);
    setIsPressed(false);
    setStartTime(null);
    setElapsed(0);
    setFinished(false);
  }, [groupCount, lang, stopTimer, stopTone]);

  const handleLangChange = (l: 'ru' | 'en') => {
    setLang(l);
    if (letterTimerRef.current) clearTimeout(letterTimerRef.current);
    stopTimer(); stopTone();
    const g = generateGroups(groupCount, l);
    setGroups(g);
    setCharIndex(0);
    setCharResults(Array(groupCount * 5).fill('pending'));
    setCurrentLetterSymbols([]);
    setIsPressed(false);
    setStartTime(null);
    setElapsed(0);
    setFinished(false);
  };

  const handleGroupCountChange = (n: number) => {
    const c = Math.max(1, Math.min(10, n));
    setGroupCount(c);
    if (letterTimerRef.current) clearTimeout(letterTimerRef.current);
    stopTimer(); stopTone();
    setGroups(generateGroups(c, lang));
    setCharIndex(0);
    setCharResults(Array(c * 5).fill('pending'));
    setCurrentLetterSymbols([]);
    setIsPressed(false);
    setStartTime(null);
    setElapsed(0);
    setFinished(false);
  };

  const correctCount = charResults.filter(r => r === 'correct').length;
  const wrongCount = charResults.filter(r => r === 'wrong').length;
  const currentCode = currentLetterSymbols.join('');
  const charsPerMin = elapsed > 0 ? Math.round((totalChars / (elapsed / 1000)) * 60) : 0;

  return (
    <div className="space-y-4 animate-fade-in">

      {/* Верхняя панель */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 bg-secondary p-1 rounded-xl">
          {(['ru', 'en'] as const).map(l => (
            <button key={l} onClick={() => handleLangChange(l)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${lang === l ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
              {l === 'ru' ? 'Рус' : 'Eng'}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground uppercase tracking-wider">Групп:</span>
          <button onClick={() => handleGroupCountChange(groupCount - 1)} className="w-7 h-7 rounded-lg bg-secondary text-foreground font-bold text-sm flex items-center justify-center">−</button>
          <span className="w-6 text-center text-sm font-mono font-semibold text-primary">{groupCount}</span>
          <button onClick={() => handleGroupCountChange(groupCount + 1)} className="w-7 h-7 rounded-lg bg-secondary text-foreground font-bold text-sm flex items-center justify-center">+</button>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <button onClick={() => setShowSettings(s => !s)}
            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-all ${showSettings ? 'border-primary/40 text-primary bg-primary/10' : 'border-border text-muted-foreground hover:border-primary/40'}`}>
            <Icon name="Settings2" size={12} />
            Настройки
          </button>
          <button onClick={handleReset}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-border hover:border-primary/40 px-3 py-1.5 rounded-lg transition-all">
            <Icon name="RotateCcw" size={12} />
            Новое
          </button>
        </div>
      </div>

      {/* Настройки */}
      {showSettings && (
        <div className="card-morse border-border/60 space-y-4 animate-fade-in">
          <div className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Настройки ключа</div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <div className="text-sm text-foreground font-medium">Длительность точки</div>
              <span className="font-mono text-xs text-primary">{dotDuration} мс</span>
            </div>
            <input type="range" min={40} max={300} step={10} value={dotDuration}
              onChange={e => setDotDuration(Number(e.target.value))}
              className="w-full accent-[hsl(var(--primary))]" />
            <p className="mt-1 text-xs text-muted-foreground">
              Нажатие менее {Math.round(dotDuration * 2.5)} мс = точка, длиннее = тире. Рекомендовано: 80–150 мс.
            </p>
          </div>
        </div>
      )}

      {/* Задание */}
      <div className="card-morse border-primary/20 bg-gradient-to-r from-primary/5 to-transparent">
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs text-muted-foreground uppercase tracking-wider">Передайте слово</div>
          <div className="flex items-center gap-3">
            <div className={`font-mono text-sm font-semibold ${finished ? 'text-emerald-400' : startTime ? 'text-primary' : 'text-muted-foreground'}`}>
              <Icon name="Timer" size={13} className="inline mr-1" />
              {formatTime(elapsed)}
            </div>
            <button onClick={() => setShowHint(h => !h)}
              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-all ${showHint ? 'border-primary/40 text-primary bg-primary/10' : 'border-border text-muted-foreground hover:border-primary/40'}`}>
              <Icon name={showHint ? 'EyeOff' : 'Eye'} size={12} />
              {showHint ? 'Скрыть' : 'Код'}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          {groups.map((group, gi) => {
            const base = gi * 5;
            return (
              <div key={gi} className="flex gap-1">
                {group.split('').map((char, ci) => {
                  const idx = base + ci;
                  const res = charResults[idx];
                  const isCurrent = idx === charIndex;
                  return (
                    <div key={ci} className="flex flex-col items-center gap-0.5">
                      <span className={`text-2xl font-black transition-colors ${
                        res === 'correct' ? 'text-emerald-400' :
                        res === 'wrong' ? 'text-red-400' :
                        isCurrent ? 'text-primary' :
                        idx < charIndex ? 'text-muted-foreground/40' : 'text-foreground'
                      }`}>{char}</span>
                      {showHint && (
                        <span className="font-mono text-[10px] text-muted-foreground tracking-widest">
                          {(lang === 'ru' ? MORSE_RU : MORSE_EN)[char] || MORSE_DIGITS[char] || ''}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        {currentCode && (
          <div className="mt-2 font-mono text-primary text-sm tracking-widest opacity-70">[{currentCode}]</div>
        )}
      </div>

      {/* Экранный ключ */}
      <div className="flex flex-col items-center gap-4">
        <div
          onMouseDown={handlePressStart} onMouseUp={handlePressEnd}
          onMouseLeave={() => isPressed && handlePressEnd()}
          onTouchStart={e => { e.preventDefault(); handlePressStart(); }}
          onTouchEnd={e => { e.preventDefault(); handlePressEnd(); }}
          className={`relative select-none cursor-pointer transition-all duration-75 ${finished ? 'opacity-40 pointer-events-none' : ''}`}
        >
          <div className={`w-40 h-40 rounded-full border-4 flex flex-col items-center justify-center transition-all duration-75 ${
            isPressed
              ? 'border-primary bg-primary/20 scale-95 shadow-[0_0_40px_hsl(var(--amber)/0.4)]'
              : 'border-border bg-secondary hover:border-primary/50 hover:bg-primary/5 hover:shadow-[0_0_20px_hsl(var(--amber)/0.15)]'
          }`}>
            <div className={`w-12 h-12 rounded-full border-2 flex items-center justify-center transition-all ${isPressed ? 'border-primary bg-primary/30' : 'border-border bg-muted'}`}>
              <div className={`w-4 h-4 rounded-full transition-all ${isPressed ? 'bg-primary' : 'bg-muted-foreground/40'}`} />
            </div>
            <div className={`mt-3 text-xs font-semibold transition-colors ${isPressed ? 'text-primary' : 'text-muted-foreground'}`}>
              {isPressed ? 'ПЕРЕДАЧА' : 'КЛЮЧ'}
            </div>
          </div>
        </div>
        <div className="text-center text-xs text-muted-foreground">
          Кликните / тачскрин или <kbd className="px-1.5 py-0.5 rounded bg-secondary border border-border font-mono text-xs">Пробел</kbd>
          <span className="mx-1.5">·</span>Короткое = точка, длинное = тире
        </div>
      </div>

      {/* Результат */}
      {finished && (
        <div className="rounded-xl p-5 border border-primary/30 bg-primary/5 text-center animate-fade-in">
          <div className="text-3xl font-black text-primary mb-3">Готово!</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <div className="rounded-lg bg-background/60 border border-border p-3">
              <div className="text-2xl font-black text-foreground font-mono">{formatTime(elapsed)}</div>
              <div className="text-xs text-muted-foreground mt-0.5">Время</div>
            </div>
            <div className="rounded-lg bg-background/60 border border-border p-3">
              <div className="text-2xl font-black text-primary font-mono">{charsPerMin}</div>
              <div className="text-xs text-muted-foreground mt-0.5">зн/мин</div>
            </div>
            <div className="rounded-lg bg-background/60 border border-emerald-500/30 p-3">
              <div className="text-2xl font-black text-emerald-400 font-mono">{correctCount}</div>
              <div className="text-xs text-muted-foreground mt-0.5">Верно</div>
            </div>
            <div className="rounded-lg bg-background/60 border border-red-500/20 p-3">
              <div className="text-2xl font-black text-red-400 font-mono">{wrongCount}</div>
              <div className="text-xs text-muted-foreground mt-0.5">Ошибок</div>
            </div>
          </div>
          <button onClick={handleReset} className="btn-primary">Новое задание</button>
        </div>
      )}

      {/* Счётчики в процессе */}
      {!finished && startTime && (
        <div className="grid grid-cols-2 gap-4">
          <div className="card-morse text-center">
            <div className="text-3xl font-black text-emerald-400">{correctCount}</div>
            <div className="text-sm text-muted-foreground">Верно</div>
          </div>
          <div className="card-morse text-center">
            <div className="text-3xl font-black text-red-400">{wrongCount}</div>
            <div className="text-sm text-muted-foreground">Ошибок</div>
          </div>
        </div>
      )}
    </div>
  );
}
