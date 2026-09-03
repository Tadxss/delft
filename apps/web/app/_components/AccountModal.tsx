"use client";

import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { ChevronLeft, ChevronRight, LogOut, User, X } from "lucide-react";
import imageCompression from "browser-image-compression";
import {
  AccountDeletionBlockedError,
  buildAccountExport,
  useAuthUser,
  useDeleteAccount,
  useProfile,
  useSetPassword,
  useSignOut,
  useSupabaseClient,
  useUploadAvatar,
  useUpsertProfile,
  useVaultKeys,
} from "@crowscribe/shared";
import { OCCUPATIONS } from "../_lib/occupations";
import { downloadJson } from "../_lib/downloadJson";
import { Button } from "./Button";
import { FormLabel } from "./FormLabel";
import { Input, Select, Textarea } from "./Input";
import { Modal } from "./Modal";
import { UsageCheckboxes } from "./UsageCheckboxes";

const MIN_PASSWORD_LENGTH = 8;

type View = "list" | "password" | "profile" | "theme" | "data";

export function AccountModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { user } = useAuthUser();
  const signOut = useSignOut();
  const setPassword = useSetPassword();
  const [view, setView] = useState<View>("list");
  const [password, setPasswordValue] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saved, setSaved] = useState(false);
  const [mismatch, setMismatch] = useState(false);

  // Never resume mid-drill-down on reopen — same reset-on-close pattern CredentialsModal uses.
  useEffect(() => {
    if (!open) setView("list");
  }, [open]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaved(false);
    if (password !== confirm) {
      setMismatch(true);
      return;
    }
    setMismatch(false);
    setPassword.mutate(
      { password },
      {
        onSuccess: () => {
          setSaved(true);
          setPasswordValue("");
          setConfirm("");
        },
      },
    );
  }

  function handleSignOut() {
    signOut.mutate(undefined, {
      onSuccess: () => {
        onClose();
        // Hard navigation, not router.replace: a soft nav to "/" lets the App Router restore the
        // magic-link `#access_token` hash from a cached history entry, stranding a still-valid
        // token in the URL after sign-out. A full reload also guarantees all in-memory state
        // (vault keys, query cache) is gone.
        window.location.replace("/");
      },
    });
  }

  const headerTitle =
    view === "password"
      ? "Password"
      : view === "theme"
        ? "Dark Mode"
        : view === "data"
          ? "Security & data"
          : "Update profile";

  return (
    <Modal open={open} onClose={onClose} widthClassName="max-w-sm">
      <div className="flex shrink-0 items-center justify-between border-b border-paper-200 px-4 py-2">
        {view === "list" ? (
          <span className="text-sm font-medium text-ink-800">Account</span>
        ) : (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              onClick={() => setView("list")}
              aria-label="Back"
            >
              <ChevronLeft size={16} />
            </Button>
            <span className="text-sm font-medium text-ink-800">
              {headerTitle}
            </span>
          </div>
        )}
        <Button variant="ghost" onClick={onClose} aria-label="Close">
          <X size={16} />
        </Button>
      </div>

      {view === "list" ? (
        <div className="flex flex-col gap-4 overflow-y-auto p-4">
          <p className="text-xs text-ink-500">
            Signed in as{" "}
            <span className="font-medium text-ink-700">{user?.email}</span>
          </p>

          <button
            type="button"
            onClick={() => setView("profile")}
            className="flex w-full items-center justify-between rounded-md border border-paper-200 bg-paper-100 px-4 py-3 text-left text-sm text-ink-800 hover:bg-paper-200"
          >
            Update profile
            <ChevronRight size={14} className="text-ink-400" />
          </button>

          <button
            type="button"
            onClick={() => setView("password")}
            className="flex w-full items-center justify-between rounded-md border border-paper-200 bg-paper-100 px-4 py-3 text-left text-sm text-ink-800 hover:bg-paper-200"
          >
            Password
            <ChevronRight size={14} className="text-ink-400" />
          </button>

          <button
            type="button"
            onClick={() => setView("theme")}
            className="flex w-full items-center justify-between rounded-md border border-paper-200 bg-paper-100 px-4 py-3 text-left text-sm text-ink-800 hover:bg-paper-200"
          >
            Dark Mode
            <ChevronRight size={14} className="text-ink-400" />
          </button>

          <button
            type="button"
            onClick={() => setView("data")}
            className="flex w-full items-center justify-between rounded-md border border-paper-200 bg-paper-100 px-4 py-3 text-left text-sm text-ink-800 hover:bg-paper-200"
          >
            Security &amp; data
            <ChevronRight size={14} className="text-ink-400" />
          </button>

          <button
            type="button"
            onClick={handleSignOut}
            className="flex items-center justify-center gap-2 rounded-md border border-paper-200 px-3 py-2 text-sm text-ink-600 hover:bg-paper-100 hover:text-ink-800"
          >
            <LogOut size={14} />
            Sign out
          </button>
        </div>
      ) : view === "data" ? (
        <DataPanel user={user} onDeleted={onClose} />
      ) : view === "password" ? (
        <div className="flex flex-col gap-2 overflow-y-auto p-4">
          <p className="text-xs text-ink-500">
            Sign in with a password instead of waiting on a magic-link email
            each time.
          </p>
          <form onSubmit={handleSubmit} className="mt-1 flex flex-col gap-2">
            <FormLabel htmlFor="password">New password</FormLabel>
            <Input
              id="password"
              type="password"
              required
              minLength={MIN_PASSWORD_LENGTH}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPasswordValue(e.target.value)}
            />
            <FormLabel htmlFor="confirm">Confirm password</FormLabel>
            <Input
              id="confirm"
              type="password"
              required
              minLength={MIN_PASSWORD_LENGTH}
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
            <Button type="submit" disabled={setPassword.isPending} className="mt-1">
              {setPassword.isPending ? "Saving…" : "Save password"}
            </Button>
            {mismatch && (
              <p className="text-xs text-red-700">
                Passwords don&apos;t match.
              </p>
            )}
            {setPassword.isError && (
              <p className="text-xs text-red-700">
                {setPassword.error.message}
              </p>
            )}
            {saved && (
              <p className="text-xs text-emerald-700">Password saved.</p>
            )}
          </form>
        </div>
      ) : view === "theme" ? (
        <ThemePicker />
      ) : (
        <ProfileForm userId={user?.id} />
      )}
    </Modal>
  );
}

