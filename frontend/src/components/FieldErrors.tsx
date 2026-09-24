interface FieldErrorsProps {
  error?: string | null;
  issues?: Record<string, string> | string[];
  className?: string;
}

export function FieldErrors({ error, issues, className = "" }: FieldErrorsProps) {
  const issueMessages =
    issues instanceof Array ? issues : issues ? Object.values(issues) : [];
  if (!error && issueMessages.length === 0) return null;

  return (
    <div
      role="alert"
      className={`rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300 ${className}`}
    >
      {error ? <p className="font-medium">{error}</p> : null}
      {issueMessages.length > 0 && (
        <ul className="list-inside list-disc space-y-0.5">
          {issueMessages.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      )}
    </div>
  );
}