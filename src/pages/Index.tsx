import { useState } from 'react';
import NavBar from '@/components/NavBar';
import HomePage from '@/components/HomePage';
import LearnPage from '@/components/LearnPage';
import TrainerPage from '@/components/TrainerPage';
import StatsPage from '@/components/StatsPage';
import TablePage from '@/components/TablePage';

type Page = 'home' | 'learn' | 'trainer' | 'stats' | 'table';

export default function Index() {
  const [page, setPage] = useState<Page>('home');

  const renderPage = () => {
    switch (page) {
      case 'home': return <HomePage onNavigate={setPage} />;
      case 'learn': return <LearnPage />;
      case 'trainer': return <TrainerPage />;
      case 'stats': return <StatsPage />;
      case 'table': return <TablePage />;
      default: return <HomePage onNavigate={setPage} />;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <NavBar current={page} onChange={setPage} />
      <main>{renderPage()}</main>
    </div>
  );
}