function DataPanel({
  user,
  onDeleted,
}: {
  user: { id?: string; email?: string } | null | undefined;
  onDeleted: () => void;
}) {
  const [showExport, setShowExport] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  return (
    <div className="flex flex-col gap-4 overflow-y-auto p-4">
      <p className="text-xs text-ink-500">
        Download a copy of everything you&apos;ve created, or permanently close
        your account.
      </p>

      <button
        type="button"
        onClick={() => setShowExport(true)}
        className="flex w-full items-center justify-between rounded-md border border-paper-200 bg-paper-100 px-4 py-3 text-left text-sm text-ink-800 hover:bg-paper-200"
      >
        Export my data
        <ChevronRight size={14} className="text-ink-400" />
      </button>

      <button
        type="button"
        onClick={() => setShowDelete(true)}
        className="flex w-full items-center justify-between rounded-md border border-red-200 px-4 py-3 text-left text-sm text-red-700 hover:bg-red-50 dark:border-red-900/50 dark:hover:bg-red-950/30"
      >
        Delete account
        <ChevronRight size={14} className="opacity-60" />
      </button>

      <ExportConfirmModal
        open={showExport}
        onClose={() => setShowExport(false)}
        email={user?.email}
      />
      <DeleteAccountModal
        open={showDelete}
        onClose={() => setShowDelete(false)}
        userId={user?.id}
        email={user?.email}
        onDeleted={onDeleted}
      />
    </div>
  );
}

