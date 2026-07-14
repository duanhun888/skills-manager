interface Props {
  count?: number;
}

export function MarketSkillGridSkeleton({ count = 9 }: Props) {
  return (
    <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-3">
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          className="app-panel flex animate-pulse flex-col gap-2 p-3"
          aria-hidden
        >
          <div className="flex items-start gap-2">
            <div className="h-6 w-6 shrink-0 rounded-full bg-surface-hover" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="h-3.5 w-3/4 rounded bg-surface-hover" />
              <div className="h-3 w-1/2 rounded bg-surface-hover" />
            </div>
          </div>
          <div className="flex gap-1">
            <div className="h-5 w-24 rounded bg-surface-hover" />
            <div className="h-5 w-12 rounded bg-surface-hover" />
          </div>
        </div>
      ))}
    </div>
  );
}
