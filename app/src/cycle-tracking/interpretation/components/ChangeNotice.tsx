// app/src/cycle-tracking/interpretation/components/ChangeNotice.tsx
type Props = { message: string };

export function ChangeNotice({ message }: Props) {
  return (
    <div className="px-4 py-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800 flex items-start gap-2">
      <span className="text-base leading-none">ℹ️</span>
      <span>{message}</span>
    </div>
  );
}
