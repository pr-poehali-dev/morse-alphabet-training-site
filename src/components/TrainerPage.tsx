import { useState } from 'react';
import Icon from '@/components/ui/icon';
import KeyTrainer from '@/components/KeyTrainer';
import GroupTrainer from '@/components/GroupTrainer';

type Mode = 'key' | 'groups';

export default function TrainerPage() {
  const [mode, setMode] = useState<Mode>('groups');

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 animate-fade-in">
      <div className="mb-8">
        <h1 className="section-title mb-2 text-3xl">Тренажёр</h1>
        <p className="text-muted-foreground">Тренируйте приём сигналов азбуки Морзе</p>
      </div>

      <div className="flex flex-wrap gap-3 mb-6">
        <div className="flex gap-1 bg-secondary p-1 rounded-xl">
          <button
            onClick={() => setMode('groups')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              mode === 'groups' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon name="LayoutGrid" size={14} className="inline mr-1.5" />
            Приём групп
          </button>
          <button
            onClick={() => setMode('key')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              mode === 'key' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon name="Radio" size={14} className="inline mr-1.5" />
            Ключ
          </button>
        </div>
      </div>

      {mode === 'groups' && <GroupTrainer />}
      {mode === 'key' && <KeyTrainer />}
    </div>
  );
}
