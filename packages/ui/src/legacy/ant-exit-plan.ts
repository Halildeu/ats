/**
 * Ant Design Exit Plan -- Faz 5
 *
 * Classification of all Ant Design components against the native
 * @ats/ui equivalents.
 *
 * Status legend:
 * - REPLACE: Has a native design-system equivalent -- migrate away from Ant.
 * - KEEP:    No replacement planned (too complex or niche -- use as-is).
 * - KILL:    Not used anywhere in the codebase -- safe to remove.
 * - BRIDGE:  Thin wrapper over Ant -- will eventually be replaced.
 *
 * Audit date : 2026-03-20
 * Audit scope: /apps/** and /packages/** under the web monorepo.
 *
 * Findings summary:
 *   - 0 files import directly from 'antd' or '@ant-design/*'.
 *   - 3 MFE apps (mfe-reporting, mfe-access, mfe-users) still reference
 *     antd in their webpack ModuleFederation shared config, but antd is
 *     NOT listed in any package.json dependencies.
 *   - The design-system provides native replacements for every common Ant
 *     component. All entries below are therefore classified as REPLACE or
 *     KILL.
 *
 * Next steps:
 *   1. Remove the `antd: { singleton: true, ... }` lines from the three
 *      webpack configs (mfe-reporting, mfe-access, mfe-users -- both
 *      webpack.dev.js and webpack.prod.js).
 *   2. Ensure antd is not in any package.json -- already confirmed clean.
 *   3. Enable the `no-new-ant-import` ESLint rule to prevent regressions.
 */

export type AntExitStatus = "REPLACE" | "KEEP" | "KILL" | "BRIDGE";

export interface AntExitEntry {
  /** Classification status */
  status: AntExitStatus;
  /** Native design-system replacement, if any */
  replacement: string | null;
  /** Additional notes */
  notes: string;
}

