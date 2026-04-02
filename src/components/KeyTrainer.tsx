import { useState, useRef, useCallback, useEffect } from 'react';
import Icon from '@/components/ui/icon';
import { MORSE_TABLE, textToMorse, MORSE_RU, MORSE_EN, MORSE_DIGITS } from '@/hooks/useMorse';

const MORSE_REVERSE_RU = Object.fromEntries(
  [...Object.entries(MORSE_RU), ...Object.entries(MORSE_DIGITS)].map(([k, v]) => [v, k])
);
const MORSE_REVERSE_EN = Object.fromEntries(
  [...Object.entries(MORSE_EN), ...Object.entries(MORSE_DIGITS)].map(([k, v]) => [v, k])
);

const SAMPLE_WORDS_RU = ['СОС', 'МИР', 'ДА', 'НЕТ', 'РАД', 'КОТ', 'ДОМ', 'СОН', 'БАЛ', 'КОД'];
const SAMPLE_WORDS_EN = ['SOS', 'YES', 'NO', 'CAT', 'DOG', 'HOME', 'LOVE', 'STAR', 'SKY', 'KEY'];

function getRandomWord(lang: 'ru' | 'en') {
  const arr = lang === 'ru' ? SAMPLE_WORDS_RU : SAMPLE_WORDS_EN;
  return arr[Math.floor(Math.random() * arr.length)];
}

interface KeySymbol {
  type: '.' | '-';
  id: number;
}

