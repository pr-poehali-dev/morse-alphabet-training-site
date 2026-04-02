import { useState, useCallback } from 'react';
import Icon from '@/components/ui/icon';
import { useMorse, MORSE_RU, MORSE_EN, MORSE_DIGITS } from '@/hooks/useMorse';

type AlphabetType = 'ru' | 'en' | 'digits';

const GROUPS: { id: AlphabetType; label: string; data: Record<string, string> }[] = [
  { id: 'ru', label: 'Русский', data: MORSE_RU },
  { id: 'en', label: 'Латинский', data: MORSE_EN },
  { id: 'digits', label: 'Цифры', data: MORSE_DIGITS },
];

function MorseSymbol({ code }: { code: string }) {
  return (
    <span className="flex items-center gap-1.5 justify-center">
      {code.split('').map((s, i) => (
        <span
          key={i}
          className={s === '.' ? 'morse-dot' : 'w-5 h-2 rounded-full bg-primary inline-block'}
        />
      ))}
    </span>
  );
}

function LetterCard({
  letter,
  code,
  onPlay,
  playing,
}: {
  letter: string;
  code: string;
  onPlay: (letter: string) => void;
  playing: string | null;
}) {
  const isPlaying = playing === letter;
  return (
    <button
      onClick={() => onPlay(letter)}
      className={`card-morse flex flex-col items-center gap-3 cursor-pointer group select-none transition-all ${
        isPlaying ? 'border-primary/60 bg-primary/5' : ''
      }`}
    >
      <div className={`text-3xl font-black transition-colors ${isPlaying ? 'text-primary' : 'text-foreground group-hover:text-primary'}`}>
        {letter}
      </div>
      <div className="font-mono text-primary text-lg tracking-widest font-medium">
        {code}
      </div>
      <MorseSymbol code={code} />
      <div className={`mt-1 flex items-center gap-1 text-xs transition-colors ${
        isPlaying ? 'text-primary' : 'text-muted-foreground'
      }`}>
        {isPlaying ? (
          <>
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse inline-block" />
            воспроизводится...
          </>
        ) : (
          <>
            <Icon name="Volume2" size={11} />
            нажмите для звука
          </>
        )}
      </div>
    </button>
  );
}

export default function LearnPage() {
  const [activeGroup, setActiveGroup] = useState<AlphabetType>('ru');
  const [playing, setPlaying] = useState<string | null>(null);
  const [wpm, setWpm] = useState(12);
  const { playLetter } = useMorse();

  const handlePlay = useCallback(async (letter: string) => {
    if (playing) return;
    setPlaying(letter);
    try {
      await playLetter(letter, wpm);
    } finally {
      setPlaying(null);
    }
  }, [playing, playLetter, wpm]);

  const currentData = GROUPS.find(g => g.id === activeGroup)!.data;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 animate-fade-in">
      <div className="mb-8">
        <h1 className="section-title mb-2 text-3xl">Обучение</h1>
        <p className="text-muted-foreground">
          Нажмите на букву, чтобы услышать её звучание в азбуке Морзе
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex gap-1 bg-secondary p-1 rounded-xl">
          {GROUPS.map(g => (
            <button
              key={g.id}
              onClick={() => setActiveGroup(g.id)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                activeGroup === g.id
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {g.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">Скорость:</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setWpm(w => Math.max(5, w - 2))}
              className="w-8 h-8 rounded-lg bg-secondary hover:bg-secondary/70 text-foreground font-bold flex items-center justify-center transition-colors"
            >−</button>
            <span className="w-14 text-center text-sm font-mono font-semibold text-primary">
              {wpm} WPM
            </span>
            <button
              onClick={() => setWpm(w => Math.min(30, w + 2))}
              className="w-8 h-8 rounded-lg bg-secondary hover:bg-secondary/70 text-foreground font-bold flex items-center justify-center transition-colors"
            >+</button>
          </div>
        </div>
      </div>

      <div className="card-morse bg-secondary/30 p-4 mb-6 flex items-center gap-3 border-primary/10">
        <Icon name="Lightbulb" size={18} className="text-primary shrink-0" />
        <p className="text-sm text-muted-foreground">
          <span className="text-foreground font-medium">Совет:</span> Изучайте по несколько букв в день.
          Точка (·) — короткий сигнал, тире (−) — длинный, в 3 раза длиннее точки.
        </p>
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-3">
        {Object.entries(currentData).map(([letter, code]) => (
          <LetterCard
            key={letter}
            letter={letter}
            code={code}
            onPlay={handlePlay}
            playing={playing}
          />
        ))}
      </div>
    </div>
  );
}
