import Icon from '@/components/ui/icon';

type Page = 'home' | 'trainer' | 'table';

interface NavBarProps {
  current: Page;
  onChange: (page: Page) => void;
}

const NAV_ITEMS: { id: Page; label: string; icon: string }[] = [
  { id: 'home', label: 'Главная', icon: 'Home' },
  { id: 'trainer', label: 'Тренажёр', icon: 'Zap' },
  { id: 'table', label: 'Таблица', icon: 'Table2' },
];

export default function NavBar({ current, onChange }: NavBarProps) {
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/90 backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16">
          <button
            onClick={() => onChange('home')}
            className="flex items-center gap-2.5 group"
          >
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <span className="font-mono font-bold text-primary-foreground text-sm">·−</span>
            </div>
            <span className="font-bold text-lg tracking-tight text-foreground">
              МорзеТренер
            </span>
          </button>

          <nav className="hidden md:flex items-center gap-1">
            {NAV_ITEMS.map(item => (
              <button
                key={item.id}
                onClick={() => onChange(item.id)}
                className={`nav-link flex items-center gap-1.5 px-3 py-2 rounded-lg transition-all ${
                  current === item.id
                    ? 'text-primary bg-primary/10'
                    : 'hover:text-foreground hover:bg-secondary'
                }`}
              >
                <Icon name={item.icon} size={15} />
                {item.label}
              </button>
            ))}
          </nav>

          <div className="md:hidden flex gap-1">
            {NAV_ITEMS.map(item => (
              <button
                key={item.id}
                onClick={() => onChange(item.id)}
                className={`p-2 rounded-lg transition-all ${
                  current === item.id
                    ? 'text-primary bg-primary/10'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                }`}
                title={item.label}
              >
                <Icon name={item.icon} size={18} />
              </button>
            ))}
          </div>
        </div>
      </div>
    </header>
  );
}