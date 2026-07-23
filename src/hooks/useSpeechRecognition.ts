import { useCallback, useEffect, useRef, useState } from 'react';

export interface SpeechRecognitionState {
  isSupported: boolean;
  isListening: boolean;
  isProcessing: boolean;
  interimText: string;
  finalText: string;
  error: string | null;
}

export interface SpeechRecognitionActions {
  start: () => void;
  stop: () => void;
  toggle: () => void;
}

export function useSpeechRecognition(onResult?: (text: string) => void): SpeechRecognitionState & SpeechRecognitionActions {
  const [state, setState] = useState<SpeechRecognitionState>({
    isSupported: checkSupport(),
    isListening: false,
    isProcessing: false,
    interimText: '',
    finalText: '',
    error: null,
  });

  const recognitionRef = useRef<any>(null);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  const cleanup = useCallback(() => {
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch {}
      recognitionRef.current = null;
    }
  }, []);

  const start = useCallback(() => {
    cleanup();
    if (!checkSupport()) {
      setState((s) => ({ ...s, error: 'Голосовой ввод не поддерживается в этом браузере' }));
      return;
    }

    const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) {
      setState((s) => ({ ...s, error: 'Голосовой ввод не поддерживается в этом браузере' }));
      return;
    }

    setState((s) => ({ ...s, isProcessing: true, error: null }));

    navigator.mediaDevices.getUserMedia({ audio: true })
      .then((stream) => {
        stream.getTracks().forEach((t) => t.stop());
        startRecognition(SpeechRecognitionAPI);
      })
      .catch((err) => {
        const msg = err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError'
          ? 'Доступ к микрофону запрещён. Нажми 🔒 в адресной строке → Микрофон → Разрешить'
          : 'Микрофон не найден. Подключите микрофон';
        setState((s) => ({ ...s, isListening: false, isProcessing: false, error: msg }));
      });
  }, [cleanup]);

  const startRecognition = useCallback((SpeechRecognitionAPI: any) => {
    const recognition = new SpeechRecognitionAPI();
    recognition.lang = 'ru-RU';
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setState((s) => ({ ...s, isListening: true, isProcessing: true, error: null, interimText: '', finalText: '' }));
    };

    recognition.onresult = (event: any) => {
      let interim = '';
      let final = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          final += transcript;
        } else {
          interim += transcript;
        }
      }
      setState((s) => ({ ...s, interimText: interim, finalText: final || s.finalText }));
    };

    recognition.onerror = (event: any) => {
      const errorMap: Record<string, string> = {
        'no-speech': 'Речь не распознана. Попробуйте ещё раз',
        'aborted': '',
        'not-allowed': 'Доступ к микрофону запрещён. Разрешите в настройках браузера (🔒 → Микрофон)',
        'audio-capture': 'Микрофон не найден. Подключите микрофон',
        'network': 'Ошибка сети для распознавания речи',
        'service-not-allowed': 'Распознавание речи недоступно для этого браузера',
      };
      const msg = errorMap[event.error] || `Ошибка: ${event.error}`;
      setState((s) => ({ ...s, isListening: false, isProcessing: false, error: msg || s.error }));
    };

    recognition.onend = () => {
      setState((s) => {
        const text = s.finalText || s.interimText;
        if (text && onResultRef.current) {
          onResultRef.current(text);
        }
        return { ...s, isListening: false, isProcessing: false };
      });
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [cleanup]);

  const stop = useCallback(() => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
    }
  }, []);

  const toggle = useCallback(() => {
    if (state.isListening) {
      stop();
    } else {
      start();
    }
  }, [state.isListening, start, stop]);

  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  return {
    ...state,
    start,
    stop,
    toggle,
  };
}

function checkSupport(): boolean {
  if (typeof window === 'undefined') return false;
  return !!(window as any).SpeechRecognition || !!(window as any).webkitSpeechRecognition;
}
