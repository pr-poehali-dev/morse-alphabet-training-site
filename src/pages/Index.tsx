import { useState } from 'react';
import NavBar from '@/components/NavBar';
import HomePage from '@/components/HomePage';
import TrainerPage from '@/components/TrainerPage';
import TablePage from '@/components/TablePage';
import DecoderPage from '@/components/DecoderPage';

type Page = 'home' | 'trainer' | 'table' | 'decoder';

export default function Index() {
  const [page, setPage] = useState<Page>('home');

  const renderPage = () => {
    switch (page) {
      case 'home': return <HomePage onNavigate={setPage} />;
      case 'trainer': return <TrainerPage />;
      case 'table': return <TablePage />;
      case 'decoder': return <DecoderPage />;
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
