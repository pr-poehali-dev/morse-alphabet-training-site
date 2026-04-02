import { useState } from 'react';
import Icon from '@/components/ui/icon';
import { useMorse, MORSE_RU, MORSE_EN, MORSE_DIGITS } from '@/hooks/useMorse';

type TabType = 'ru' | 'en' | 'digits';

const TABS: { id: TabType; label: string }[] = [
  { id: 'ru', label: 'Русский алфавит' },
  { id: 'en', label: 'Латинский алфавит' },
  { id: 'digits', label: 'Цифры' },
];

const DATA: Record<TabType, Record<string, string>> = {
  ru: MORSE_RU,
  en: MORSE_EN,
  digits: MORSE_DIGITS,
};

const MNEMONICS: Record<string, string> = {
  // Русские буквы
  'А': 'ай-да',
  'Б': 'бé-ре-гись-ты',
  'В': 'важ-но-э-то',
  'Г': 'гóр-ка-вниз',
  'Д': 'дóм-е-го',
  'Е': 'есть',
  'Ж': 'же-ле-зо-здесь',
  'З': 'зáй-ка-бе-ги',
  'И': 'и-ди',
  'К': 'как-же-так',
  'Л': 'лу-нá-ти-ки',
  'М': 'мáма',
  'Н': 'нет-да',
  'О': 'óко-ло',
  'П': 'пи-лá-по-ёт',
  'Р': 'ре-бя-та',
  'С': 'си-не-е',
  'Т': 'там',
  'У': 'у-не-сло',
  'Ф': 'фи-ли-мó-нов',
  'Х': 'хи-хи-хи-хи',
  'Ц': 'цáп-ля-сто-ит',
  'Ч': 'чер-ти-ла',
  'Ш': 'ша-ро-ва-ры',
  'Щ': 'щý-ка-жди',
  'Ъ': 'твёр-дый-зна-ки',
  'Ы': 'ты-не-жди',
  'Ь': 'мягь-ко-жми',
  'Э': 'э-то-е-го',
  'Ю': 'ю-ла-крут-ись',
  'Я': 'я-ра-дист',
  // Латинские буквы
  'A': 'a-gain',
  'B': 'bar-ri-ca-de',
  'C': 'co-ca-co-la',
  'D': 'dan-ger',
  'E': 'e',
  'F': 'fun-ni-ly-go',
  'G': 'go-a-head',
  'H': 'ha-ha-ha-ha',
  'I': 'i-t',
  'J': 'jest-in-the-bar',
  'K': 'co-ming-through',
  'L': 'la-la-la-la',
  'M': 'more',
  'N': 'no-go',
  'O': 'o-ver-here',
  'P': 'pi-a-no-keys',
  'Q': 'god-save-the-queen',
  'R': 're-do',
  'S': 'si-si-si',
  'T': 'tone',
  'U': 'u-ni-on',
  'V': 've-ga-vict',
  'W': 'well-a-way',
  'X': 'ex-tra-long-dash',
  'Y': 'you-need-to-go',
  'Z': 'zi-zi-man',
  // Цифры
  '0': 'но-оль-смот-ри-те',
  '1': 'и-один-толь-ко-раз',
  '2': 'два-где-же-ты-брат',
  '3': 'три-е-го-там-нет',
  '4': 'четыр-е-есть-тут-всё',
  '5': 'пять-здесь-сто-ит-сам',
  '6': 'ша-пять-е-ди-ниц',
  '7': 'семь-здесь-дол-га-нет',
  '8': 'восемь-та-ки-да-нет',
  '9': 'де-вять-та-ки-ноль',
};

function MorseVisual({ code }: { code: string }) {
  return (
    <div className="flex items-center gap-1">
      {code.split('').map((s, i) =>
        s === '.' ? (
          <span key={i} className="w-2 h-2 rounded-full bg-primary inline-block shrink-0" />
        ) : (
          <span key={i} className="w-5 h-2 rounded-full bg-primary inline-block shrink-0" />
        )
      )}
    </div>
  );
}

export default function TablePage() {
  const [activeTab, setActiveTab] = useState<TabType>('ru');
  const [search, setSearch] = useState('');
  const [playing, setPlaying] = useState<string | null>(null);
  const { playLetter } = useMorse();

  const data = DATA[activeTab];
  const filtered = Object.entries(data).filter(([letter, code]) => {
    const q = search.toUpperCase();
    return !q || letter.includes(q) || code.includes(q);
  });

  const handlePlay = async (letter: string) => {
    if (playing) return;
    setPlaying(letter);
    try {
      await playLetter(letter, 14);
    } finally {
      setPlaying(null);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 animate-fade-in">
      <div className="mb-8">
        <h1 className="section-title mb-2 text-3xl">Таблица Морзе</h1>
        <p className="text-muted-foreground">Полный справочник кодов азбуки Морзе</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="flex gap-1 bg-secondary p-1 rounded-xl">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => { setActiveTab(t.id); setSearch(''); }}
              className={`px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-all ${
                activeTab === t.id
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="relative flex-1 max-w-xs">
          <Icon name="Search" size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Поиск буквы или кода..."
            className="w-full bg-secondary border border-border rounded-lg pl-9 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/60"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 mb-8">
        {filtered.map(([letter, code]) => (
          <div
            key={letter}
            className={`card-morse cursor-pointer group ${
              playing === letter ? 'border-primary/60 bg-primary/5' : ''
            }`}
            onClick={() => handlePlay(letter)}
          >
            <div className="flex items-center justify-between mb-2">
              <span className={`text-2xl font-black transition-colors ${
                playing === letter ? 'text-primary' : 'text-foreground group-hover:text-primary'
              }`}>
                {letter}
              </span>
              <button className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors ${
                playing === letter
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-muted-foreground group-hover:bg-primary/20 group-hover:text-primary'
              }`}>
                {playing === letter
                  ? <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                  : <Icon name="Volume2" size={12} />
                }
              </button>
            </div>
            <div className="font-mono text-primary font-semibold tracking-widest text-base mb-2">
              {code}
            </div>
            <MorseVisual code={code} />
            {MNEMONICS[letter] && (
              <div className="mt-2 text-xs text-muted-foreground italic truncate">{MNEMONICS[letter]}</div>
            )}
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <Icon name="SearchX" size={32} className="mx-auto mb-3 opacity-40" />
          <p>Ничего не найдено по запросу «{search}»</p>
        </div>
      )}

      <div className="card-morse bg-secondary/30 border-border/50">
        <h3 className="font-bold text-foreground mb-4 flex items-center gap-2">
          <Icon name="BookMarked" size={16} className="text-primary" />
          Как читать коды
        </h3>
        <div className="grid sm:grid-cols-3 gap-4">
          <div className="flex items-start gap-3">
            <span className="w-3 h-3 rounded-full bg-primary mt-0.5 shrink-0" />
            <div>
              <div className="font-semibold text-sm text-foreground mb-0.5">Точка (·)</div>
              <div className="text-xs text-muted-foreground">Короткий сигнал длиной 1 единицу</div>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <span className="w-6 h-3 rounded-full bg-primary mt-0.5 shrink-0" />
            <div>
              <div className="font-semibold text-sm text-foreground mb-0.5">Тире (−)</div>
              <div className="text-xs text-muted-foreground">Длинный сигнал длиной 3 единицы</div>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Icon name="Pause" size={14} className="text-muted-foreground mt-0.5 shrink-0" />
            <div>
              <div className="font-semibold text-sm text-foreground mb-0.5">Пауза</div>
              <div className="text-xs text-muted-foreground">Между буквами — 3 единицы, словами — 7</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}