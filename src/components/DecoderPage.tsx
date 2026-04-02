import MorseDecoder from '@/components/MorseDecoder';

export default function DecoderPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 animate-fade-in">
      <div className="mb-8">
        <h1 className="section-title mb-2 text-3xl">Декодер Морзе</h1>
        <p className="text-muted-foreground">Автоматическое декодирование сигнала через микрофон</p>
      </div>
      <MorseDecoder />
    </div>
  );
}
