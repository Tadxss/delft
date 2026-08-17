"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, LogOut, User, X } from "lucide-react";
import imageCompression from "browser-image-compression";
import { useAuthUser, useProfile, useSetPassword, useSignOut, useUploadAvatar, useUpsertProfile } from "@delft/shared";
import { OCCUPATIONS } from "../_lib/occupations";
import { Modal } from "./Modal";

const MIN_PASSWORD_LENGTH = 8;

type View = "list" | "password" | "profile";

export function AccountModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuthUser();
  const router = useRouter();
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
        router.replace("/");
      },
    });
  }

  return (
    <Modal open={open} onClose={onClose} widthClassName="max-w-sm">
      <div className="flex shrink-0 items-center justify-between border-b border-paper-200 px-4 py-2">
        {view === "list" ? (
          <span className="text-sm font-medium text-ink-800">Account</span>
        ) : (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setView("list")}
              aria-label="Back"
              className="rounded px-1 py-1 text-ink-500 hover:bg-paper-100 hover:text-ink-800"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm font-medium text-ink-800">
              {view === "password" ? "Password" : "Update profile"}
            </span>
          </div>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="rounded px-2 py-1 text-ink-500 hover:bg-paper-100 hover:text-ink-800"
        >
          <X size={16} />
        </button>
      </div>

      {view === "list" ? (
        <div className="flex flex-col gap-4 overflow-y-auto p-4">
          <p className="text-xs text-ink-500">
            Signed in as <span className="font-medium text-ink-700">{user?.email}</span>
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
            onClick={handleSignOut}
            className="flex items-center justify-center gap-2 rounded-md border border-paper-200 px-3 py-2 text-sm text-ink-600 hover:bg-paper-100 hover:text-ink-800"
          >
            <LogOut size={14} />
            Sign out
          </button>
        </div>
      ) : view === "password" ? (
        <div className="flex flex-col gap-2 overflow-y-auto p-4">
          <p className="text-xs text-ink-500">
            Sign in with a password instead of waiting on a magic-link email each time.
          </p>
          <form onSubmit={handleSubmit} className="mt-1 flex flex-col gap-2">
            <label htmlFor="password" className="text-xs font-medium uppercase tracking-wide text-ink-500">
              New password
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={MIN_PASSWORD_LENGTH}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPasswordValue(e.target.value)}
              className="rounded-md border border-paper-200 bg-paper-50 px-3 py-2 text-sm text-ink-800 outline-none focus:border-accent-500"
            />
            <label htmlFor="confirm" className="text-xs font-medium uppercase tracking-wide text-ink-500">
              Confirm password
            </label>
            <input
              id="confirm"
              type="password"
              required
              minLength={MIN_PASSWORD_LENGTH}
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="rounded-md border border-paper-200 bg-paper-50 px-3 py-2 text-sm text-ink-800 outline-none focus:border-accent-500"
            />
            <button
              type="submit"
              disabled={setPassword.isPending}
              className="mt-1 rounded-md bg-ink-800 px-3 py-2 text-sm font-medium text-paper-50 transition-colors hover:bg-ink-700 disabled:opacity-60"
            >
              {setPassword.isPending ? "Saving…" : "Save password"}
            </button>
            {mismatch && <p className="text-xs text-red-700">Passwords don&apos;t match.</p>}
            {setPassword.isError && <p className="text-xs text-red-700">{setPassword.error.message}</p>}
            {saved && <p className="text-xs text-emerald-700">Password saved.</p>}
          </form>
        </div>
      ) : (
        <ProfileForm userId={user?.id} />
      )}
    </Modal>
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
  const [bio, setBio] = useState("");
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
    setBio(profile?.bio ?? "");
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
    const finalOccupation = occupation === "Other" ? customOccupation.trim() : occupation;
    upsertProfile.mutate(
      {
        id: userId,
        username: username.trim() || null,
        firstName: firstName.trim() || null,
        middleName: middleName.trim() || null,
        lastName: lastName.trim() || null,
        occupation: finalOccupation || null,
        bio: bio.trim() || null,
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
            <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
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
            <p className="mt-1 text-xs text-red-700">{uploadAvatar.error.message}</p>
          )}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="mt-2 flex flex-col gap-2">
        <label htmlFor="username" className="text-xs font-medium uppercase tracking-wide text-ink-500">
          Username (optional)
        </label>
        <input
          id="username"
          value={username}
          onChange={(e) => setUsername(e.target.value.toLowerCase())}
          placeholder="e.g. ada_lovelace"
          className="rounded-md border border-paper-200 bg-paper-50 px-3 py-2 text-sm text-ink-800 outline-none focus:border-accent-500"
        />
        <p className="-mt-1 text-xs text-ink-400">
          Lowercase letters, numbers, and underscores only, 3–20 characters. Lets you sign in with
          this instead of your email.
        </p>

        <label htmlFor="firstName" className="text-xs font-medium uppercase tracking-wide text-ink-500">
          First name
        </label>
        <input
          id="firstName"
          maxLength={100}
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          className="rounded-md border border-paper-200 bg-paper-50 px-3 py-2 text-sm text-ink-800 outline-none focus:border-accent-500"
        />

        <label htmlFor="middleName" className="text-xs font-medium uppercase tracking-wide text-ink-500">
          Middle name (optional)
        </label>
        <input
          id="middleName"
          maxLength={100}
          value={middleName}
          onChange={(e) => setMiddleName(e.target.value)}
          className="rounded-md border border-paper-200 bg-paper-50 px-3 py-2 text-sm text-ink-800 outline-none focus:border-accent-500"
        />

        <label htmlFor="lastName" className="text-xs font-medium uppercase tracking-wide text-ink-500">
          Last name
        </label>
        <input
          id="lastName"
          maxLength={100}
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          className="rounded-md border border-paper-200 bg-paper-50 px-3 py-2 text-sm text-ink-800 outline-none focus:border-accent-500"
        />

        <label htmlFor="occupation" className="text-xs font-medium uppercase tracking-wide text-ink-500">
          Occupation
        </label>
        <select
          id="occupation"
          value={occupation}
          onChange={(e) => setOccupation(e.target.value)}
          className="rounded-md border border-paper-200 bg-paper-50 px-3 py-2 text-sm text-ink-800 outline-none focus:border-accent-500"
        >
          <option value="">Select an occupation</option>
          {OCCUPATIONS.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
          <option value="Other">Other</option>
        </select>
        {occupation === "Other" && (
          <input
            value={customOccupation}
            maxLength={200}
            onChange={(e) => setCustomOccupation(e.target.value)}
            placeholder="Enter your occupation"
            className="rounded-md border border-paper-200 bg-paper-50 px-3 py-2 text-sm text-ink-800 outline-none focus:border-accent-500"
          />
        )}

        <label htmlFor="bio" className="text-xs font-medium uppercase tracking-wide text-ink-500">
          Bio
        </label>
        <textarea
          id="bio"
          maxLength={2000}
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          rows={3}
          className="resize-none rounded-md border border-paper-200 bg-paper-50 px-3 py-2 text-sm text-ink-800 outline-none focus:border-accent-500"
        />

        <button
          type="submit"
          disabled={upsertProfile.isPending}
          className="mt-1 rounded-md bg-ink-800 px-3 py-2 text-sm font-medium text-paper-50 transition-colors hover:bg-ink-700 disabled:opacity-60"
        >
          {upsertProfile.isPending ? "Saving…" : "Save profile"}
        </button>
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
