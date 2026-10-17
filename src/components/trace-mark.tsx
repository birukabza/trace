export function TraceMark({ className = "" }: { className?: string }) {
  return (
    <svg className={className} width="34" height="34" viewBox="0 0 34 34" fill="none" aria-hidden="true">
      <path d="M4 27V7h7v20H4Zm10 0V14h7v13h-7Zm10 0V4h7v23h-7Z" fill="currentColor" />
      <path d="m3 13 11 9L31 6" stroke="var(--paper, #f5f3ed)" strokeWidth="2" />
    </svg>
  );
}