export const ANT_EXIT_PLAN: Record<string, AntExitEntry> = {
  // ---- Layout ----
  Layout: {
    status: "KILL",
    replacement: null,
    notes: "Not imported anywhere. Use CSS / Tailwind grid or Stack.",
  },
  Space: {
    status: "REPLACE",
    replacement: "Stack / HStack / VStack",
    notes: "Native Stack primitives cover all spacing use-cases.",
  },
  Divider: {
    status: "REPLACE",
    replacement: "Divider",
    notes: "Native Divider primitive available.",
  },
  Grid: {
    status: "KILL",
    replacement: null,
    notes: "Not imported. Use CSS grid or Tailwind utilities.",
  },

  // ---- General ----
  Button: {
    status: "REPLACE",
    replacement: "Button / IconButton",
    notes: "Native Button and IconButton primitives available.",
  },
  Typography: {
    status: "REPLACE",
    replacement: "Text",
    notes: "Text primitive with variant/size/weight props.",
  },
  Icon: {
    status: "REPLACE",
    replacement: "lucide-react icons",
    notes: "Codebase uses lucide-react for all iconography.",
  },

  // ---- Navigation ----
  Breadcrumb: {
    status: "REPLACE",
    replacement: "Breadcrumb",
    notes: "Native Breadcrumb component available.",
  },
  Menu: {
    status: "REPLACE",
    replacement: "MenuBar / NavigationRail / ContextMenu",
    notes: "Multiple navigation components cover all Menu patterns.",
  },
  Pagination: {
    status: "REPLACE",
    replacement: "Pagination",
    notes: "Native Pagination component available.",
  },
  Steps: {
    status: "REPLACE",
    replacement: "Steps",
    notes: "Native Steps component with full props parity.",
  },
  Tabs: {
    status: "REPLACE",
    replacement: "Tabs",
    notes: "Native Tabs component available.",
  },
  Dropdown: {
    status: "REPLACE",
    replacement: "Dropdown",
    notes: "Native Dropdown primitive available.",
  },

  // ---- Data Entry ----
  AutoComplete: {
    status: "REPLACE",
    replacement: "Combobox",
    notes: "Combobox component handles autocomplete use-cases.",
  },
  Cascader: {
    status: "REPLACE",
    replacement: "Cascader",
    notes: "Native Cascader component available.",
  },
  Checkbox: {
    status: "REPLACE",
    replacement: "Checkbox",
    notes: "Native Checkbox primitive available.",
  },
  ColorPicker: {
    status: "REPLACE",
    replacement: "ColorPicker",
    notes: "Native ColorPicker component available.",
  },
  DatePicker: {
    status: "REPLACE",
    replacement: "DatePicker",
    notes: "Native DatePicker component available.",
  },
  Form: {
    status: "REPLACE",
    replacement: "FormField / AdaptiveForm",
    notes: "FormField for individual fields; AdaptiveForm for dynamic forms.",
  },
  Input: {
    status: "REPLACE",
    replacement: "Input / TextInput / Textarea",
    notes: "Native Input primitives available.",
  },
  InputNumber: {
    status: "REPLACE",
    replacement: "Input (type='number')",
    notes: "Native Input with type prop covers number input.",
  },
  Mentions: {
    status: "REPLACE",
    replacement: "Mentions",
    notes: "Native Mentions component available.",
  },
  Radio: {
    status: "REPLACE",
    replacement: "Radio / RadioGroup",
    notes: "Native Radio primitives available.",
  },
  Rate: {
    status: "REPLACE",
    replacement: "Rating",
    notes: "Native Rating component available.",
  },
  Select: {
    status: "REPLACE",
    replacement: "Select / Combobox",
    notes: "Select for simple cases; Combobox for searchable/multi-select.",
  },
  Slider: {
    status: "REPLACE",
    replacement: "Slider",
    notes: "Native Slider component available.",
  },
  Switch: {
    status: "REPLACE",
    replacement: "Switch",
    notes: "Native Switch primitive available.",
  },
  TimePicker: {
    status: "REPLACE",
    replacement: "TimePicker",
    notes: "Native TimePicker component available.",
  },
  Transfer: {
    status: "REPLACE",
    replacement: "Transfer",
    notes: "Native Transfer component available.",
  },
  TreeSelect: {
    status: "REPLACE",
    replacement: "Tree / Combobox",
    notes: "Combine Tree component with Combobox for tree-select patterns.",
  },
  Upload: {
    status: "REPLACE",
    replacement: "Upload",
    notes: "Native Upload component available.",
  },

  // ---- Data Display ----
  Avatar: {
    status: "REPLACE",
    replacement: "Avatar / AvatarGroup",
    notes: "Native Avatar and AvatarGroup available.",
  },
  Badge: {
    status: "REPLACE",
    replacement: "Badge",
    notes: "Native Badge primitive available.",
  },
  Calendar: {
    status: "REPLACE",
    replacement: "Calendar",
    notes: "Native Calendar component available.",
  },
  Card: {
    status: "REPLACE",
    replacement: "Card / CardHeader / CardBody / CardFooter",
    notes: "Native Card primitive with composable sub-components.",
  },
  Carousel: {
    status: "REPLACE",
    replacement: "Carousel",
    notes: "Native Carousel component available.",
  },
  Collapse: {
    status: "REPLACE",
    replacement: "Accordion",
    notes: "Accordion with multiple selection modes replaces Collapse.",
  },
  Descriptions: {
    status: "REPLACE",
    replacement: "Descriptions",
    notes: "Native Descriptions component available.",
  },
  Empty: {
    status: "REPLACE",
    replacement: "EmptyState / Empty",
    notes: "Native EmptyState component available.",
  },
  Image: {
    status: "KILL",
    replacement: null,
    notes: "Not imported. Use native <img> or Next.js Image.",
  },
  List: {
    status: "REPLACE",
    replacement: "List",
    notes: "Native List component available.",
  },
  Popover: {
    status: "REPLACE",
    replacement: "Popover",
    notes: "Native Popover primitive available.",
  },
  QRCode: {
    status: "REPLACE",
    replacement: "QRCode",
    notes: "Native QRCode component available.",
  },
  Segmented: {
    status: "REPLACE",
    replacement: "Segmented",
    notes: "Native Segmented component available.",
  },
  Statistic: {
    status: "KILL",
    replacement: null,
    notes: "Not imported. Use Text + custom formatting.",
  },
  Table: {
    status: "REPLACE",
    replacement: "TableSimple / TreeTable / AG Grid (advanced)",
    notes: "TableSimple for basic tables; AG Grid for data-heavy views.",
  },
  Tag: {
    status: "REPLACE",
    replacement: "Tag",
    notes: "Native Tag primitive available.",
  },
  Timeline: {
    status: "REPLACE",
    replacement: "Timeline",
    notes: "Native Timeline component available.",
  },
  Tooltip: {
    status: "REPLACE",
    replacement: "Tooltip",
    notes: "Native Tooltip primitive available.",
  },
  Tree: {
    status: "REPLACE",
    replacement: "Tree / TreeTable",
    notes: "Native Tree and TreeTable components available.",
  },

  // ---- Feedback ----
  Alert: {
    status: "REPLACE",
    replacement: "Alert",
    notes: "Native Alert primitive available.",
  },
  Drawer: {
    status: "REPLACE",
    replacement: "Dialog / Modal",
    notes: "Dialog and Modal cover drawer/overlay patterns.",
  },
  Message: {
    status: "REPLACE",
    replacement: "useToast",
    notes: "Toast system replaces Ant message API.",
  },
  Modal: {
    status: "REPLACE",
    replacement: "Modal / Dialog",
    notes: "Native Modal and Dialog primitives available.",
  },
  Notification: {
    status: "REPLACE",
    replacement: "useToast / NotificationDrawer",
    notes: "Toast for ephemeral; NotificationDrawer for persistent.",
  },
  Popconfirm: {
    status: "REPLACE",
    replacement: "Dialog (confirmation variant)",
    notes: "Use Dialog with confirm/cancel pattern.",
  },
  Progress: {
    status: "KILL",
    replacement: null,
    notes: "Not imported. Build with Tailwind or native HTML <progress>.",
  },
  Result: {
    status: "REPLACE",
    replacement: "EmptyErrorLoading",
    notes: "EmptyErrorLoading covers result/error/loading states.",
  },
  Skeleton: {
    status: "REPLACE",
    replacement: "Skeleton",
    notes: "Native Skeleton primitive available.",
  },
  Spin: {
    status: "REPLACE",
    replacement: "Spinner",
    notes: "Native Spinner primitive available.",
  },

  // ---- Other ----
  Anchor: {
    status: "REPLACE",
    replacement: "AnchorToc",
    notes: "Native AnchorToc component available.",
  },
  FloatButton: {
    status: "REPLACE",
    replacement: "FloatButton",
    notes: "Native FloatButton component available.",
  },
  Tour: {
    status: "REPLACE",
    replacement: "TourCoachmarks",
    notes: "Native TourCoachmarks component available.",
  },
  Watermark: {
    status: "REPLACE",
    replacement: "Watermark",
    notes: "Native Watermark component available.",
  },
  Affix: {
    status: "KILL",
    replacement: null,
    notes: "Not imported. Use CSS position: sticky.",
  },
  App: {
    status: "KILL",
    replacement: null,
    notes: "Not imported. Use DesignSystemProvider.",
  },
  ConfigProvider: {
    status: "REPLACE",
    replacement: "DesignSystemProvider / ThemeProvider",
    notes: "Native providers handle theming and locale.",
  },
} as const;

/**
 * Mapping from Ant component name to the native @ats/ui import.
 * Used by the `no-new-ant-import` ESLint rule to suggest replacements.
 */
export const ANT_TO_NATIVE: Record<string, string> = Object.fromEntries(
  Object.entries(ANT_EXIT_PLAN)
    .filter(([, v]) => v.status === "REPLACE" && v.replacement !== null)
    .map(([k, v]) => [k, v.replacement as string]),
);
