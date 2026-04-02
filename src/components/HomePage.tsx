import Icon from '@/components/ui/icon';

type Page = 'home' | 'trainer' | 'stats' | 'table';

interface HomePageProps {
  onNavigate: (page: Page) => void;
}

const FEATURES = [
  {
    icon: 'Zap',
    title: 'Тренажёр',
    desc: 'Практикуйте приём и передачу в интерактивном режиме',
    page: 'trainer' as Page,
    color: 'from-amber-500/20 to-amber-600/5',
  },
  {
    icon: 'Table2',
    title: 'Таблица',
    desc: 'Полная таблица кодов для русского и латинского алфавита',
    page: 'table' as Page,
    color: 'from-emerald-500/20 to-emerald-600/5',
  },
  {
    icon: 'BarChart3',
    title: 'Статистика',
    desc: 'Отслеживайте прогресс и улучшайте результаты',
    page: 'stats' as Page,
    color: 'from-violet-500/20 to-violet-600/5',
  },
];



export default function HomePage({ onNavigate }: HomePageProps) {
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 animate-fade-in">
      <section className="text-center py-14 relative">
        <div className="absolute inset-0 flex items-center justify-center opacity-5 pointer-events-none select-none">
          <span className="font-mono text-8xl font-black tracking-widest text-primary">
            ·−·· −·−· ·−··
          </span>
        </div>

        <div className="relative">
          <div className="inline-flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-full px-4 py-1.5 mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>
            <span className="text-primary text-sm font-medium">Учите азбуку Морзе онлайн</span>
          </div>

          <h1 className="text-5xl sm:text-6xl font-black tracking-tight text-foreground mb-5 leading-tight">
            Азбука Морзе<br />
            <span className="text-primary">для каждого</span>
          </h1>

          <p className="text-lg text-muted-foreground max-w-xl mx-auto mb-8 leading-relaxed">
            Интерактивный тренажёр для изучения русского и латинского алфавита.
            Слушайте сигналы, тренируйтесь и отслеживайте свой прогресс.
          </p>

          <div className="flex items-center justify-center gap-3 flex-wrap">
            <button
              onClick={() => onNavigate('trainer')}
              className="btn-primary flex items-center gap-2"
            >
              <Icon name="Zap" size={17} />
              Открыть тренажёр
            </button>
          </div>
        </div>
      </section>

      <section className="mb-14">
        <h2 className="section-title mb-2">Разделы сайта</h2>
        <p className="text-muted-foreground mb-6">Выберите, с чего хотите начать</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {FEATURES.map(f => (
            <button
              key={f.page}
              onClick={() => onNavigate(f.page)}
              className={`card-morse text-left group cursor-pointer bg-gradient-to-br ${f.color}`}
            >
              <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                <Icon name={f.icon} size={20} className="text-primary" />
              </div>
              <h3 className="font-bold text-foreground mb-1.5">{f.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
            </button>
          ))}
        </div>
      </section>

      <section className="card-morse bg-gradient-to-r from-primary/5 to-transparent border-primary/20">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-primary/15 flex items-center justify-center shrink-0">
            <Icon name="Info" size={22} className="text-primary" />
          </div>
          <div>
            <h3 className="font-bold text-foreground mb-1">Что такое азбука Морзе?</h3>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">
              Азбука Морзе — система кодирования символов с помощью длинных (тире) и коротких (точек) сигналов.
              Применяется в радиосвязи, авиации и морском флоте. Умение работать с кодом Морзе —
              ценный навык для радиолюбителей и профессионалов связи.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}