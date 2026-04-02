import { useState, useCallback } from 'react';
import Icon from '@/components/ui/icon';
import { useMorse, textToMorse, MORSE_RU, MORSE_EN, MORSE_DIGITS } from '@/hooks/useMorse';

const RU_CHARS = Object.keys(MORSE_RU);
const EN_CHARS = Object.keys(MORSE_EN);
const DIGIT_CHARS = Object.keys(MORSE_DIGITS);

type CharSet = 'ru' | 'en' | 'digits' | 'mixed';

interface Group {
  text: string;
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
  }));
}

export default function GroupTrainer() {
  const [charSet, setCharSet] = useState<CharSet>('ru');
  const [groupCount, setGroupCount] = useState(5);
  const [wpm, setWpm] = useState(12);
  const [groups, setGroups] = useState<Group[]>(() => generateGroups(5, 'ru'));
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeGroup, setActiveGroup] = useState<number | null>(null);
  const { playMorse, stop } = useMorse();

  const handleGenerate = useCallback(() => {
    setGroups(generateGroups(groupCount, charSet));
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

  const handleNext = () => {
    setGroups(generateGroups(groupCount, charSet));
    setActiveGroup(null);
  };

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
                onClick={() => { const n = Math.max(1, groupCount - 1); setGroupCount(n); setGroups(generateGroups(n, charSet)); }}
                className="w-7 h-7 rounded-lg bg-secondary text-foreground font-bold text-sm flex items-center justify-center"
              >−</button>
              <span className="w-8 text-center text-sm font-mono font-semibold text-primary">{groupCount}</span>
              <button
                onClick={() => { const n = Math.min(20, groupCount + 1); setGroupCount(n); setGroups(generateGroups(n, charSet)); }}
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
          Прослушайте группы. Каждая группа — 5 знаков.
        </p>

        <div className="flex flex-wrap justify-center gap-2 mb-5">
          {groups.map((g, i) => (
            <div
              key={i}
              className={`flex items-center justify-center w-10 h-10 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                activeGroup === i
                  ? 'bg-primary border-primary text-primary-foreground scale-110 shadow-[0_0_16px_hsl(var(--amber)/0.5)]'
                  : 'bg-secondary border-border text-muted-foreground hover:border-primary/40'
              }`}
              onClick={() => !isPlaying && handlePlayGroup(i)}
              title={`Группа ${i + 1}`}
            >
              {i + 1}
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

      {/* Проверка */}
      <div className="card-morse">
        <div className="text-xs text-muted-foreground mb-3 uppercase tracking-wider">Правильный приём</div>
        <div className="flex flex-wrap gap-3 font-mono text-xl font-bold tracking-widest">
          {groups.map((g, i) => (
            <span key={i} className="text-foreground">{g.text}</span>
          ))}
        </div>
        <div className="mt-5 flex items-center gap-3 flex-wrap">
          <button onClick={handleNext} className="btn-primary flex items-center gap-2">
            <Icon name="ArrowRight" size={17} />
            Следующий набор
          </button>
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


    </div>
  );
}