"use client";

import { useParams } from "next/navigation";
import { usePage } from "@delft/shared";
import { PageEditor } from "./_components/PageEditor";

export default function PageRoute() {
  const params = useParams<{ pageId: string }>();
  const { data: page, isLoading, isError, error } = usePage(params.pageId);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-ink-500">
        Loading…
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-red-700">
        Couldn&apos;t load this page: {error.message}
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
