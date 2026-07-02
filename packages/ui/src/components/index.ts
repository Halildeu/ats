/* ------------------------------------------------------------------ */
/*  Components — 2+ primitive compositions, still domain-agnostic      */
/*                                                                     */
/*  Examples: Tabs, Accordion, Breadcrumb, Toast, FormField, etc.      */
/* ------------------------------------------------------------------ */

/* Sidebar */
export { AppSidebar, useSidebar } from './app-sidebar';
export type {
  AppSidebarProps,
  AppSidebarHeaderProps,
  AppSidebarNavProps,
  AppSidebarNavItemProps,
  AppSidebarSectionProps,
  AppSidebarFooterProps,
  AppSidebarSearchProps,
  SidebarMode,
  SidebarContextValue,
} from './app-sidebar';

/* Navigation */
export { Tabs } from './tabs';
export type { TabsProps, TabItem, TabsVariant, TabsSize } from './tabs';
export { Breadcrumb } from './breadcrumb';
export type { BreadcrumbProps, BreadcrumbItem } from './breadcrumb';
export { Pagination } from './pagination';
export type { PaginationProps, PaginationSize } from './pagination';
export { Steps } from './steps';
export type { StepsProps, StepItem, StepsSize, StepsDirection } from './steps';
export { Timeline } from './timeline';
export type {
  TimelineProps,
  TimelineItemProps,
  TimelineColor,
  TimelineMode,
  TimelineSize,
} from './timeline';

/* Disclosure */
export { Accordion, createAccordionItemsFromSections, createAccordionPreset } from './accordion';
export type {
  AccordionProps,
  AccordionItem,
  AccordionClasses,
  AccordionPreset,
  AccordionSelectionMode,
  AccordionSize,
  AccordionExpandIconPosition,
  AccordionCollapsible,
  AccordionPresetKind,
  AccordionSectionInput,
  CreateAccordionItemsFromSectionsOptions,
} from './accordion';

/* Form */
export { FormField } from './form-field';
export type { FormFieldProps } from './form-field';
export { SearchInput } from './search-input';
export type { SearchInputProps, SearchInputSize } from './search-input';

/* Feedback */
export { ToastProvider, useToast } from './toast';
export type {
  ToastProviderProps,
  ToastData,
  ToastVariant,
  ToastPosition,
  ToastOptions,
} from './toast';
export { EmptyState, EmptyState as Empty } from './empty-state';
export type { EmptyStateProps } from './empty-state';

/* Selection */
export { Segmented, resolveSegmentedNextValue, createSegmentedPreset } from './segmented';
export type { SegmentedProps, SegmentedItem, SegmentedClasses, SegmentedPreset } from './segmented';

/* Menus */
export { ContextMenu } from './context-menu';
export type {
  ContextMenuProps,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuLabel,
  ContextMenuEntry,
} from './context-menu';

/* MenuBar */
export {
  MenuBar,
  createMenuBarItemsFromRoutes,
  createMenuBarPreset,
  resolveMenuBarActiveValue,
} from './menu-bar';
export type {
  MenuBarProps,
  MenuBarItem,
  MenuBarMenuItem,
  MenuBarRouteInput,
  MenuBarClasses,
  MenuBarPreset,
  MenuBarSize,
  MenuBarAppearance,
  MenuBarLabelVisibility,
  MenuBarOverflowBehavior,
  MenuBarSubmenuTrigger,
  MenuBarUtilityCollapse,
  MenuBarMobileFallback,
  MenuBarPresetKind,
  MenuBarItemGroup,
  MenuBarItemEmphasis,
  CreateMenuBarItemsOptions,
  ResolveMenuBarActiveValueArgs,
} from './menu-bar';

