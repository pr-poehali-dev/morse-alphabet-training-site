import { useState, useCallback, useRef } from 'react';
import Icon from '@/components/ui/icon';
import { useMorse, textToMorse, MORSE_RU, MORSE_EN, MORSE_DIGITS } from '@/hooks/useMorse';

const RU_CHARS = Object.keys(MORSE_RU);
const EN_CHARS = Object.keys(MORSE_EN);
const DIGIT_CHARS = Object.keys(MORSE_DIGITS);

type CharSet = 'ru' | 'en' | 'digits' | 'mixed';

interface Group {
  text: string;
  userInput: string;
  status: 'pending' | 'correct' | 'wrong';
}

function generateGroup(charSet: CharSet): string {
  let pool: string[];
  if (charSet === 'ru') pool = RU_CHARS;
  else if (charSet === 'en') pool = EN_CHARS;
  else if (charSet === 'digits') pool = DIGIT_CHARS;
  else pool = [...EN_CHARS, ...DIGIT_CHARS];

  return Array.from({ length: 5 }, () => pool[Math.floor(Math.random() * pool.length)]).join('');
}

function generateGroups(count: number, charSet: CharSet): Group[] {
  return Array.from({ length: count }, () => ({
    text: generateGroup(charSet),
    userInput: '',
    status: 'pending' as const,
  }));
}

