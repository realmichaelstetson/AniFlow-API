"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  maxWidth?: string;
  containerClassName?: string;
  showCloseButton?: boolean;
}

export function Modal({
  isOpen,
  onClose,
  title,
  description,
  children,
  className,
  maxWidth = "max-w-2xl",
  containerClassName = "items-center justify-center p-4",
  showCloseButton = true,
}: ModalProps) {
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", handleKeyDown);
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className={cn("fixed inset-0 z-50 flex", containerClassName)}>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/80 backdrop-blur-md transition-opacity duration-300 animate-in fade-in"
        onClick={onClose}
      />

      {/* Modal Dialog */}
      <div
        style={{
          backgroundColor: "#030303",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.9), 0 1px 0 0 rgba(255, 255, 255, 0.04) inset",
        }}
        className={cn(
          "relative z-10 w-full rounded-3xl border border-white/[0.08] p-6 shadow-2xl transition-all duration-200 max-h-[85vh] overflow-y-auto font-product-sans",
          maxWidth,
          className
        )}
      >
        {showCloseButton && (
          <button
            type="button"
            onClick={onClose}
            className="absolute right-4 top-4 rounded-full p-2 text-zinc-400 hover:bg-white/[0.08] hover:text-white transition-colors"
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </button>
        )}

        {(title || description) && (
          <div className="mb-4 space-y-1">
            {title && <h2 className="text-base font-semibold text-white">{title}</h2>}
            {description && <p className="text-xs text-zinc-400">{description}</p>}
          </div>
        )}

        {children}
      </div>
    </div>
  );
}