/* NavigationRail */
export {
  NavigationRail,
  resolveNavigationRailActiveValue,
  createNavigationDestinationItems,
  createNavigationRailPreset,
} from './navigation-rail';
export type {
  NavigationRailProps,
  NavigationRailItem,
  NavigationRailClasses,
  NavigationRailPreset,
  NavigationRailSize,
  NavigationRailAppearance,
  NavigationRailLabelVisibility,
  NavigationRailAlignment,
  NavigationRailPresetKind,
  NavigationDestinationInput,
  CreateNavigationDestinationItemsOptions,
  ResolveNavigationRailActiveValueArgs,
} from './navigation-rail';

/* Notification */
export { NotificationDrawer } from './notification-drawer';
export type { NotificationDrawerProps } from './notification-drawer';
export { NotificationPanel } from './notification-drawer';
export type {
  NotificationPanelProps,
  NotificationPanelFilter,
  NotificationPanelGrouping,
  NotificationPanelDateGrouping,
} from './notification-drawer';
export { NotificationItemCard } from './notification-drawer';
export type {
  NotificationItemCardProps,
  NotificationSurfaceItem,
  NotificationItemType,
  NotificationItemPriority,
} from './notification-drawer';

/* Data Display */
export { Descriptions } from './descriptions';
export type { DescriptionsProps, DescriptionsItem } from './descriptions';
export { TableSimple } from './table-simple';
export type {
  TableSimpleProps,
  TableSimpleColumn,
  TableSimpleDensity,
  TableSimpleAlign,
  TableSimpleLocaleText,
} from './table-simple';

/* Theme */
export { ThemePreviewCard } from './theme-preview-card';
export type { ThemePreviewCardProps } from './theme-preview-card';
export { ThemePresetCompare } from './theme-preset';
export type { ThemePresetCompareProps } from './theme-preset';
export { ThemePresetGallery } from './theme-preset';
export type { ThemePresetGalleryProps, ThemePresetGalleryItem } from './theme-preset';

/* Tour */
export { TourCoachmarks } from './tour-coachmarks';
export type { TourCoachmarksProps, TourCoachmarkStep } from './tour-coachmarks';

/* Error Boundary */
export { ErrorBoundary } from './error-boundary/ErrorBoundary';
export type { ErrorBoundaryProps, ErrorBoundaryFallback } from './error-boundary/ErrorBoundary';

/* State Recipes */
export { EmptyErrorLoading } from './empty-error-loading';
export type { EmptyErrorLoadingProps, EmptyErrorLoadingMode } from './empty-error-loading';

/* Advanced Inputs */
export { Slider } from './slider';
export type { SliderProps } from './slider';
export { Rating } from './rating';
export type { RatingProps, RatingSize } from './rating';
export { DatePicker } from './date-picker';
export type { DatePickerProps, DatePickerMessages } from './date-picker';
export { Calendar } from './calendar';
export type {
  CalendarProps,
  CalendarEvent,
  CalendarLocaleText,
  CalendarMode,
  CalendarSize,
} from './calendar';
export { TimePicker } from './time-picker';
export type { TimePickerProps, TimePickerMessages } from './time-picker';
export { Upload } from './upload';
export type { UploadProps, UploadFileItem } from './upload';
export { Combobox } from './combobox';
export type {
  ComboboxProps,
  ComboboxOption,
  ComboboxOptionGroup,
  ComboboxResolvedOption,
  ComboboxSelectionMode,
  ComboboxDisabledItemFocusPolicy,
  ComboboxPopupSide,
  ComboboxPopupAlign,
  ComboboxPopupStrategy,
  ComboboxRenderOptionState,
} from './combobox';
export { InputNumber } from './input-number';
export type { InputNumberProps } from './input-number';
export { Autocomplete } from './autocomplete';
export type { AutocompleteProps, AutocompleteOption } from './autocomplete';
export { DetailSectionTabs } from './detail-section-tabs';
export type { DetailSectionTabsProps, DetailSectionTabItem } from './detail-section-tabs';

