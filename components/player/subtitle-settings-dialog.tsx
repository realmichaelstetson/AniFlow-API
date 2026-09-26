"use client";

import React from "react";
import { Modal } from "@/components/ui/dialog";

export interface SubtitleStyles {
  fontSize: "sm" | "base" | "lg" | "xl" | "2xl";
  fontFamily?: "sans" | "anime" | "mono" | "serif";
  fontWeight?: "normal" | "bold";
  color: string;
  background: string;
  shadow: boolean;
  outline?: "none" | "thin" | "thick";
  bottomOffset?: number; // percentage from bottom
}

interface SubtitleSettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  styles: SubtitleStyles;
  onStylesChange: (styles: SubtitleStyles) => void;
}

export function SubtitleSettingsDialog({
  isOpen,
  onClose,
  styles,
  onStylesChange,
}: SubtitleSettingsDialogProps) {
  const fontSizes: Array<{ label: string; value: SubtitleStyles["fontSize"] }> = [
    { label: "Small (14px)", value: "sm" },
    { label: "Medium (18px)", value: "base" },
    { label: "Large (24px)", value: "lg" },
    { label: "Extra Large (30px)", value: "xl" },
    { label: "Huge (36px)", value: "2xl" },
  ];

  const fontFamilies: Array<{ label: string; value: NonNullable<SubtitleStyles["fontFamily"]> }> = [
    { label: "Modern Sans", value: "sans" },
    { label: "Anime Clean", value: "anime" },
    { label: "Mono Retro", value: "mono" },
    { label: "Classic Serif", value: "serif" },
  ];

  const colors = [
    { label: "White", value: "#ffffff" },
    { label: "Yellow", value: "#facc15" },
    { label: "Cyan", value: "#38bdf8" },
    { label: "Lime", value: "#4ade80" },
    { label: "Pink", value: "#f472b6" },
  ];

  const backgrounds = [
    { label: "Transparent (Outlined Text)", value: "transparent" },
    { label: "Blur Dark (40%)", value: "rgba(0, 0, 0, 0.4)" },
    { label: "Solid Black (85%)", value: "rgba(0, 0, 0, 0.85)" },
  ];

  const getFontFamilyCSS = (font?: string) => {
    switch (font) {
      case "anime":
        return '"Trebuchet MS", "Segoe UI", sans-serif';
      case "mono":
        return 'ui-monospace, "Cascadia Code", monospace';
      case "serif":
        return 'Georgia, Cambria, "Times New Roman", serif';
      default:
        return 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    }
  };

  const getOutlineStyles = (): React.CSSProperties => {
    const outline = styles.outline || "thick";
    if (outline === "thick") {
      return {
        WebkitTextStroke: "2px #000000",
        paintOrder: "stroke fill",
        textShadow:
          "0 0 2px #000000, 0 -2px 0 #000000, 0 2px 0 #000000, -2px 0 0 #000000, 2px 0 0 #000000, -1.5px -1.5px 0 #000000, 1.5px -1.5px 0 #000000, -1.5px 1.5px 0 #000000, 1.5px 1.5px 0 #000000, 0 2px 4px rgba(0, 0, 0, 0.9)",
      };
    }
    if (outline === "thin") {
      return {
        WebkitTextStroke: "1px #000000",
        paintOrder: "stroke fill",
        textShadow:
          "0 0 1px #000000, 0 -1px 0 #000000, 0 1px 0 #000000, -1px 0 0 #000000, 1px 0 0 #000000, -1px -1px 0 #000000, 1px -1px 0 #000000, -1px 1px 0 #000000, 1px 1px 0 #000000, 0 1px 3px rgba(0, 0, 0, 0.8)",
      };
    }
    return {
      WebkitTextStroke: "0px transparent",
      paintOrder: "normal",
      textShadow: styles.shadow ? "0 2px 4px rgba(0,0,0,0.9)" : "none",
    };
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Subtitle Styling"
      description="Customize subtitle typography, colors, shadows, and backdrop appearance."
      maxWidth="max-w-md"
    >
      <div className="space-y-4 pt-2">
        {/* Live Preview */}
        <div className="relative rounded-lg border border-white/10 bg-zinc-950 p-6 text-center overflow-hidden flex items-center justify-center min-h-[90px]">
          <div className="absolute inset-0 bg-[radial-gradient(#333_1px,transparent_1px)] [background-size:16px_16px] opacity-30" />
          <div
            className={`relative inline-block px-3 py-1 rounded transition-all select-none ${
              styles.background.includes("0.4") || styles.background === "blur"
                ? "backdrop-blur-md bg-black/40 border border-white/10"
                : ""
            }`}
            style={{
              fontSize:
                styles.fontSize === "sm"
                  ? "14px"
                  : styles.fontSize === "lg"
                  ? "24px"
                  : styles.fontSize === "xl"
                  ? "30px"
                  : styles.fontSize === "2xl"
                  ? "36px"
                  : "18px",
              fontFamily: getFontFamilyCSS(styles.fontFamily),
              fontWeight: styles.fontWeight === "normal" ? "normal" : "bold",
              color: styles.color,
              backgroundColor:
                styles.background.includes("0.4") || styles.background === "blur"
                  ? undefined
                  : styles.background,
              ...getOutlineStyles(),
            }}
          >
            I will protect everyone! 私が守る！
          </div>
        </div>

        {/* Font Family */}
        <div>
          <label className="text-[11px] font-mono font-medium text-zinc-400 uppercase tracking-wider block mb-1">
            Font Style
          </label>
          <div className="grid grid-cols-4 gap-1.5">
            {fontFamilies.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => onStylesChange({ ...styles, fontFamily: f.value })}
                className={`py-1.5 px-2 rounded-md text-xs font-medium border transition-colors ${
                  (styles.fontFamily || "sans") === f.value
                    ? "bg-white text-black border-transparent font-bold shadow"
                    : "bg-[#0C0C0C] text-zinc-300 border-white/[0.08] hover:bg-[#141414] hover:text-white"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Font Size */}
        <div>
          <label className="text-[11px] font-mono font-medium text-zinc-400 uppercase tracking-wider block mb-1">
            Font Size
          </label>
          <div className="grid grid-cols-5 gap-1">
            {fontSizes.map((size) => (
              <button
                key={size.value}
                type="button"
                onClick={() => onStylesChange({ ...styles, fontSize: size.value })}
                className={`py-1 px-1 rounded-md text-xs font-mono border transition-colors text-center ${
                  styles.fontSize === size.value
                    ? "bg-white text-black border-transparent font-bold shadow"
                    : "bg-[#0C0C0C] text-zinc-300 border-white/[0.08] hover:bg-[#141414] hover:text-white"
                }`}
              >
                {size.value.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Text Color */}
        <div>
          <label className="text-[11px] font-mono font-medium text-zinc-400 uppercase tracking-wider block mb-1">
            Text Color
          </label>
          <div className="flex gap-1.5">
            {colors.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => onStylesChange({ ...styles, color: c.value })}
                className={`flex-1 py-1.5 px-1.5 rounded-md text-xs font-medium border flex items-center justify-center gap-1.5 transition-colors ${
                  styles.color === c.value
                    ? "bg-zinc-800 border-zinc-500 text-white ring-1 ring-white/20"
                    : "bg-[#0C0C0C] text-zinc-300 border-white/[0.08] hover:bg-[#141414]"
                }`}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full inline-block border border-black/40 shrink-0"
                  style={{ backgroundColor: c.value }}
                />
                <span className="hidden sm:inline">{c.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Background & Outline */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] font-mono font-medium text-zinc-400 uppercase tracking-wider block mb-1">
              Background Box
            </label>
            <div className="space-y-1">
              {backgrounds.map((bg) => (
                <button
                  key={bg.value}
                  type="button"
                  onClick={() => onStylesChange({ ...styles, background: bg.value })}
                  className={`w-full py-1 px-2.5 rounded-md text-xs text-left truncate font-medium border transition-colors ${
                    styles.background === bg.value
                      ? "bg-white text-black border-transparent font-bold shadow"
                      : "bg-[#0C0C0C] text-zinc-300 border-white/[0.08] hover:bg-[#141414]"
                  }`}
                >
                  {bg.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[11px] font-mono font-medium text-zinc-400 uppercase tracking-wider block mb-1">
              Text Stroke / Outline
            </label>
            <div className="space-y-1">
              {[
                { label: "Thick Stroke (Anime)", value: "thick" },
                { label: "Thin Stroke", value: "thin" },
                { label: "Soft Shadow Only", value: "none" },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() =>
                    onStylesChange({
                      ...styles,
                      outline: opt.value as any,
                      shadow: true,
                    })
                  }
                  className={`w-full py-1 px-2.5 rounded-md text-xs text-left truncate font-medium border transition-colors ${
                    (styles.outline || "thick") === opt.value
                      ? "bg-white text-black border-transparent font-bold shadow"
                      : "bg-[#0C0C0C] text-zinc-300 border-white/[0.08] hover:bg-[#141414]"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-1.5 rounded-full bg-white text-black text-xs font-semibold hover:bg-zinc-200 active:scale-95 transition-all shadow"
          >
            Done
          </button>
        </div>
      </div>
    </Modal>
  );
}