export default function GroupTrainer() {
  const [charSet, setCharSet] = useState<CharSet>('ru');
  const [groupCount, setGroupCount] = useState(5);
  const [wpm, setWpm] = useState(12);
  const [groups, setGroups] = useState<Group[]>(() => generateGroups(5, 'ru'));
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeGroup, setActiveGroup] = useState<number | null>(null);
  const [checked, setChecked] = useState(false);
  const [score, setScore] = useState({ correct: 0, total: 0 });
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const { playMorse, stop } = useMorse();

  const handleGenerate = useCallback(() => {
    setGroups(generateGroups(groupCount, charSet));
    setChecked(false);
    setActiveGroup(null);
  }, [groupCount, charSet]);

  const handlePlay = useCallback(async () => {
    if (isPlaying) {
      stop();
      setIsPlaying(false);
      setActiveGroup(null);
      return;
    }

    setIsPlaying(true);
    setActiveGroup(null);

    for (let i = 0; i < groups.length; i++) {
      setActiveGroup(i);
      const code = textToMorse(groups[i].text);
      await playMorse(code, wpm);
      setActiveGroup(null);
      if (i < groups.length - 1) {
        await new Promise(r => setTimeout(r, (1.2 / wpm) * 7 * 1000));
      }
    }

    setIsPlaying(false);
    setActiveGroup(null);
    setTimeout(() => inputRefs.current[0]?.focus(), 100);
  }, [isPlaying, groups, wpm, playMorse, stop]);

  const handlePlayGroup = useCallback(async (idx: number) => {
    if (isPlaying) return;
    setIsPlaying(true);
    setActiveGroup(idx);
    const code = textToMorse(groups[idx].text);
    await playMorse(code, wpm);
    setActiveGroup(null);
    setIsPlaying(false);
  }, [isPlaying, groups, wpm, playMorse]);

  const handleInput = (idx: number, value: string) => {
    setGroups(prev => prev.map((g, i) => i === idx ? { ...g, userInput: value.toUpperCase() } : g));
  };

  const handleKeyDown = (e: React.KeyboardEvent, idx: number) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const next = inputRefs.current[idx + 1];
      if (next) next.focus();
      else handleCheck();
    }
  };

  const handleCheck = useCallback(() => {
    let correct = 0;
    const updated = groups.map(g => {
      const isCorrect = g.userInput.trim().toUpperCase() === g.text.toUpperCase();
      if (isCorrect) correct++;
      return { ...g, status: (isCorrect ? 'correct' : 'wrong') as Group['status'] };
    });
    setGroups(updated);
    setChecked(true);
    setScore(s => ({ correct: s.correct + correct, total: s.total + groups.length }));
  }, [groups]);

  const handleNext = () => {
    const newGroups = generateGroups(groupCount, charSet);
    setGroups(newGroups);
    setChecked(false);
    setActiveGroup(null);
  };

  const correctCount = groups.filter(g => g.status === 'correct').length;

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Настройки */}
      <div className="card-morse">
        <div className="flex flex-wrap gap-4 items-center">
          {/* Набор символов */}
          <div>
            <div className="text-xs text-muted-foreground mb-1.5 uppercase tracking-wider">Символы</div>
            <div className="flex gap-1 bg-secondary p-1 rounded-xl">
              {(['ru', 'en', 'digits', 'mixed'] as CharSet[]).map(cs => (
                <button
                  key={cs}
                  onClick={() => { setCharSet(cs); setGroups(generateGroups(groupCount, cs)); setChecked(false); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    charSet === cs ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {cs === 'ru' ? 'Рус' : cs === 'en' ? 'Eng' : cs === 'digits' ? '0–9' : 'Mix'}
                </button>
              ))}
            </div>
          </div>

          {/* Количество групп */}
          <div>
            <div className="text-xs text-muted-foreground mb-1.5 uppercase tracking-wider">Групп</div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { const n = Math.max(1, groupCount - 1); setGroupCount(n); setGroups(generateGroups(n, charSet)); setChecked(false); }}
                className="w-7 h-7 rounded-lg bg-secondary text-foreground font-bold text-sm flex items-center justify-center"
              >−</button>
              <span className="w-8 text-center text-sm font-mono font-semibold text-primary">{groupCount}</span>
              <button
                onClick={() => { const n = Math.min(20, groupCount + 1); setGroupCount(n); setGroups(generateGroups(n, charSet)); setChecked(false); }}
                className="w-7 h-7 rounded-lg bg-secondary text-foreground font-bold text-sm flex items-center justify-center"
              >+</button>
            </div>
          </div>

          {/* WPM */}
          <div>
            <div className="text-xs text-muted-foreground mb-1.5 uppercase tracking-wider">Скорость WPM</div>
            <div className="flex items-center gap-2">
              <button onClick={() => setWpm(w => Math.max(5, w - 2))} className="w-7 h-7 rounded-lg bg-secondary text-foreground font-bold text-sm flex items-center justify-center">−</button>
              <span className="w-10 text-center text-sm font-mono font-semibold text-primary">{wpm}</span>
              <button onClick={() => setWpm(w => Math.min(40, w + 2))} className="w-7 h-7 rounded-lg bg-secondary text-foreground font-bold text-sm flex items-center justify-center">+</button>
            </div>
          </div>

          {/* Генерация */}
          <div className="ml-auto">
            <div className="text-xs text-muted-foreground mb-1.5 uppercase tracking-wider opacity-0">–</div>
            <button onClick={handleGenerate} className="btn-outline flex items-center gap-1.5 text-sm">
              <Icon name="RefreshCw" size={14} />
              Новые группы
            </button>
          </div>
        </div>
      </div>

      {/* Воспроизведение */}
      <div className="card-morse text-center">
        <p className="text-sm text-muted-foreground mb-4">
          Прослушайте группы и впишите принятые символы. Каждая группа — 5 знаков.
        </p>

        <div className="flex flex-wrap justify-center gap-2 mb-5">
          {groups.map((g, i) => (
            <div
              key={i}
              className={`flex items-center justify-center w-10 h-10 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                activeGroup === i
                  ? 'bg-primary border-primary text-primary-foreground scale-110 shadow-[0_0_16px_hsl(var(--amber)/0.5)]'
                  : checked && g.status === 'correct'
                  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
                  : checked && g.status === 'wrong'
                  ? 'bg-red-500/15 border-red-500/40 text-red-400'
                  : 'bg-secondary border-border text-muted-foreground'
              }`}
              onClick={() => !isPlaying && !checked && handlePlayGroup(i)}
              title={checked ? g.text : `Группа ${i + 1}`}
            >
              {checked ? (g.status === 'correct' ? '✓' : '✗') : i + 1}
            </div>
          ))}
        </div>

        <button
          onClick={handlePlay}
          className={`btn-primary flex items-center gap-2 mx-auto ${isPlaying ? 'bg-destructive' : ''}`}
        >
          <Icon name={isPlaying ? 'StopCircle' : 'Play'} size={18} />
          {isPlaying ? 'Остановить' : 'Воспроизвести все'}
        </button>
      </div>

      {/* Ввод */}
      <div className="card-morse">
        <div className="text-xs text-muted-foreground mb-3 uppercase tracking-wider">Введите принятые группы</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          {groups.map((g, i) => (
            <div key={i} className="flex flex-col gap-1">
              <div className="text-xs text-muted-foreground text-center">Группа {i + 1}</div>
              <input
                ref={el => { inputRefs.current[i] = el; }}
                type="text"
                maxLength={5}
                value={g.userInput}
                onChange={e => handleInput(i, e.target.value)}
                onKeyDown={e => handleKeyDown(e, i)}
                disabled={checked}
                placeholder="·····"
                className={`w-full text-center font-mono text-lg font-bold tracking-widest px-2 py-2.5 rounded-lg border bg-secondary focus:outline-none transition-all ${
                  checked && g.status === 'correct'
                    ? 'border-emerald-500/50 text-emerald-400 bg-emerald-500/10'
                    : checked && g.status === 'wrong'
                    ? 'border-red-500/50 text-red-400 bg-red-500/10'
                    : 'border-border text-foreground focus:border-primary/60'
                }`}
              />
              {checked && g.status === 'wrong' && (
                <div className="text-center text-xs font-mono font-bold text-primary">{g.text}</div>
              )}
            </div>
          ))}
        </div>

        <div className="mt-5 flex items-center justify-between flex-wrap gap-3">
          {!checked ? (
            <button onClick={handleCheck} className="btn-primary flex items-center gap-2">
              <Icon name="CheckCircle2" size={17} />
              Проверить
            </button>
          ) : (
            <div className="flex items-center gap-4 flex-wrap">
              <div className={`text-lg font-black ${correctCount === groups.length ? 'text-emerald-400' : correctCount === 0 ? 'text-red-400' : 'text-primary'}`}>
                {correctCount}/{groups.length} верно
              </div>
              <button onClick={handleNext} className="btn-primary flex items-center gap-2">
                <Icon name="ArrowRight" size={17} />
                Следующий набор
              </button>
            </div>
          )}
          <button
            onClick={() => !isPlaying && handlePlay()}
            disabled={isPlaying}
            className="btn-outline text-sm flex items-center gap-1.5 disabled:opacity-50"
          >
            <Icon name="RotateCcw" size={14} />
            Повторить
          </button>
        </div>
      </div>

      {/* Счёт */}
      <div className="grid grid-cols-2 gap-4">
        <div className="card-morse text-center">
          <div className="text-3xl font-black text-primary">{score.correct}</div>
          <div className="text-sm text-muted-foreground">Верных групп</div>
        </div>
        <div className="card-morse text-center">
          <div className="text-3xl font-black text-foreground">{score.total}</div>
          <div className="text-sm text-muted-foreground">Всего групп</div>
        </div>
      </div>
    </div>
  );
}
