interface StepNumberProps {
  n: number;
}

export function StepNumber({ n }: StepNumberProps) {
  return (
    <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-schaaq-500/10 border border-schaaq-500/20 font-mono text-sm font-bold text-schaaq-400 flex-shrink-0">
      {n}
    </span>
  );
}
