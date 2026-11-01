export const PACKAGE_CALENDAR_COLORS = [
  { name: "Red", value: "#EFA1AD" },
  { name: "Orange", value: "#F2BA8D" },
  { name: "Yellow", value: "#E5CC79" },
  { name: "Green", value: "#9FD1AD" },
  { name: "Blue", value: "#A2C6E9" },
  { name: "Indigo", value: "#B3B5E4" },
  { name: "Violet", value: "#D3AFE0" },
] as const;

export const DEFAULT_PACKAGE_CALENDAR_COLOR = PACKAGE_CALENDAR_COLORS[0].value;

const PREVIOUS_PACKAGE_COLORS = ["#FDE2E4", "#FCE8D5", "#FFF4C2", "#DDF2E1", "#DCEBFA", "#E5E4FA", "#F0E1F7"];
const SOLID_PACKAGE_COLORS = ["#C94855", "#CE753E", "#B88B26", "#358767", "#3978AE", "#5C68AD", "#9163A8"];

export function displayPackageColor(value?: string | null): string {
  const previousIndex = PREVIOUS_PACKAGE_COLORS.findIndex((color, index) =>
    color.toLowerCase() === value?.toLowerCase() || SOLID_PACKAGE_COLORS[index].toLowerCase() === value?.toLowerCase()
  );
  return previousIndex >= 0 ? PACKAGE_CALENDAR_COLORS[previousIndex].value : value || DEFAULT_PACKAGE_CALENDAR_COLOR;
}
