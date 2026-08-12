"use client";

import { useParams } from "next/navigation";
import { usePage } from "@delft/shared";
import { PageEditor } from "./_components/PageEditor";

export default function PageRoute() {
  const params = useParams<{ pageId: string }>();
  const { data: page, isLoading } = usePage(params.pageId);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-ink-500">
        Loading…
      </div>
    );
  }

  if (!page) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-ink-500">
        Page not found.
      </div>
    );
  }

  return <PageEditor page={page} />;
}
