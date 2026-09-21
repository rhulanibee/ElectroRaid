"use client";

import { useEffect, useRef, useState } from "react";
import { FileUp } from "lucide-react";
import { AuthFrame, authPrimaryClass } from "@/components/auth-frame";
import { useSession } from "@/lib/use-session";
import { goReplace } from "@/lib/hard-nav";

export function VerifyScreen() {
  const { persona, ready, completeVerification } = useSession();
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!ready) return;
    if (!persona) {
      goReplace("/login");
      return;
    }
    if (persona.role !== "resident") {
      goReplace(persona.home);
      return;
    }
    if (persona.verified) {
      goReplace("/resident");
    }
  }, [ready, persona]);

  function takeFile(file: File | undefined) {
    if (!file) return;
    const ok =
      file.type.startsWith("image/") ||
      file.type === "application/pdf" ||
      /\.(pdf|png|jpe?g|webp)$/i.test(file.name);
    if (!ok) {
      setError("Upload a photo or PDF of your proof of residence.");
      return;
    }
    setError(null);
    setFileName(file.name);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!fileName) {
      setError("Choose a document before continuing.");
      return;
    }
    completeVerification(fileName);
    goReplace("/resident");
  }

  if (!ready || !persona) {
    return (
      <AuthFrame title="Upload proof of residence">
        <p className="text-center text-sm text-[#6B7280]">Opening verification…</p>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame
      title="Upload proof of residence"
      subtitle="A municipal statement, lease, or utility letter for this account."
    >
      <form onSubmit={submit} className="space-y-4">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            takeFile(e.dataTransfer.files[0]);
          }}
          className={`flex w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed px-4 py-10 text-center transition ${
            drag
              ? "border-[#24A148] bg-[#E8F6EC]"
              : "border-[#D1D5DB] bg-[#F8FAF8] hover:border-[#24A148]"
          }`}
        >
          <span className="flex size-14 items-center justify-center rounded-2xl bg-[#E8F6EC] text-[#24A148]">
            <FileUp className="size-7" />
          </span>
          <div className="mt-3 text-sm font-semibold text-[#121417]">
            {fileName ? fileName : "Drop a document here"}
          </div>
          <div className="mt-1 text-xs text-[#6B7280]">
            PDF, JPG or PNG · municipal account, lease, or affidavit
          </div>
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*,.pdf"
          className="hidden"
          onChange={(e) => takeFile(e.target.files?.[0])}
        />
        {error ? <p className="text-sm text-[#DC2626]">{error}</p> : null}
        <button type="submit" className={authPrimaryClass}>
          Confirm
        </button>
      </form>
    </AuthFrame>
  );
}
