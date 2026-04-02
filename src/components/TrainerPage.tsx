import { useState, useCallback, useRef, useEffect } from 'react';
import Icon from '@/components/ui/icon';
import { useMorse, textToMorse, MORSE_TABLE } from '@/hooks/useMorse';

type Mode = 'listen' | 'input';

const SAMPLE_WORDS_RU = ['СОС', 'МИР', 'ДА', 'НЕТ', 'РАД', 'КОТ', 'ДОМ', 'РАЙ', 'БАЛ', 'ЗАЛ'];
const SAMPLE_WORDS_EN = ['SOS', 'YES', 'NO', 'CAT', 'DOG', 'HOME', 'LOVE', 'STAR', 'SKY', 'FIRE'];

function getRandomWord(lang: 'ru' | 'en') {
  const arr = lang === 'ru' ? SAMPLE_WORDS_RU : SAMPLE_WORDS_EN;
  return arr[Math.floor(Math.random() * arr.length)];
}

export default function TrainerPage() {
  const [mode, setMode] = useState<Mode>('listen');
  const [lang, setLang] = useState<'ru' | 'en'>('ru');
  const [wpm, setWpm] = useState(12);
  const [currentWord, setCurrentWord] = useState(() => getRandomWord('ru'));
  const [userInput, setUserInput] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeSymbol, setActiveSymbol] = useState<number | null>(null);
  const [result, setResult] = useState<'correct' | 'wrong' | null>(null);
  const [score, setScore] = useState({ correct: 0, total: 0 });
  const [customText, setCustomText] = useState('');
  const [customMode, setCustomMode] = useState(false);
  const stopRef = useRef(false);
  const { playMorse, stop } = useMorse();

  const morseCode = textToMorse(currentWord);

  useEffect(() => {
    setCurrentWord(getRandomWord(lang));
    setUserInput('');
    setResult(null);
  }, [lang]);

  const handlePlay = useCallback(async () => {
    if (isPlaying) {
      stopRef.current = true;
      stop();
      setIsPlaying(false);
      setActiveSymbol(null);
      return;
    }

    const text = customMode ? customText : currentWord;
    const code = textToMorse(text);
    if (!code) return;

    stopRef.current = false;
    setIsPlaying(true);
    setActiveSymbol(null);

    await playMorse(code, wpm, (_, idx) => {
      setActiveSymbol(idx);
      setTimeout(() => setActiveSymbol(null), 100);
    });

    setIsPlaying(false);
    setActiveSymbol(null);
  }, [isPlaying, customMode, customText, currentWord, playMorse, stop, wpm]);

  const handleCheck = () => {
    const correct = userInput.trim().toUpperCase() === currentWord.toUpperCase();
    setResult(correct ? 'correct' : 'wrong');
    setScore(s => ({ correct: s.correct + (correct ? 1 : 0), total: s.total + 1 }));
  };

  const handleNext = () => {
    setCurrentWord(getRandomWord(lang));
    setUserInput('');
    setResult(null);
  };

  const morseSymbols = morseCode.split('').filter(c => c === '.' || c === '-');

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 animate-fade-in">
      <div className="mb-8">
        <h1 className="section-title mb-2 text-3xl">Тренажёр</h1>
        <p className="text-muted-foreground">Тренируйте приём сигналов азбуки Морзе</p>
      </div>

      <div className="flex flex-wrap gap-3 mb-6">
        <div className="flex gap-1 bg-secondary p-1 rounded-xl">
          <button
            onClick={() => setMode('listen')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              mode === 'listen' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon name="Headphones" size={14} className="inline mr-1.5" />
            Приём
          </button>
          <button
            onClick={() => setMode('input')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              mode === 'input' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon name="PenLine" size={14} className="inline mr-1.5" />
            Перевод
          </button>
        </div>

        <div className="flex gap-1 bg-secondary p-1 rounded-xl">
          <button
            onClick={() => setLang('ru')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              lang === 'ru' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Рус
          </button>
          <button
            onClick={() => setLang('en')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              lang === 'en' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Eng
          </button>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <span className="text-sm text-muted-foreground">WPM:</span>
          <button onClick={() => setWpm(w => Math.max(5, w - 2))} className="w-7 h-7 rounded-lg bg-secondary text-foreground font-bold text-sm flex items-center justify-center">−</button>
          <span className="w-10 text-center text-sm font-mono font-semibold text-primary">{wpm}</span>
          <button onClick={() => setWpm(w => Math.min(30, w + 2))} className="w-7 h-7 rounded-lg bg-secondary text-foreground font-bold text-sm flex items-center justify-center">+</button>
        </div>
      </div>

      {mode === 'listen' && (
        <div className="space-y-4">
          <div className="card-morse text-center py-10">
            <p className="text-sm text-muted-foreground mb-6">
              Прослушайте сигнал и введите слово, которое услышали
            </p>

            <div className="flex items-center justify-center gap-2 mb-8 h-10">
              {isPlaying && morseSymbols.map((s, i) => (
                <span
                  key={i}
                  className={`transition-all duration-75 ${
                    activeSymbol === i ? 'signal-active' : 'bg-muted'
                  } rounded-full ${s === '.' ? 'w-3 h-3' : 'w-8 h-3'}`}
                />
              ))}
              {!isPlaying && (
                <div className="text-muted-foreground text-sm flex items-center gap-2">
                  <Icon name="Volume2" size={16} />
                  Нажмите кнопку, чтобы услышать сигнал
                </div>
              )}
            </div>

            <button
              onClick={handlePlay}
              className={`btn-primary flex items-center gap-2 mx-auto mb-8 ${isPlaying ? 'bg-destructive' : ''}`}
            >
              <Icon name={isPlaying ? 'StopCircle' : 'Play'} size={18} />
              {isPlaying ? 'Остановить' : 'Воспроизвести'}
            </button>

            {result === null && (
              <div className="flex gap-2 max-w-sm mx-auto">
                <input
                  type="text"
                  value={userInput}
                  onChange={e => setUserInput(e.target.value.toUpperCase())}
                  onKeyDown={e => e.key === 'Enter' && handleCheck()}
                  placeholder="Введите слово..."
                  className="flex-1 bg-secondary border border-border rounded-lg px-4 py-2.5 text-foreground placeholder:text-muted-foreground font-medium focus:outline-none focus:border-primary/60 text-center tracking-widest font-mono"
                />
                <button onClick={handleCheck} className="btn-primary">
                  Проверить
                </button>
              </div>
            )}

            {result && (
              <div className={`rounded-xl p-5 max-w-sm mx-auto border ${
                result === 'correct'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                  : 'bg-red-500/10 border-red-500/30 text-red-400'
              }`}>
                <div className="text-2xl font-black mb-1">
                  {result === 'correct' ? '✓ Верно!' : '✗ Неверно'}
                </div>
                {result === 'wrong' && (
                  <div className="text-sm mt-2">
                    Правильный ответ: <span className="font-mono font-bold">{currentWord}</span>
                  </div>
                )}
                <button onClick={handleNext} className="btn-outline mt-3 text-sm border-current">
                  Следующее слово
                </button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="card-morse text-center">
              <div className="text-3xl font-black text-primary">{score.correct}</div>
              <div className="text-sm text-muted-foreground">Верных ответов</div>
            </div>
            <div className="card-morse text-center">
              <div className="text-3xl font-black text-foreground">{score.total}</div>
              <div className="text-sm text-muted-foreground">Всего попыток</div>
            </div>
          </div>
        </div>
      )}

      {mode === 'input' && (
        <div className="space-y-4">
          <div className="card-morse">
            <p className="text-sm text-muted-foreground mb-4">Введите текст и прослушайте его в азбуке Морзе</p>
            <textarea
              value={customText}
              onChange={e => setCustomText(e.target.value.toUpperCase())}
              placeholder="Введите текст (например: СОС или SOS)..."
              rows={3}
              className="w-full bg-secondary border border-border rounded-lg px-4 py-3 text-foreground placeholder:text-muted-foreground font-mono resize-none focus:outline-none focus:border-primary/60 mb-4"
            />
            {customText && (
              <div className="bg-secondary/50 rounded-lg p-3 mb-4">
                <div className="text-xs text-muted-foreground mb-1">Код Морзе:</div>
                <div className="font-mono text-primary text-lg tracking-widest break-all">
                  {textToMorse(customText) || '—'}
                </div>
              </div>
            )}
            <button
              onClick={() => { setCustomMode(true); handlePlay(); }}
              disabled={!customText.trim()}
              className="btn-primary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Icon name={isPlaying ? 'StopCircle' : 'Play'} size={18} />
              {isPlaying ? 'Остановить' : 'Воспроизвести'}
            </button>
          </div>

          <div className="card-morse">
            <p className="text-sm text-muted-foreground mb-3">Или сыграйте со случайным словом:</p>
            <div className="flex gap-3 flex-wrap">
              {(lang === 'ru' ? SAMPLE_WORDS_RU : SAMPLE_WORDS_EN).slice(0, 6).map(word => (
                <button
                  key={word}
                  onClick={() => { setCustomText(word); setCustomMode(true); }}
                  className={`px-4 py-2 rounded-lg border text-sm font-mono font-semibold transition-all ${
                    customText === word
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground'
                  }`}
                >
                  {word}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
