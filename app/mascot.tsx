"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useRive, useViewModelInstanceNumber } from "@rive-app/react-webgl2";

type Mood = "idle" | "welcome" | "thinking" | "excited" | "celebrate";
type Size = "mini" | "hero" | "avatar" | "empty" | "closeout";

const images: Record<Mood, string> = {
  idle: "/mascot/idle.webp",
  welcome: "/mascot/welcome.webp",
  thinking: "/mascot/thinking.webp",
  excited: "/mascot/excited.webp",
  celebrate: "/mascot/celebrate.webp",
};
const moodValue: Record<Mood, number> = { idle: 0, welcome: 1, thinking: 2, excited: 3, celebrate: 4 };

function AnimatedMascot({ mood, onReady, onError }: { mood: Mood; onReady: () => void; onError: () => void }) {
  const { rive, RiveComponent } = useRive({
    src: "/mascot/salikha-t-rex-v1.3.riv",
    artboard: "Salikha Mascot",
    stateMachine: "Mascot Mood",
    autoplay: true,
    autoBind: true,
    onLoad: onReady,
    onLoadError: onError,
  });
  const { setValue } = useViewModelInstanceNumber("mood", rive?.viewModelInstance);

  useEffect(() => { setValue(moodValue[mood]); }, [mood, setValue]);

  return <RiveComponent className="salikha-mascot-rive" />;
}

export function Mascot({ mood = "idle", size = "mini", expressive = false }: { mood?: Mood; size?: Size; expressive?: boolean }) {
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduceMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const imageSizes = size === "hero" ? "(max-width: 620px) 118px, 208px" : size === "closeout" ? "128px" : size === "empty" ? "104px" : "40px";
  const animate = !reduceMotion && !failed;
  return <span className={`salikha-mascot salikha-mascot--${size} salikha-mascot--${mood} salikha-mascot--rive${expressive ? " salikha-mascot--expressive" : ""}`} aria-hidden="true">
    <Image className={`salikha-mascot-frame salikha-mascot-fallback${ready && animate ? " salikha-mascot-fallback--hidden" : ""}`} src={images[mood]} alt="" width={1024} height={1536} sizes={imageSizes} priority={size === "hero"} />
    {animate && <AnimatedMascot mood={mood} onReady={() => setReady(true)} onError={() => setFailed(true)} />}
  </span>;
}
