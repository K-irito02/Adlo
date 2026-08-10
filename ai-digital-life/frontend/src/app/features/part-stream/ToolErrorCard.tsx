export function ToolErrorCard({ error }: { error: string }) {
  return (
    <div className="adl-part-tool-error" role="alert">
      <pre className="adl-part-tool-error__text">{error}</pre>
    </div>
  );
}
