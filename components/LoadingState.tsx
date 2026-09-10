import { COLORS } from '@/lib/designTokens';

export default function LoadingState({ message = 'Loading…' }: { message?: string }) {
  return (
    <div style={{ textAlign: 'center', color: COLORS.textFaint, padding: '30px 24px', fontSize: 13.5 }}>
      {message}
    </div>
  );
}
