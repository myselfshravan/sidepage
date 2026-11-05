// Renders a trusted, constant inline script that runs during HTML parsing.
// Never pass user or manuscript content to this component.
export function InlineScript({ code }: { code: string }) {
  return <script suppressHydrationWarning type={typeof window === "undefined" ? "text/javascript" : "text/plain"} dangerouslySetInnerHTML={{ __html: code }} />;
}
