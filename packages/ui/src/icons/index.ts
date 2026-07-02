/* ------------------------------------------------------------------ */
/*  @ats/ui/icons — Tree-shakeable icon system              */
/*                                                                     */
/*  Each icon is an individual named export for optimal tree shaking.  */
/*  Icons are pure SVG React components — no runtime dependencies.     */
/*                                                                     */
/*  Usage:                                                             */
/*    import { IconCheck, IconClose } from '@ats/ui/icons'; */
/*    <IconCheck size={20} className="text-state-success-text" />               */
/* ------------------------------------------------------------------ */

export { Icon } from './Icon';
export type { IconProps, IconName } from './Icon';

// ---- Action Icons ----
export { IconCheck } from './action/IconCheck';
export { IconClose } from './action/IconClose';
export { IconPlus } from './action/IconPlus';
export { IconMinus } from './action/IconMinus';
export { IconEdit } from './action/IconEdit';
export { IconDelete } from './action/IconDelete';
export { IconSearch } from './action/IconSearch';
export { IconFilter } from './action/IconFilter';
export { IconRefresh } from './action/IconRefresh';
export { IconDownload } from './action/IconDownload';
export { IconUpload } from './action/IconUpload';
export { IconCopy } from './action/IconCopy';
export { IconSave } from './action/IconSave';
export { IconUndo } from './action/IconUndo';
export { IconRedo } from './action/IconRedo';

// ---- Navigation Icons ----
export { IconChevronDown } from './navigation/IconChevronDown';
export { IconChevronUp } from './navigation/IconChevronUp';
export { IconChevronLeft } from './navigation/IconChevronLeft';
export { IconChevronRight } from './navigation/IconChevronRight';
export { IconArrowLeft } from './navigation/IconArrowLeft';
export { IconArrowRight } from './navigation/IconArrowRight';
export { IconMenu } from './navigation/IconMenu';
export { IconHome } from './navigation/IconHome';
export { IconExternalLink } from './navigation/IconExternalLink';

// ---- Status Icons ----
export { IconInfo } from './status/IconInfo';
export { IconWarning } from './status/IconWarning';
export { IconError } from './status/IconError';
export { IconSuccess } from './status/IconSuccess';
export { IconLoading } from './status/IconLoading';

// ---- Communication Icons ----
export { IconBell } from './communication/IconBell';
export { IconMail } from './communication/IconMail';
export { IconChat } from './communication/IconChat';

// ---- Data Icons ----
export { IconCalendar } from './data/IconCalendar';
export { IconClock } from './data/IconClock';
export { IconChart } from './data/IconChart';
export { IconTable } from './data/IconTable';
export { IconFile } from './data/IconFile';
export { IconFolder } from './data/IconFolder';

// ---- User Icons ----
export { IconUser } from './user/IconUser';
export { IconUsers } from './user/IconUsers';
export { IconSettings } from './user/IconSettings';
export { IconLogout } from './user/IconLogout';
export { IconLock } from './user/IconLock';
export { IconShield } from './user/IconShield';

// ---- UI Icons ----
export { IconEye } from './ui/IconEye';
export { IconEyeOff } from './ui/IconEyeOff';
export { IconGrip } from './ui/IconGrip';
export { IconMaximize } from './ui/IconMaximize';
export { IconMinimize } from './ui/IconMinimize';
export { IconStar } from './ui/IconStar';
export { IconHeart } from './ui/IconHeart';
export { IconPin } from './ui/IconPin';
