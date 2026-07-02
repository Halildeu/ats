/* ------------------------------------------------------------------ */
/*  Primitives — Core building blocks                                  */
/*                                                                     */
/*  Single-element wrappers with zero internal cross-dependencies.     */
/*  Every component in the design system is built on these.            */
/* ------------------------------------------------------------------ */

/* Composition */
export { Slot } from "./_shared/Slot";
export type { SlotProps } from "./_shared/Slot";

/* Layout */
export { Stack, HStack, VStack } from "./stack";
export type { StackProps, HStackProps, VStackProps, StackDirection, StackAlign, StackJustify, StackGap } from "./stack";
export { Grid } from "./grid";
export type { GridProps, GridColProps, GridColumns, GridGutter, GridAlign, GridJustify, ResponsiveValue } from "./grid";
export { Container } from "./container";
export type { ContainerProps, ContainerMaxWidth } from "./container";
export { Flex } from "./flex";
export type { FlexProps, FlexDirection, FlexAlign, FlexJustify, FlexWrap, FlexGap } from "./flex";
export { Card, CardHeader, CardBody, CardFooter } from "./card";
export type { CardProps, CardVariant, CardPadding, CardHeaderProps } from "./card";
export { Divider } from "./divider";
export type { DividerProps } from "./divider";

/* Typography */
export { Text } from "./text";
export type { TextProps, TextVariant, TextSize, TextWeight } from "./text";

/* Buttons */
export { Button } from "./button";
export type { ButtonProps, ButtonVariant, ButtonSize } from "./button";
export { IconButton } from "./icon-button";
export type { IconButtonProps, IconButtonVariant, IconButtonSize } from "./icon-button";

/* Form Controls */
export { Input, TextInput, Textarea, TextArea } from "./input";
export type { InputProps, InputSize, TextareaProps, TextAreaResize } from "./input";
export { Select } from "./select";
export type { SelectProps, SelectOption, SelectSize } from "./select";
export { Switch } from "./switch";
export type { SwitchProps, SwitchSize } from "./switch";
export { Checkbox } from "./checkbox";
export type { CheckboxProps, CheckboxSize } from "./checkbox";
export { Radio, RadioGroup } from "./radio";
export type { RadioProps, RadioSize, RadioGroupProps } from "./radio";

/* Links */
export { LinkInline } from "./link-inline";
export type { LinkInlineProps, LinkInlineTone, LinkInlineUnderline } from "./link-inline";

/* Data Display */
export { Badge } from "./badge";
export type { BadgeProps, BadgeVariant, BadgeSize } from "./badge";
export { Tag } from "./tag";
export type { TagProps, TagVariant, TagSize } from "./tag";
export { Avatar } from "./avatar";
export type { AvatarProps, AvatarSize, AvatarShape } from "./avatar";

/* Feedback */
export { Spinner } from "./spinner";
export type { SpinnerProps, SpinnerSize } from "./spinner";
export { Skeleton } from "./skeleton";
export type { SkeletonProps } from "./skeleton";
export { Alert } from "./alert";
export type { AlertProps, AlertVariant } from "./alert";

/* Overlays */
export { Dialog } from "./dialog";
export type { DialogProps, DialogSize } from "./dialog";
export { Modal } from "./modal";
export type { ModalProps, ModalClasses, OverlayCloseReason } from "./modal";
export { Tooltip } from "./tooltip";
export type { TooltipProps, TooltipPlacement } from "./tooltip";
export { Popover } from "./popover";
export type { PopoverProps, PopoverTriggerMode, PopoverSide, PopoverAlign } from "./popover";
export { Dropdown } from "./dropdown";
export type {
  DropdownProps,
  DropdownItem,
  DropdownSeparator,
  DropdownLabel,
  DropdownEntry,
  DropdownPlacement,
} from "./dropdown";
export { Drawer } from "./drawer";
export type { DrawerProps, DrawerPlacement, DrawerSize } from "./drawer";

/* Progress & Feedback */
export { Progress } from "./progress";
export type { ProgressProps, ProgressType, ProgressStatus, ProgressSize } from "./progress";
export { Statistic } from "./statistic";
export type { StatisticProps, StatisticCountdownProps, StatisticSize, StatisticTrend } from "./statistic";
export { Image } from "./image";
export type { ImageProps, ImageGroupProps, ImagePreviewConfig, ImageRounded, ImageObjectFit } from "./image";

/* Status */
export { StatusIndicator } from "./status-indicator";
export type { StatusIndicatorProps, StatusIndicatorStatus, StatusIndicatorSize } from "./status-indicator";

/* Layout */
export { HeaderBar } from "./header-bar";
export type { HeaderBarProps } from "./header-bar";

/* Actions — Browser */
export { FullscreenToggle } from "./fullscreen-toggle";
export type { FullscreenToggleProps, FullscreenToggleSize, FullscreenToggleVariant } from "./fullscreen-toggle";
export { CommandPaletteTrigger } from "./command-palette-trigger";
export type { CommandPaletteTriggerProps } from "./command-palette-trigger";

/* Overlay */
export { HoverDescription } from "./hover-description";
export type { HoverDescriptionProps } from "./hover-description";
