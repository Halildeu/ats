/* ------------------------------------------------------------------ */
/*  Headless Hooks — Barrel export                                     */
/*                                                                     */
/*  State management hooks without styling. Pure logic + ARIA.         */
/* ------------------------------------------------------------------ */

export { useAccordion } from "./useAccordion";
export type {
  UseAccordionOptions,
  AccordionTriggerProps,
  AccordionPanelProps,
  AccordionItemState,
  UseAccordionReturn,
} from "./useAccordion";

export { useCombobox } from "./useCombobox";
export type {
  ComboboxItem,
  UseComboboxOptions,
  ComboboxInputProps,
  ComboboxListboxProps,
  ComboboxOptionProps,
  UseComboboxReturn,
} from "./useCombobox";

export { useDialog } from "./useDialog";
export type {
  UseDialogOptions,
  DialogTriggerProps,
  DialogContentProps,
  DialogTitleProps,
  DialogDescriptionProps,
  UseDialogReturn,
} from "./useDialog";

export { useMenu } from "./useMenu";
export type {
  MenuItem,
  UseMenuOptions,
  MenuTriggerProps,
  MenuListProps,
  MenuItemProps,
  UseMenuReturn,
} from "./useMenu";

export { useSelect } from "./useSelect";
export type {
  SelectItem,
  UseSelectOptions,
  SelectTriggerProps,
  SelectListboxProps,
  SelectOptionProps,
  UseSelectReturn,
} from "./useSelect";

export { useSlider } from "./useSlider";
export type {
  UseSliderOptions,
  SliderTrackProps,
  SliderThumbProps,
  UseSliderReturn,
} from "./useSlider";

export { useTabs } from "./useTabs";
export type {
  TabItem,
  UseTabsOptions,
  TabListProps,
  TabProps,
  TabPanelProps,
  UseTabsReturn,
} from "./useTabs";

export { useTooltip } from "./useTooltip";
export type {
  UseTooltipOptions,
  TooltipTriggerProps,
  TooltipContentProps,
  UseTooltipReturn,
} from "./useTooltip";
