"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import imageCompression from "browser-image-compression";
import {
  buildWorkspaceHref,
  useUpdateWorkspace,
  useUploadWorkspaceLogo,
  useWorkspace,
  workspaceInitials,
} from "@crowscribe/shared";
import { Button } from "../../../_components/Button";
import { FormLabel } from "../../../_components/FormLabel";
import { Input } from "../../../_components/Input";
import { Modal } from "../../../_components/Modal";

const MAX_LOGO_URL_LENGTH = 2000; // matches the workspaces.logo_url CHECK constraint

// Owner-only workspace settings — set the logo (upload a file OR paste an image URL), remove it,
// and rename the workspace. Opened from the SidebarHeader dropdown. Upload mirrors AccountModal's
// avatar flow (compress in the browser → raw storage upload → persist the URL); the URL path
// writes straight to logo_url with no storage round trip.
export function WorkspaceSettingsModal({
  workspaceId,
  open,
  onClose,
}: {
  workspaceId: string;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const { data: workspace } = useWorkspace(workspaceId);
  const updateWorkspace = useUpdateWorkspace();
  const uploadLogo = useUploadWorkspaceLogo();

  const [name, setName] = useState("");
  const [urlInput, setUrlInput] = useState("");
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);

  // Re-seed / reset local state every time the modal opens, so a cancelled edit never lingers.
  useEffect(() => {
    if (open) {
      setName(workspace?.name ?? "");
      setUrlInput("");
      setLogoError(null);
    }
  }, [open, workspace?.name]);

  const logoUrl = workspace?.logoUrl ?? null;
  const trimmedName = name.trim();
  const nameChanged = trimmedName.length > 0 && trimmedName !== workspace?.name;

  async function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setLogoError(null);
    setLogoBusy(true);
    try {
      const compressed = await imageCompression(file, {
        maxWidthOrHeight: 512,
        fileType: "image/webp",
        useWebWorker: true,
        exifOrientation: 1,
      });
      const url = await uploadLogo.mutateAsync({
        workspaceId,
        file: compressed,
      });
      await updateWorkspace.mutateAsync({ id: workspaceId, logoUrl: url });
    } catch (err) {
      setLogoError(
        err instanceof Error ? err.message : "Couldn't upload that image.",
      );
    } finally {
      setLogoBusy(false);
    }
  }

  function handleSetUrl() {
    const u = urlInput.trim();
    if (!u) return;
    if (!/^https?:\/\/.+/i.test(u) || u.length > MAX_LOGO_URL_LENGTH) {
      setLogoError("Enter a valid http(s) image URL.");
      return;
    }
    setLogoError(null);
    updateWorkspace.mutate(
      { id: workspaceId, logoUrl: u },
      { onSuccess: () => setUrlInput("") },
    );
  }

  function handleRemoveLogo() {
    setLogoError(null);
    updateWorkspace.mutate({ id: workspaceId, logoUrl: null });
  }

  function handleSaveName() {
    if (!nameChanged) return;
    updateWorkspace.mutate(
      { id: workspaceId, name: trimmedName },
      {
        onSuccess: () =>
          router.replace(
            buildWorkspaceHref({ id: workspaceId, name: trimmedName }),
          ),
      },
    );
  }

  return (
    <Modal open={open} onClose={onClose} widthClassName="max-w-sm">
      <div className="flex shrink-0 items-center justify-between border-b border-paper-200 px-4 py-2">
        <span className="text-sm font-medium text-ink-800">
          Workspace settings
        </span>
        <Button variant="ghost" onClick={onClose} aria-label="Close">
          <X size={16} />
        </Button>
      </div>

      <div className="flex flex-col gap-5 overflow-y-auto p-4">
        <div className="flex flex-col gap-2">
          <FormLabel>Logo</FormLabel>
          <div className="flex items-start gap-3">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-paper-200 bg-paper-100">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- small user-provided image with no build-time known dimensions; next/image's optimization isn't worth the config for this
                <img
                  src={logoUrl}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="text-base font-semibold text-ink-500">
                  {workspaceInitials(workspace?.name ?? "")}
                </span>
              )}
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <div className="flex gap-2">
                <label
                  className={`cursor-pointer rounded-md border border-paper-200 px-2.5 py-1.5 text-xs text-ink-600 hover:bg-paper-100 ${
                    logoBusy ? "pointer-events-none opacity-60" : ""
                  }`}
                >
                  {logoBusy ? "Uploading…" : "Upload"}
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={handleLogoChange}
                    disabled={logoBusy}
                  />
                </label>
                {logoUrl && (
                  <button
                    type="button"
                    onClick={handleRemoveLogo}
                    disabled={updateWorkspace.isPending}
                    className="rounded-md border border-paper-200 px-2.5 py-1.5 text-xs text-ink-600 hover:bg-paper-100 disabled:opacity-60"
                  >
                    Remove
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <Input
                  type="url"
                  placeholder="…or paste an image URL"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  className="min-w-0 flex-1"
                />
                <Button
                  variant="secondary"
                  onClick={handleSetUrl}
                  disabled={!urlInput.trim() || updateWorkspace.isPending}
                >
                  Set
                </Button>
              </div>
              {logoError && (
                <p className="text-xs text-red-700">{logoError}</p>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <FormLabel htmlFor="workspace-settings-name">Name</FormLabel>
          <div className="flex gap-2">
            <Input
              id="workspace-settings-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={200}
              className="min-w-0 flex-1"
            />
            <Button
              onClick={handleSaveName}
              disabled={!nameChanged || updateWorkspace.isPending}
            >
              Save
            </Button>
          </div>
          {updateWorkspace.isError && (
            <p className="text-xs text-red-700">
              {updateWorkspace.error.message}
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}
