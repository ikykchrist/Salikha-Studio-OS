export const PACKAGE_CALENDAR_COLORS = [
  { name: "Red", value: "#C94855" },
  { name: "Orange", value: "#CE753E" },
  { name: "Yellow", value: "#B88B26" },
  { name: "Green", value: "#358767" },
  { name: "Blue", value: "#3978AE" },
  { name: "Indigo", value: "#5C68AD" },
  { name: "Violet", value: "#9163A8" },
] as const;

export const DEFAULT_PACKAGE_CALENDAR_COLOR = PACKAGE_CALENDAR_COLORS[0].value;

const PREVIOUS_PACKAGE_COLORS = ["#FDE2E4", "#FCE8D5", "#FFF4C2", "#DDF2E1", "#DCEBFA", "#E5E4FA", "#F0E1F7"];

export function displayPackageColor(value?: string | null): string {
  const previousIndex = PREVIOUS_PACKAGE_COLORS.findIndex((color) => color.toLowerCase() === value?.toLowerCase());
  return previousIndex >= 0 ? PACKAGE_CALENDAR_COLORS[previousIndex].value : value || DEFAULT_PACKAGE_CALENDAR_COLOR;
}
