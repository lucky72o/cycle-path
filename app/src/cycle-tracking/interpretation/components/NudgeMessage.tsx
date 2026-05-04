import { btn } from './cardStyles';

type Props = {
  day: number;
  message: string;
  resolved: boolean;
  onResolve: (response: 'yes_disturbed' | 'no_correct') => void;
  onClose: () => void;
};

export function NudgeMessage({ day, message, resolved, onResolve, onClose }: Props) {
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs relative">
      <button onClick={onClose} className="absolute top-2 right-2 text-gray-400 hover:text-gray-600">✕</button>
      <div className="pr-6 text-gray-700 mb-2">{message}</div>
      {!resolved && (
        <div className="flex gap-2">
          <button
            onClick={() => onResolve('yes_disturbed')}
            className={`${btn.base} text-xs py-1 px-3 bg-amber-100 text-amber-800 border border-amber-300 hover:bg-amber-200`}
          >
            Yes, disturbed
          </button>
          <button
            onClick={() => onResolve('no_correct')}
            className={`${btn.base} text-xs py-1 px-3 bg-white text-gray-600 border border-gray-300 hover:bg-gray-50`}
          >
            No, correct
          </button>
        </div>
      )}
      {resolved && (
        <div className="text-gray-500 italic">Resolved</div>
      )}
    </div>
  );
}
