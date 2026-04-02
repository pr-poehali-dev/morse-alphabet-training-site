import Icon from '@/components/ui/icon';

const MOCK_HISTORY = [
  { date: '01.04.2026', correct: 8, total: 10, wpm: 12 },
  { date: '31.03.2026', correct: 6, total: 10, wpm: 10 },
  { date: '30.03.2026', correct: 5, total: 8, wpm: 10 },
  { date: '29.03.2026', correct: 4, total: 7, wpm: 8 },
  { date: '28.03.2026', correct: 3, total: 6, wpm: 8 },
];

const STAT_CARDS = [
  { label: 'Сессий тренировок', value: '5', icon: 'Calendar', color: 'text-blue-400' },
  { label: 'Всего попыток', value: '41', icon: 'Target', color: 'text-amber-400' },
  { label: 'Верных ответов', value: '26', icon: 'CheckCircle2', color: 'text-emerald-400' },
  { label: 'Точность', value: '63%', icon: 'TrendingUp', color: 'text-violet-400' },
];

export default function StatsPage() {
  const maxCorrect = Math.max(...MOCK_HISTORY.map(h => h.correct));

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 animate-fade-in">
      <div className="mb-8">
        <h1 className="section-title mb-2 text-3xl">Статистика</h1>
        <p className="text-muted-foreground">Ваш прогресс в изучении азбуки Морзе</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        {STAT_CARDS.map(card => (
          <div key={card.label} className="card-morse">
            <div className={`${card.color} mb-3`}>
              <Icon name={card.icon} size={22} />
            </div>
            <div className="text-3xl font-black text-foreground mb-1">{card.value}</div>
            <div className="text-xs text-muted-foreground leading-snug">{card.label}</div>
          </div>
        ))}
      </div>

      <div className="card-morse mb-6">
        <h3 className="font-bold text-foreground mb-5 flex items-center gap-2">
          <Icon name="BarChart2" size={16} className="text-primary" />
          Верные ответы по дням
        </h3>
        <div className="flex items-end gap-3 h-40">
          {MOCK_HISTORY.slice().reverse().map((h, i) => {
            const height = maxCorrect > 0 ? (h.correct / maxCorrect) * 100 : 0;
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-2">
                <div className="text-xs font-mono text-primary font-semibold">{h.correct}</div>
                <div
                  className="w-full rounded-t-lg bg-primary/30 border border-primary/20 transition-all hover:bg-primary/50 cursor-default"
                  style={{ height: `${Math.max(height, 8)}%` }}
                  title={`${h.correct}/${h.total}`}
                />
                <div className="text-xs text-muted-foreground whitespace-nowrap"
                  style={{ fontSize: '10px' }}
                >
                  {h.date.slice(0, 5)}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="card-morse mb-6">
        <h3 className="font-bold text-foreground mb-4 flex items-center gap-2">
          <Icon name="ClipboardList" size={16} className="text-primary" />
          История сессий
        </h3>
        <div className="space-y-2">
          {MOCK_HISTORY.map((h, i) => {
            const acc = Math.round((h.correct / h.total) * 100);
            return (
              <div key={i} className="flex items-center justify-between py-3 border-b border-border last:border-0">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center">
                    <Icon name="Calendar" size={14} className="text-muted-foreground" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-foreground">{h.date}</div>
                    <div className="text-xs text-muted-foreground">{h.wpm} WPM</div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="text-sm font-semibold text-foreground">{h.correct}/{h.total}</div>
                    <div className="text-xs text-muted-foreground">ответов</div>
                  </div>
                  <div className={`text-sm font-bold w-12 text-right ${
                    acc >= 80 ? 'text-emerald-400' : acc >= 60 ? 'text-amber-400' : 'text-red-400'
                  }`}>
                    {acc}%
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="card-morse bg-primary/5 border-primary/20">
        <div className="flex items-start gap-3">
          <Icon name="Rocket" size={18} className="text-primary shrink-0 mt-0.5" />
          <div>
            <h3 className="font-bold text-foreground mb-1">Совет по улучшению</h3>
            <p className="text-sm text-muted-foreground">
              Ваша точность растёт! Попробуйте увеличить скорость до <span className="text-primary font-semibold">14 WPM</span> на следующей тренировке.
              Регулярные занятия по 10–15 минут дают лучший результат, чем редкие длинные сессии.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