/* Data Structures */
export { List } from './list';
export type { ListProps, ListItem, ListDensity, ListTone } from './list';
export { Transfer } from './transfer';
export type {
  TransferProps,
  TransferItem,
  TransferDirection,
  TransferLocaleText,
  TransferSize,
} from './transfer';
export { Tree } from './tree';
export type { TreeProps, TreeNode, TreeDensity, TreeTone, TreeLocaleText } from './tree';
export { TreeTable } from './tree-table';
export type {
  TreeTableProps,
  TreeTableNode,
  TreeTableColumn,
  TreeTableDensity,
  TreeTableAlign,
  TreeTableTone,
  TreeTableLocaleText,
} from './tree-table';
export { JsonViewer } from './json-viewer';
export type { JsonViewerProps } from './json-viewer';

/* Search & Filter */
export { SearchFilterListing } from './search-filter-listing';
export type { SearchFilterListingProps } from './search-filter-listing';
export { CommandPalette } from './command-palette';
export type { CommandPaletteProps, CommandPaletteItem } from './command-palette';
export { AnchorToc } from './anchor-toc';
export type { AnchorTocProps, AnchorTocItem, AnchorTocDensity } from './anchor-toc';

/* AI / Domain */
export { ConfidenceBadge } from './confidence-badge';
export type { ConfidenceBadgeProps, ConfidenceLevel } from './confidence-badge';
export { PromptComposer } from './prompt-composer';
export type {
  PromptComposerProps,
  PromptComposerScope,
  PromptComposerTone,
} from './prompt-composer';
export { RecommendationCard } from './recommendation-card';
export type { RecommendationCardProps, RecommendationCardTone } from './recommendation-card';
export { ApprovalCheckpoint } from './approval-checkpoint';
export type {
  ApprovalCheckpointProps,
  ApprovalCheckpointItem,
  ApprovalCheckpointStatus,
  ApprovalCheckpointItemStatus,
  ApprovalCheckpointDensity,
} from './approval-checkpoint';
export { ApprovalReview } from './approval-review';
export type { ApprovalReviewProps } from './approval-review';

/* Approval foundation detail surfaces (PR-3, wave_12_approval_foundation) */
export { ApprovalCaseView } from './approval-case-view';
export type { ApprovalCaseViewProps, ApprovalCaseViewDiff } from './approval-case-view';
export { DecisionRecordPanel } from './decision-record-panel';
export type {
  DecisionRecordPanelProps,
  DecisionRecordPanelExportPayload,
} from './decision-record-panel';

/* Approval foundation submission + inbox (PR-2, wave_12_approval_foundation) */
export { ApprovalRequestForm } from './approval-request-form';
export type {
  ApprovalRequestFormProps,
  ApprovalRequestDraft,
  ApprovalRequestType,
} from './approval-request-form';
export { ApprovalInbox } from './approval-inbox';
export type {
  ApprovalInboxProps,
  ApprovalInboxFilters,
  ApprovalInboxBulkPayload,
} from './approval-inbox';

/* Approval foundation primitives (PR-1, wave_12_approval_foundation) */
export { AssigneePicker } from './assignee-picker';
export type {
  AssigneePickerProps,
  AssigneePickerSingleProps,
  AssigneePickerMultiProps,
  AssigneePickerSize,
} from './assignee-picker';
export { DecisionActionDialog } from './decision-action-dialog';
export type {
  DecisionActionDialogProps,
  DecisionActionDialogRequestSummary,
  DecisionActionPresetReason,
  DecisionActionConfirmPayload,
} from './decision-action-dialog';
export { ApprovalEligibilityGuard } from './approval-eligibility-guard';
export type {
  ApprovalEligibilityGuardProps,
  ApprovalEligibilityGuardVariant,
  ApprovalEligibilityGuardBlockedInfo,
} from './approval-eligibility-guard';
export { AIGuidedAuthoring } from './ai-guided-authoring';
export type {
  AIGuidedAuthoringProps,
  AIGuidedAuthoringRecommendation,
} from './ai-guided-authoring';
export { CitationPanel } from './citation-panel';
export type { CitationPanelProps, CitationPanelItem, CitationKind } from './citation-panel';
export { AIActionAuditTimeline } from './ai-action-audit-timeline';
export type {
  AIActionAuditTimelineProps,
  AIActionAuditTimelineItem,
  AIActionAuditActor,
  AIActionAuditStatus,
} from './ai-action-audit-timeline';

