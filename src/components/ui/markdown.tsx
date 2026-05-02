"use client";

import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";

export function Markdown({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "prose prose-sm max-w-none dark:prose-invert",
        "prose-headings:mb-2 prose-headings:mt-4 prose-headings:font-semibold",
        "prose-p:mb-2 prose-p:leading-relaxed",
        "prose-ul:my-2 prose-ol:my-2",
        "prose-li:my-0.5",
        "prose-strong:font-semibold",
        className
      )}
    >
      <ReactMarkdown>{children}</ReactMarkdown>
    </div>
  );
}
