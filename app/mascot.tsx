import Image from "next/image";

type Mood = "idle" | "welcome" | "thinking" | "excited" | "celebrate";
type Size = "mini" | "hero" | "avatar" | "empty" | "closeout";

const images: Record<Mood, string> = {
  idle: "/mascot/idle.webp",
  welcome: "/mascot/welcome.webp",
  thinking: "/mascot/thinking.webp",
  excited: "/mascot/excited.webp",
  celebrate: "/mascot/celebrate.webp",
};
const blinkImage = "/mascot/blink.webp";

export function Mascot({ mood = "idle", size = "mini", expressive = false }: { mood?: Mood; size?: Size; expressive?: boolean }) {
  const imageSizes = size === "hero" ? "(max-width: 620px) 118px, 208px" : size === "closeout" ? "128px" : size === "empty" ? "104px" : "40px";
  return <span className={`salikha-mascot salikha-mascot--${size} salikha-mascot--${mood}${expressive ? " salikha-mascot--expressive" : ""}`} aria-hidden="true">
    <Image className="salikha-mascot-frame salikha-mascot-base" src={images[mood]} alt="" width={1024} height={1536} sizes={imageSizes} priority={size === "hero"} />
    {expressive && <>
      <Image className="salikha-mascot-frame salikha-mascot-blink" src={blinkImage} alt="" width={1024} height={1536} sizes={imageSizes} />
      <Image className="salikha-mascot-frame salikha-mascot-excited" src={images.excited} alt="" width={1024} height={1536} sizes={imageSizes} />
    </>}
    <i className="salikha-mascot-spark" />
  </span>;
}