/* Charts */

/* Float Button */
export { FloatButton } from './float-button';
export type {
  FloatButtonProps,
  FloatButtonShape,
  FloatButtonSize,
  FloatButtonPosition,
  FloatButtonTrigger,
  FloatButtonGroupItem,
} from './float-button';

/* Color Picker */
export { ColorPicker } from './color-picker';
export type {
  ColorPickerProps,
  ColorPickerFormat,
  ColorPickerSize,
  ColorPickerPreset,
} from './color-picker';

/* Cascader */
export { Cascader } from './cascader';
export type { CascaderProps, CascaderOption } from './cascader';

/* Watermark */
export { Watermark } from './watermark';
export type { WatermarkProps } from './watermark';

/* QR Code */
export { QRCode } from './qr-code';
export type { QRCodeProps, QRErrorLevel } from './qr-code';

/* Carousel */
export { Carousel } from './carousel';
export type { CarouselProps } from './carousel';

/* Avatar Group */
export { AvatarGroup } from './avatar-group';
export type {
  AvatarGroupProps,
  AvatarGroupItem,
  AvatarGroupSize,
  AvatarGroupShape,
  AvatarGroupSpacing,
} from './avatar-group';

/* Mentions */
export { Mentions } from './mentions';
export type { MentionsProps, MentionOption } from './mentions';

/* Generative UI / Adaptive Interface */
export { AILayoutBuilder } from './ai-layout-builder';
export type {
  AILayoutBuilderProps,
  LayoutBlock,
  LayoutIntent,
  LayoutDensity,
} from './ai-layout-builder';
export { AdaptiveForm } from './adaptive-form';
export type {
  AdaptiveFormProps,
  FormField as AdaptiveFormField,
  FormFieldOption,
  FormFieldValidation,
  FormFieldDependency,
  FormLayout,
  FormSize,
} from './adaptive-form';
export { SmartDashboard } from './smart-dashboard';
export type {
  SmartDashboardProps,
  DashboardWidget,
  DashboardDensity,
  WidgetType,
  WidgetTone,
  WidgetSize,
  WidgetTrend,
  TrendDirection,
} from './smart-dashboard';

/* Tree Select */
export { TreeSelect } from './tree-select';
export type { TreeSelectProps, TreeSelectNode, TreeSelectSize } from './tree-select';

/* Speed Dial */
export { SpeedDial } from './speed-dial';
export type { SpeedDialProps, SpeedDialAction, SpeedDialDirection } from './speed-dial';

/* Bottom Navigation */
export { BottomNavigation } from './bottom-navigation';
export type { BottomNavigationProps, BottomNavigationItemProps } from './bottom-navigation';

/* Grouped Card Gallery */
export {
  GroupedCardGallery,
  GallerySearchBar,
  GalleryGroup,
  GalleryCard,
} from './grouped-card-gallery';
export type {
  GroupedCardGalleryProps,
  GalleryItem,
  GalleryColumns,
  GallerySearchBarProps,
  GalleryGroupProps,
  GalleryCardProps,
} from './grouped-card-gallery';

/* Phase 3 (2026-05-14) — adopted from enterprise/ to generic DS surface */
export { ComparisonTable } from './comparison-table';
export { DateRangePicker } from './date-range-picker';
export { InlineEdit } from './inline-edit';
export { DataExportDialog } from './data-export-dialog';