function ExportConfirmModal({
  open,
  onClose,
  email,
}: {
  open: boolean;
  onClose: () => void;
  email: string | undefined;
}) {
  const supabase = useSupabaseClient();
  const { getKey } = useVaultKeys();
  const [exporting, setExporting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setDone(false);
      setError(null);
      setExporting(false);
    }
  }, [open]);

  async function handleExport() {
    setExporting(true);
    setError(null);
    try {
      const data = await buildAccountExport(supabase, email ?? null, getKey);
      downloadJson(
        `crowscribe-export-${new Date().toISOString().slice(0, 10)}.json`,
        data,
      );
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} widthClassName="max-w-sm">
      <div className="flex shrink-0 items-center justify-between border-b border-paper-200 px-4 py-2">
        <span className="text-sm font-medium text-ink-800">Export my data</span>
        <Button variant="ghost" onClick={onClose} aria-label="Close">
          <X size={16} />
        </Button>
      </div>
      <div className="flex flex-col gap-3 overflow-y-auto p-4">
        <p className="text-sm text-ink-700">
          This downloads a single JSON file with everything you can see:
        </p>
        <ul className="ml-4 list-disc space-y-1 text-xs text-ink-600">
          <li>every workspace you own or belong to</li>
          <li>its pages (full content), canvases, and folders</li>
          <li>
            its credentials in <span className="font-medium">encrypted</span>{" "}
            form — decrypt them offline with your vault passphrase (any vault
            you have unlocked right now is also included decrypted)
          </li>
        </ul>
        <p className="text-xs text-ink-500">
          Keep the file somewhere safe — it contains your data. Nothing is sent
          anywhere; the file is built in your browser.
        </p>

        {error && <p className="text-xs text-red-700">{error}</p>}
        {done && (
          <p className="text-xs text-emerald-700">
            Export downloaded. Check your browser&apos;s downloads.
          </p>
        )}

        <div className="mt-1 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            {done ? "Close" : "Cancel"}
          </Button>
          {!done && (
            <Button onClick={handleExport} disabled={exporting}>
              {exporting ? "Preparing…" : "Download export"}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}

function DeleteAccountModal({
  open,
  onClose,
  userId,
  email,
  onDeleted,
}: {
  open: boolean;
  onClose: () => void;
  userId: string | undefined;
  email: string | undefined;
  onDeleted: () => void;
}) {
  const deleteAccount = useDeleteAccount();
  const { data: profile } = useProfile(userId);
  const [confirmText, setConfirmText] = useState("");

  useEffect(() => {
    if (!open) {
      setConfirmText("");
      deleteAccount.reset();
    }
    // deleteAccount.reset is stable; excluding it keeps this to an open/close effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const fullName = [profile?.firstName, profile?.middleName, profile?.lastName]
    .map((s) => s?.trim())
    .filter(Boolean)
    .join(" ");
  const armed =
    fullName.length > 0 &&
    confirmText.trim().replace(/\s+/g, " ").toLowerCase() ===
      fullName.toLowerCase();

  const blocked =
    deleteAccount.error instanceof AccountDeletionBlockedError
      ? deleteAccount.error
      : null;

  function handleDelete() {
    if (!armed) return;
    deleteAccount.mutate(undefined, { onSuccess: onDeleted });
  }

  return (
    <Modal open={open} onClose={onClose} widthClassName="max-w-sm">
      <div className="flex shrink-0 items-center justify-between border-b border-paper-200 px-4 py-2">
        <span className="text-sm font-medium text-ink-800">Delete account</span>
        <Button variant="ghost" onClick={onClose} aria-label="Close">
          <X size={16} />
        </Button>
      </div>
      <div className="flex flex-col gap-3 overflow-y-auto p-4">
        <p className="text-sm text-ink-700">
          This permanently deletes{" "}
          <span className="font-medium text-ink-800">{email}</span>, your
          profile, and every workspace you own along with its pages, canvases,
          and credentials vault.
        </p>
        <p className="text-xs text-ink-500">
          This cannot be undone. Workspaces where you&apos;re a member (not the
          owner) are unaffected — you&apos;re simply removed from them.
        </p>

        {blocked ? (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
            You still own {blocked.workspaces.length === 1 ? "a" : ""} shared
            workspace{blocked.workspaces.length > 1 ? "s" : ""}:{" "}
            <span className="font-medium">
              {blocked.workspaces.join(", ")}
            </span>
            . Transfer {blocked.workspaces.length > 1 ? "them" : "it"} to another
            member (Members → Make owner), remove the other members, or delete{" "}
            {blocked.workspaces.length > 1
              ? "those workspaces"
              : "that workspace"}
            , then try again.
          </div>
        ) : (
          deleteAccount.isError && (
            <p className="text-xs text-red-700">
              {deleteAccount.error.message}
            </p>
          )
        )}

        {profile === undefined ? (
          <p className="text-sm text-ink-400">Loading…</p>
        ) : fullName.length === 0 ? (
          <p className="text-xs text-amber-700">
            Add your name under <span className="font-medium">Update
            profile</span> first — it&apos;s used to confirm this.
          </p>
        ) : (
          <>
            <FormLabel htmlFor="delete-confirm">
              Type your full name{" "}
              <span className="font-semibold">({fullName})</span> to confirm
            </FormLabel>
            <Input
              id="delete-confirm"
              autoComplete="off"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
            />
          </>
        )}

        <div className="mt-1 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={!armed || deleteAccount.isPending}
          >
            {deleteAccount.isPending
              ? "Deleting…"
              : "Permanently delete my account"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

const THEME_OPTIONS = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
] as const;

function ThemePicker() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // `theme` is undefined until next-themes hydrates from localStorage/OS on the client.
  useEffect(() => setMounted(true), []);

  const current = mounted ? (theme ?? "system") : null;

  return (
    <div className="flex flex-col gap-4 overflow-y-auto p-4">
      <p className="text-xs text-ink-500">
        Choose how CrowScribe looks. “System” follows your device setting.
      </p>
      <div
        role="radiogroup"
        aria-label="Theme"
        className="flex flex-col gap-2"
      >
        {THEME_OPTIONS.map((option) => {
          const active = current === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={!mounted}
              onClick={() => setTheme(option.value)}
              className={`flex w-full items-center gap-3 rounded-md border px-4 py-3 text-left text-sm ${
                active
                  ? "border-accent-500 text-ink-800"
                  : "border-paper-200 text-ink-600 hover:bg-paper-100"
              }`}
            >
              <span
                className={`flex h-4 w-4 items-center justify-center rounded-full border ${
                  active ? "border-accent-500" : "border-paper-300"
                }`}
              >
                {active && (
                  <span className="h-2 w-2 rounded-full bg-accent-500" />
                )}
              </span>
              <span className="flex-1">{option.label}</span>
              {option.value === "system" && mounted && (
                <span className="text-xs text-ink-400">
                  {resolvedTheme === "dark" ? "Dark" : "Light"}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ProfileForm({ userId }: { userId: string | undefined }) {
  const { data: profile } = useProfile(userId);
  const upsertProfile = useUpsertProfile();
  const uploadAvatar = useUploadAvatar();

  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [lastName, setLastName] = useState("");
  const [occupation, setOccupation] = useState("");
  const [customOccupation, setCustomOccupation] = useState("");
  const [company, setCompany] = useState("");
  const [bio, setBio] = useState("");
  const [usage, setUsage] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Guards the seeding effect below to fire exactly once — defends against a *later* background
  // refetch (e.g. refocusing the tab) re-seeding over in-progress edits. This alone isn't enough
  // to prevent the *first* seed racing the user's first keystroke though — see the loading gate
  // below the effect, which is what actually closes that window.
  const seededRef = useRef(false);

  // Seed local form state once the profile query resolves — a missing row (pre-existing account,
  // trigger never fired) resolves to `null`, same as a row with every field empty.
  useEffect(() => {
    if (seededRef.current || profile === undefined) return;
    seededRef.current = true;
    setAvatarUrl(profile?.avatarUrl ?? null);
    setUsername(profile?.username ?? "");
    setFirstName(profile?.firstName ?? "");
    setMiddleName(profile?.middleName ?? "");
    setLastName(profile?.lastName ?? "");
    setCompany(profile?.company ?? "");
    setBio(profile?.bio ?? "");
    setUsage(profile?.usageIntent?.split(", ").filter(Boolean) ?? []);
    const stored = profile?.occupation ?? "";
    if (stored && !(OCCUPATIONS as readonly string[]).includes(stored)) {
      setOccupation("Other");
      setCustomOccupation(stored);
    } else {
      setOccupation(stored);
      setCustomOccupation("");
    }
  }, [profile]);

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !userId) return;
    const compressed = await imageCompression(file, {
      maxWidthOrHeight: 512,
      fileType: "image/webp",
      useWebWorker: true,
      exifOrientation: 1,
    });
    const url = await uploadAvatar.mutateAsync({ userId, file: compressed });
    setAvatarUrl(url);
    upsertProfile.mutate({ id: userId, avatarUrl: url });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!userId) return;
    setSaved(false);
    const finalOccupation =
      occupation === "Other" ? customOccupation.trim() : occupation;
    upsertProfile.mutate(
      {
        id: userId,
        username: username.trim() || null,
        firstName: firstName.trim() || null,
        middleName: middleName.trim() || null,
        lastName: lastName.trim() || null,
        occupation: finalOccupation || null,
        company: company.trim() || null,
        bio: bio.trim() || null,
        usageIntent: usage.join(", ") || null,
      },
      { onSuccess: () => setSaved(true) },
    );
  }

  // Real bug found (BETA_READINESS.md item 5's WebKit e2e pass): the seeding effect above only
  // guards against re-seeding on a *later* profile change — it doesn't stop the very first seed
  // from racing a user who starts typing before that first `profile` resolution lands, since the
  // fields already exist (empty) the instant this form mounts. Gating the fields out of the DOM
  // entirely until `profile` has resolved closes that race by construction: there's no window
  // where a keystroke could land in a field the seeding effect hasn't populated yet, because the
  // field doesn't exist yet either.
  if (profile === undefined) {
    return <p className="p-4 text-sm text-ink-400">Loading…</p>;
  }

  return (
    <div className="flex flex-col gap-2 overflow-y-auto p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full border border-paper-200 bg-paper-100">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- avatars are small, user-uploaded images with no build-time known dimensions; next/image's optimization isn't worth the config for this
            <img
              src={avatarUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <User size={22} className="text-ink-400" />
          )}
        </div>
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleAvatarChange}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadAvatar.isPending}
            className="rounded-md border border-paper-200 px-2.5 py-1.5 text-xs text-ink-600 hover:bg-paper-100 disabled:opacity-60"
          >
            {uploadAvatar.isPending ? "Uploading…" : "Change photo"}
          </button>
          {uploadAvatar.isError && (
            <p className="mt-1 text-xs text-red-700">
              {uploadAvatar.error.message}
            </p>
          )}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="mt-2 flex flex-col gap-2">
        <FormLabel htmlFor="username">Username (optional)</FormLabel>
        <Input
          id="username"
          value={username}
          onChange={(e) => setUsername(e.target.value.toLowerCase())}
          placeholder="e.g. ada_lovelace"
        />
        <p className="-mt-1 text-xs text-ink-400">
          Lowercase letters, numbers, and underscores only, 3–20 characters.
          Lets you sign in with this instead of your email.
        </p>

        <FormLabel htmlFor="firstName">First name</FormLabel>
        <Input
          id="firstName"
          maxLength={100}
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
        />

        <FormLabel htmlFor="middleName">Middle name (optional)</FormLabel>
        <Input
          id="middleName"
          maxLength={100}
          value={middleName}
          onChange={(e) => setMiddleName(e.target.value)}
        />

        <FormLabel htmlFor="lastName">Last name</FormLabel>
        <Input
          id="lastName"
          maxLength={100}
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
        />

        <FormLabel htmlFor="occupation">Occupation</FormLabel>
        <Select
          id="occupation"
          value={occupation}
          onChange={(e) => setOccupation(e.target.value)}
        >
          <option value="">Select an occupation</option>
          {OCCUPATIONS.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
          <option value="Other">Other</option>
        </Select>
        {occupation === "Other" && (
          <Input
            value={customOccupation}
            maxLength={200}
            onChange={(e) => setCustomOccupation(e.target.value)}
            placeholder="Enter your occupation"
          />
        )}

        <FormLabel htmlFor="company">Company (optional)</FormLabel>
        <Input
          id="company"
          maxLength={200}
          value={company}
          onChange={(e) => setCompany(e.target.value)}
        />

        <FormLabel htmlFor="bio">Bio</FormLabel>
        <Textarea
          id="bio"
          maxLength={2000}
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          rows={3}
          className="resize-none"
        />

        <FormLabel>How you use CrowScribe</FormLabel>
        <UsageCheckboxes value={usage} onChange={setUsage} />

        <Button type="submit" disabled={upsertProfile.isPending} className="mt-1">
          {upsertProfile.isPending ? "Saving…" : "Save profile"}
        </Button>
        {upsertProfile.isError && (
          <p className="text-xs text-red-700">
            {(upsertProfile.error as { code?: string })?.code === "23505"
              ? "That username is already taken."
              : upsertProfile.error.message}
          </p>
        )}
        {saved && <p className="text-xs text-emerald-700">Profile saved.</p>}
      </form>
    </div>
  );
}
