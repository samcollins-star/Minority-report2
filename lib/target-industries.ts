/**
 * Industries the team is explicitly targeting on the dashboard.
 * Order here determines the order they render in the table and the chart legend.
 */
export const TARGET_INDUSTRIES = [
  "Accounting / professional services",
  "Banking",
  "Council / Local Government",
  "Legal",
  "National Government Department",
] as const;

export type TargetIndustry = (typeof TARGET_INDUSTRIES)[number];

/**
 * CVD-safe palette for target industry lines (5 colours; one per row).
 * Picked to stay distinguishable under deuteranopia/protanopia.
 */
export const TARGET_INDUSTRY_COLOURS: Record<TargetIndustry, string> = {
  "Accounting / professional services": "#4f46e5", // indigo-600
  "Banking":                            "#d97706", // amber-600
  "Council / Local Government":         "#0284c7", // sky-600
  "Legal":                              "#7c3aed", // violet-600
  "National Government Department":     "#059669", // emerald-600
};
