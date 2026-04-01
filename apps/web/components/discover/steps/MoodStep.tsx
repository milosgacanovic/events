"use client";

import { useRef, useCallback } from "react";
import { GentleMoodSvg } from "../svg/GentleMoodSvg";
import { WildMoodSvg } from "../svg/WildMoodSvg";
import { DeepMoodSvg } from "../svg/DeepMoodSvg";
import { OpenMoodSvg } from "../svg/OpenMoodSvg";
import type { MoodId } from "../discoverTypes";

type MoodOption = {
  id: MoodId;
  title: string;
  desc: string;
  Svg: typeof GentleMoodSvg;
};

const MOOD_OPTIONS: MoodOption[] = [
  { id: "gentle", title: "Gentle & grounding", desc: "Slow, meditative, breath-led", Svg: GentleMoodSvg },
  { id: "wild", title: "Wild & ecstatic", desc: "High energy, free expression", Svg: WildMoodSvg },
  { id: "deep", title: "Deep & transformative", desc: "Emotional, ceremonial, journey", Svg: DeepMoodSvg },
  { id: "open", title: "Open to anything", desc: "Surprise me", Svg: OpenMoodSvg },
];

type Props = {
  selectedMood: MoodId | null;
  moodTransition: boolean;
  onSelect: (mood: MoodId) => void;
};

export function MoodStep({ selectedMood, moodTransition, onSelect }: Props) {
  const gridRef = useRef<HTMLDivElement>(null);

  const handleClick = useCallback(
    (mood: MoodId) => {
      if (moodTransition) return;
      onSelect(mood);
    },
    [moodTransition, onSelect],
  );

  return (
    <div className="discover-step">
      <h2 className="discover-step-title">How do you want to move?</h2>
      <p className="discover-step-subtitle">Choose the energy that calls to you</p>
      <div className="mood-grid" ref={gridRef}>
        {MOOD_OPTIONS.map((opt) => {
          const isSelected = selectedMood === opt.id;
          const isExiting = moodTransition && !isSelected;
          const isExpanding = moodTransition && isSelected;

          return (
            <button
              key={opt.id}
              type="button"
              className={`mood-card mood-card--${opt.id}${isExiting ? " mood-card--exiting" : ""}${isExpanding ? " mood-card--expanding" : ""}`}
              onClick={() => handleClick(opt.id)}
              aria-pressed={isSelected}
            >
              <div className="mood-card__svg-wrap">
                <opt.Svg expanded={isExpanding} />
              </div>
              <div className="mood-card__label">
                <p className="mood-card__title">{opt.title}</p>
                <p className="mood-card__desc">{opt.desc}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
