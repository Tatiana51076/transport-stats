import { Mic, MicOff, Loader2 } from 'lucide-react';
import { useSpeechRecognition, type SpeechRecognitionState } from '@/hooks/useSpeechRecognition';

interface VoiceInputProps {
  onResult: (text: string) => void;
  disabled?: boolean;
  label?: string;
}

export function VoiceInputButton({ onResult, disabled, label }: VoiceInputProps) {
  const speech = useSpeechRecognition(onResult);

  if (!speech.isSupported) return null;

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={speech.toggle}
        disabled={disabled}
        title={speech.isListening ? 'Остановить запись' : 'Голосовой ввод'}
        className={`flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-semibold shadow-card transition disabled:opacity-50 ${
          speech.isListening
            ? 'animate-pulse bg-error-500 text-white hover:bg-error-600'
            : 'bg-white text-primary-600 border border-primary-200 hover:bg-primary-50 hover:border-primary-300'
        }`}
      >
        {speech.isProcessing && speech.isListening ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : speech.isListening ? (
          <MicOff className="h-4 w-4" />
        ) : (
          <Mic className="h-4 w-4" />
        )}
        <span className="hidden sm:inline">{label || (speech.isListening ? 'Слушаю…' : 'Голос')}</span>
      </button>
      {speech.isListening && speech.interimText && (
        <span className="animate-fade-in max-w-[200px] truncate text-xs italic text-primary-400">
          {speech.interimText}
        </span>
      )}
      {speech.error && !speech.isListening && (
        <span className="text-xs text-error-500">{speech.error}</span>
      )}
    </div>
  );
}