export default function KeyTrainer() {
  const [lang, setLang] = useState<'ru' | 'en'>('ru');
  const [targetWord, setTargetWord] = useState(() => getRandomWord('ru'));
  const [symbols, setSymbols] = useState<KeySymbol[]>([]);
  const [currentLetterSymbols, setCurrentLetterSymbols] = useState<string[]>([]);
  const [decodedLetters, setDecodedLetters] = useState<string[]>([]);
  const [result, setResult] = useState<'correct' | 'wrong' | null>(null);
  const [score, setScore] = useState({ correct: 0, total: 0 });
  const [isPressed, setIsPressed] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [freeMode, setFreeMode] = useState(false);

  const pressStartRef = useRef<number>(0);
  const letterTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wordTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const oscillatorRef = useRef<OscillatorNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const symbolIdRef = useRef(0);
  const dotDuration = 120;

  const getAudioCtx = () => {
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = new AudioContext();
    }
    return audioCtxRef.current;
  };

  const startTone = useCallback(() => {
    const ctx = getAudioCtx();
    if (ctx.state === 'suspended') ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 700;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 0.005);
    osc.start();
    oscillatorRef.current = osc;
    gainRef.current = gain;
  }, []);

  const stopTone = useCallback(() => {
    if (oscillatorRef.current && gainRef.current && audioCtxRef.current) {
      const ctx = audioCtxRef.current;
      gainRef.current.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.005);
      oscillatorRef.current.stop(ctx.currentTime + 0.01);
      oscillatorRef.current = null;
      gainRef.current = null;
    }
  }, []);

  const commitLetter = useCallback((syms: string[]) => {
    if (syms.length === 0) return;
    const code = syms.join('');
    const reverseTable = lang === 'ru' ? MORSE_REVERSE_RU : MORSE_REVERSE_EN;
    const letter = reverseTable[code] || '?';
    setDecodedLetters(prev => [...prev, letter]);
    setCurrentLetterSymbols([]);
  }, [lang]);

  const commitWord = useCallback(() => {
    setDecodedLetters(prev => [...prev, ' ']);
    setCurrentLetterSymbols([]);
  }, []);

  const handlePressStart = useCallback(() => {
    if (result) return;
    if (letterTimerRef.current) clearTimeout(letterTimerRef.current);
    if (wordTimerRef.current) clearTimeout(wordTimerRef.current);
    pressStartRef.current = Date.now();
    setIsPressed(true);
    startTone();
  }, [result, startTone]);

  const handlePressEnd = useCallback(() => {
    if (!isPressed) return;
    const duration = Date.now() - pressStartRef.current;
    setIsPressed(false);
    stopTone();

    const sym: '.' | '-' = duration < dotDuration * 2.5 ? '.' : '-';
    const id = ++symbolIdRef.current;
    setSymbols(prev => [...prev, { type: sym, id }]);
    setCurrentLetterSymbols(prev => {
      const next = [...prev, sym];
      if (letterTimerRef.current) clearTimeout(letterTimerRef.current);
      letterTimerRef.current = setTimeout(() => {
        commitLetter(next);
        if (wordTimerRef.current) clearTimeout(wordTimerRef.current);
        wordTimerRef.current = setTimeout(() => {
          commitWord();
        }, dotDuration * 7);
      }, dotDuration * 3);
      return next;
    });
  }, [isPressed, stopTone, commitLetter, commitWord, dotDuration]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat) { e.preventDefault(); handlePressStart(); }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') { e.preventDefault(); handlePressEnd(); }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [handlePressStart, handlePressEnd]);

  const handleCheck = useCallback(() => {
    if (letterTimerRef.current) clearTimeout(letterTimerRef.current);
    if (wordTimerRef.current) clearTimeout(wordTimerRef.current);
    if (currentLetterSymbols.length > 0) {
      commitLetter(currentLetterSymbols);
    }
    setTimeout(() => {
      setDecodedLetters(prev => {
        const typed = prev.join('').trim().replace(/\s+/g, ' ');
        const correct = typed.toUpperCase() === targetWord.toUpperCase();
        setResult(correct ? 'correct' : 'wrong');
        setScore(s => ({ correct: s.correct + (correct ? 1 : 0), total: s.total + 1 }));
        return prev;
      });
    }, 50);
  }, [currentLetterSymbols, commitLetter, targetWord]);

  const handleNext = () => {
    setSymbols([]);
    setCurrentLetterSymbols([]);
    setDecodedLetters([]);
    setResult(null);
    setTargetWord(getRandomWord(lang));
    if (letterTimerRef.current) clearTimeout(letterTimerRef.current);
    if (wordTimerRef.current) clearTimeout(wordTimerRef.current);
  };

  const handleReset = () => {
    setSymbols([]);
    setCurrentLetterSymbols([]);
    setDecodedLetters([]);
    setResult(null);
    if (letterTimerRef.current) clearTimeout(letterTimerRef.current);
    if (wordTimerRef.current) clearTimeout(wordTimerRef.current);
  };

  const handleLangChange = (l: 'ru' | 'en') => {
    setLang(l);
    setTargetWord(getRandomWord(l));
    handleReset();
  };

  const targetMorse = textToMorse(targetWord);
  const typedText = decodedLetters.join('').replace(/\s+$/, '');
  const currentCode = currentLetterSymbols.join('');

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-wrap items-center gap-3 mb-2">
        <div className="flex gap-1 bg-secondary p-1 rounded-xl">
          <button
            onClick={() => setFreeMode(false)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              !freeMode ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon name="Target" size={13} className="inline mr-1.5" />
            По слову
          </button>
          <button
            onClick={() => setFreeMode(true)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              freeMode ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon name="Wind" size={13} className="inline mr-1.5" />
            Свободно
          </button>
        </div>
        {!freeMode && (
          <div className="flex gap-1 bg-secondary p-1 rounded-xl">
            <button
              onClick={() => handleLangChange('ru')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                lang === 'ru' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >Рус</button>
            <button
              onClick={() => handleLangChange('en')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                lang === 'en' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >Eng</button>
          </div>
        )}
      </div>

      {!freeMode && (
        <div className="card-morse border-primary/20 bg-gradient-to-r from-primary/5 to-transparent">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs text-muted-foreground mb-1 uppercase tracking-wider">Передайте слово</div>
              <div className="text-4xl font-black text-foreground tracking-widest mb-2">{targetWord}</div>
              {showHint && (
                <div className="font-mono text-primary tracking-widest text-sm animate-fade-in">{targetMorse}</div>
              )}
            </div>
            <button
              onClick={() => setShowHint(h => !h)}
              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-all shrink-0 mt-1 ${
                showHint ? 'border-primary/40 text-primary bg-primary/10' : 'border-border text-muted-foreground hover:border-primary/40'
              }`}
            >
              <Icon name={showHint ? 'EyeOff' : 'Eye'} size={12} />
              {showHint ? 'Скрыть код' : 'Показать код'}
            </button>
          </div>
        </div>
      )}

      <div className="card-morse">
        <div className="text-xs text-muted-foreground mb-3 uppercase tracking-wider">Принятые символы</div>
        <div className="min-h-10 flex flex-wrap items-center gap-x-3 gap-y-2 mb-2">
          {symbols.length === 0 && currentLetterSymbols.length === 0 ? (
            <span className="text-muted-foreground text-sm italic">нажмите ключ для начала передачи...</span>
          ) : (
            <>
              {symbols.map(s => (
                <span
                  key={s.id}
                  className={`inline-block rounded-full bg-primary/40 ${
                    s.type === '.' ? 'w-2.5 h-2.5' : 'w-7 h-2.5'
                  }`}
                />
              ))}
              {currentLetterSymbols.map((s, i) => (
                <span
                  key={`cur-${i}`}
                  className={`inline-block rounded-full bg-primary ${
                    s === '.' ? 'w-2.5 h-2.5' : 'w-7 h-2.5'
                  } animate-pulse`}
                />
              ))}
            </>
          )}
        </div>

        <div className="h-px bg-border my-3" />

        <div className="flex items-center justify-between">
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-2xl font-bold text-foreground tracking-widest">
              {typedText || <span className="text-muted-foreground text-base font-normal">—</span>}
            </span>
            {currentCode && (
              <span className="font-mono text-primary text-lg tracking-widest opacity-60">[{currentCode}]</span>
            )}
          </div>
          {(symbols.length > 0 || decodedLetters.length > 0) && !result && (
            <button onClick={handleReset} className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
              <Icon name="RotateCcw" size={12} />
              Сброс
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-col items-center gap-4">
        <div
          onMouseDown={handlePressStart}
          onMouseUp={handlePressEnd}
          onMouseLeave={() => isPressed && handlePressEnd()}
          onTouchStart={e => { e.preventDefault(); handlePressStart(); }}
          onTouchEnd={e => { e.preventDefault(); handlePressEnd(); }}
          className={`relative select-none cursor-pointer transition-all duration-75 ${
            result ? 'opacity-40 pointer-events-none' : ''
          }`}
        >
          <div className={`w-40 h-40 rounded-full border-4 flex flex-col items-center justify-center transition-all duration-75 ${
            isPressed
              ? 'border-primary bg-primary/20 scale-95 shadow-[0_0_40px_hsl(var(--amber)/0.4)]'
              : 'border-border bg-secondary hover:border-primary/50 hover:bg-primary/5 hover:shadow-[0_0_20px_hsl(var(--amber)/0.15)]'
          }`}>
            <div className={`w-12 h-12 rounded-full border-2 flex items-center justify-center transition-all ${
              isPressed ? 'border-primary bg-primary/30' : 'border-border bg-muted'
            }`}>
              <div className={`w-4 h-4 rounded-full transition-all ${
                isPressed ? 'bg-primary' : 'bg-muted-foreground/40'
              }`} />
            </div>
            <div className={`mt-3 text-xs font-semibold transition-colors ${
              isPressed ? 'text-primary' : 'text-muted-foreground'
            }`}>
              {isPressed ? 'ПЕРЕДАЧА' : 'КЛЮЧ'}
            </div>
          </div>
        </div>

        <div className="text-center text-xs text-muted-foreground">
          Кликните / тачскрин или зажмите <kbd className="px-1.5 py-0.5 rounded bg-secondary border border-border font-mono text-xs">Пробел</kbd>
          <span className="mx-1.5">·</span>
          Короткое = точка, длинное = тире
        </div>
      </div>

      {!freeMode && result === null && decodedLetters.length > 0 && !isPressed && (
        <div className="flex justify-center">
          <button onClick={handleCheck} className="btn-primary flex items-center gap-2">
            <Icon name="CheckCircle2" size={17} />
            Проверить
          </button>
        </div>
      )}

      {!freeMode && result && (
        <div className={`rounded-xl p-5 border text-center animate-scale-in ${
          result === 'correct'
            ? 'bg-emerald-500/10 border-emerald-500/30'
            : 'bg-red-500/10 border-red-500/30'
        }`}>
          <div className={`text-3xl font-black mb-2 ${result === 'correct' ? 'text-emerald-400' : 'text-red-400'}`}>
            {result === 'correct' ? '✓ Отлично!' : '✗ Ошибка'}
          </div>
          {result === 'wrong' && (
            <div className="text-sm text-muted-foreground mb-3">
              Вы передали: <span className="font-mono font-bold text-foreground">{typedText}</span>
              <br />
              Нужно было: <span className="font-mono font-bold text-primary">{targetWord}</span>
            </div>
          )}
          <button onClick={handleNext} className="btn-primary">
            Следующее слово
          </button>
        </div>
      )}

      {!freeMode && (
        <div className="grid grid-cols-2 gap-4">
          <div className="card-morse text-center">
            <div className="text-3xl font-black text-primary">{score.correct}</div>
            <div className="text-sm text-muted-foreground">Верных передач</div>
          </div>
          <div className="card-morse text-center">
            <div className="text-3xl font-black text-foreground">{score.total}</div>
            <div className="text-sm text-muted-foreground">Всего попыток</div>
          </div>
        </div>
      )}
    </div>
  );
}