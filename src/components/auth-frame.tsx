"use client";

import { BrandLogo } from "@/components/brand-logo";
import { CityscapeBackdrop } from "@/components/cityscape";

export function AuthFrame({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <CityscapeBackdrop>
      <div className="flex min-h-dvh justify-center px-4 py-8 sm:py-10">
        <div className="auth-card my-auto w-full max-w-[440px] rounded-2xl bg-white/95 p-6 shadow-[0_12px_40px_rgba(0,0,0,0.28)] backdrop-blur-sm md:p-8">
          <BrandLogo stacked className="mb-4" />
          <h1 className="font-heading text-center text-2xl font-bold tracking-tight text-[#121417]">
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-1.5 text-center text-sm text-[#6B7280]">{subtitle}</p>
          ) : null}
          <div className="mt-5">{children}</div>
        </div>
      </div>
    </CityscapeBackdrop>
  );
}

export function AuthField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-[#121417]">{label}</span>
      {children}
    </label>
  );
}

export const authControlClass =
  "h-11 w-full rounded-xl border border-[#E5E7EB] bg-white px-3.5 text-sm text-[#121417] placeholder:text-[#9CA3AF] outline-none transition focus:border-[#24A148] focus:ring-3 focus:ring-[#24A148]/20";

export const authPrimaryClass =
  "inline-flex h-11 w-full items-center justify-center rounded-xl bg-[#24A148] px-4 text-sm font-semibold text-white transition-all hover:bg-[#1e8a3c] disabled:pointer-events-none disabled:opacity-60 data-[loading]:cursor-wait data-[loading]:scale-[0.98] data-[loading]:bg-[#1a7a36] data-[loading]:hover:bg-[#1a7a36] data-[loading]:shadow-inner data-[loading]:opacity-100";
