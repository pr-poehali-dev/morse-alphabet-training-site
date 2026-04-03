import { useRef, useCallback } from 'react';

const MORSE_RU: Record<string, string> = {
  'А': '.-', 'Б': '-...', 'В': '.--', 'Г': '--.', 'Д': '-..', 'Е': '.', 'Ж': '...-',
  'З': '--..', 'И': '..', 'Й': '.---', 'К': '-.-', 'Л': '.-..', 'М': '--', 'Н': '-.',
  'О': '---', 'П': '.--.', 'Р': '.-.', 'С': '...', 'Т': '-', 'У': '..-', 'Ф': '..-.',
  'Х': '....', 'Ц': '-.-.', 'Ч': '---.', 'Ш': '----', 'Щ': '--.-', 'Ъ': '--.--',
  'Ы': '-.--', 'Ь': '-..-', 'Э': '..-..', 'Ю': '..--', 'Я': '.-.-',
};

const MORSE_EN: Record<string, string> = {
  'A': '.-', 'B': '-...', 'C': '-.-.', 'D': '-..', 'E': '.', 'F': '..-.',
  'G': '--.', 'H': '....', 'I': '..', 'J': '.---', 'K': '-.-', 'L': '.-..',
  'M': '--', 'N': '-.', 'O': '---', 'P': '.--.', 'Q': '--.-', 'R': '.-.',
  'S': '...', 'T': '-', 'U': '..-', 'V': '...-', 'W': '.--', 'X': '-..-',
  'Y': '-.--', 'Z': '--..',
};

const MORSE_DIGITS: Record<string, string> = {
  '0': '-----', '1': '.----', '2': '..---', '3': '...--', '4': '....-',
  '5': '.....', '6': '-....', '7': '--...', '8': '---..', '9': '----.',
};

const MORSE_SPECIAL: Record<string, string> = {
  '.': '.-.-.-',   // Точка
  ',': '--..--',   // Запятая
  '?': '..--..',   // Вопрос
  '!': '-.-.--',   // Восклицание
  '/': '-..-.',    // Дробь / разделитель
  '-': '-....-',   // Дефис
  '(': '-.--.',    // Скобка открыв.
  ')': '-.--.-',   // Скобка закрыв.
  '"': '.-..-.',   // Кавычка
  '\'': '.----.',  // Апостроф
  ':': '---...',   // Двоеточие
  ';': '-.-.-.',   // Точка с запятой
  '=': '-...-',    // Знак равенства / BT (конец абзаца)
  '+': '.-.-.',    // Плюс / AR (конец передачи)
  '@': '.--.-.',   // Коммерческое at (AC)
  '&': '.-...',    // Амперсанд / AS (ожидание)
  '_': '..--.-',   // Нижнее подчёркивание
  '$': '...-..-',  // Доллар (SX)
};

export const MORSE_TABLE = { ...MORSE_RU, ...MORSE_EN, ...MORSE_DIGITS, ...MORSE_SPECIAL };

export function textToMorse(text: string): string {
  return text.toUpperCase().split('').map(char => {
    if (char === ' ') return '/';
    return MORSE_TABLE[char] || '';
  }).filter(Boolean).join(' ');
}

export function useMorse() {
  const audioCtxRef = useRef<AudioContext | null>(null);

  const getCtx = () => {
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = new AudioContext();
    }
    return audioCtxRef.current;
  };

  const playTone = useCallback((startTime: number, duration: number, frequency = 700): Promise<void> => {
    return new Promise((resolve) => {
      const ctx = getCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.frequency.value = frequency;
      osc.type = 'sine';

      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(0.5, startTime + 0.005);
      gain.gain.setValueAtTime(0.5, startTime + duration - 0.005);
      gain.gain.linearRampToValueAtTime(0, startTime + duration);

      osc.start(startTime);
      osc.stop(startTime + duration);
      osc.onended = () => resolve();
    });
  }, []);

  const playMorse = useCallback(async (
    code: string,
    wpm = 15,
    onSymbol?: (symbol: string, index: number) => void
  ) => {
    const ctx = getCtx();
    if (ctx.state === 'suspended') await ctx.resume();

    const dotDuration = 1.2 / wpm;
    const dashDuration = dotDuration * 3;
    const symbolGap = dotDuration;
    const letterGap = dotDuration * 3;
    const wordGap = dotDuration * 7;

    let time = ctx.currentTime + 0.1;
    let symbolIndex = 0;

    for (const letter of code.split(' ')) {
      if (letter === '/') {
        time += wordGap;
        continue;
      }
      for (let i = 0; i < letter.length; i++) {
        const sym = letter[i];
        const dur = sym === '.' ? dotDuration : dashDuration;
        const capturedIndex = symbolIndex++;
        const capturedSym = sym;
        const capturedTime = time;

        if (onSymbol) {
          setTimeout(() => onSymbol(capturedSym, capturedIndex), (capturedTime - ctx.currentTime) * 1000);
        }

        playTone(time, dur);
        time += dur + symbolGap;
      }
      time += letterGap - symbolGap;
    }

    return new Promise<void>(resolve => {
      setTimeout(resolve, (time - ctx.currentTime) * 1000 + 100);
    });
  }, [playTone]);

  const playLetter = useCallback(async (letter: string, wpm = 15) => {
    const code = MORSE_TABLE[letter.toUpperCase()];
    if (!code) return;
    await playMorse(code, wpm);
  }, [playMorse]);

  const stop = useCallback(() => {
    if (audioCtxRef.current) {
      audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
  }, []);

  return { playMorse, playLetter, playTone, stop, MORSE_TABLE };
}

export { MORSE_RU, MORSE_EN, MORSE_DIGITS, MORSE_SPECIAL };