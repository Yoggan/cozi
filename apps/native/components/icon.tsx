import type { Icon as PhosphorIcon, IconProps, IconWeight } from "phosphor-react-native";
import type { ColorValue } from "react-native";
// Per-icon paths: Metro doesn't tree-shake, so the package root would bundle every icon.
import { ArrowClockwiseIcon } from "phosphor-react-native/src/icons/ArrowClockwise";
import { ArrowDownIcon } from "phosphor-react-native/src/icons/ArrowDown";
import { ArrowLeftIcon } from "phosphor-react-native/src/icons/ArrowLeft";
import { ArrowRightIcon } from "phosphor-react-native/src/icons/ArrowRight";
import { ArrowsClockwiseIcon } from "phosphor-react-native/src/icons/ArrowsClockwise";
import { ArrowsLeftRightIcon } from "phosphor-react-native/src/icons/ArrowsLeftRight";
import { ArrowUpIcon } from "phosphor-react-native/src/icons/ArrowUp";
import { AtIcon } from "phosphor-react-native/src/icons/At";
import { BackspaceIcon } from "phosphor-react-native/src/icons/Backspace";
import { BookmarkSimpleIcon } from "phosphor-react-native/src/icons/BookmarkSimple";
import { BuildingsIcon } from "phosphor-react-native/src/icons/Buildings";
import { CameraIcon } from "phosphor-react-native/src/icons/Camera";
import { CaretLeftIcon } from "phosphor-react-native/src/icons/CaretLeft";
import { CaretRightIcon } from "phosphor-react-native/src/icons/CaretRight";
import { ChatCircleIcon } from "phosphor-react-native/src/icons/ChatCircle";
import { ChatCircleTextIcon } from "phosphor-react-native/src/icons/ChatCircleText";
import { CheckIcon } from "phosphor-react-native/src/icons/Check";
import { CheckCircleIcon } from "phosphor-react-native/src/icons/CheckCircle";
import { CircleIcon } from "phosphor-react-native/src/icons/Circle";
import { CircleHalfIcon } from "phosphor-react-native/src/icons/CircleHalf";
import { ClockIcon } from "phosphor-react-native/src/icons/Clock";
import { CopyIcon } from "phosphor-react-native/src/icons/Copy";
import { CreditCardIcon } from "phosphor-react-native/src/icons/CreditCard";
import { CubeIcon } from "phosphor-react-native/src/icons/Cube";
import { DotsNineIcon } from "phosphor-react-native/src/icons/DotsNine";
import { EnvelopeSimpleIcon } from "phosphor-react-native/src/icons/EnvelopeSimple";
import { ExportIcon } from "phosphor-react-native/src/icons/Export";
import { EyeIcon } from "phosphor-react-native/src/icons/Eye";
import { EyeSlashIcon } from "phosphor-react-native/src/icons/EyeSlash";
import { FingerprintIcon } from "phosphor-react-native/src/icons/Fingerprint";
import { GearSixIcon } from "phosphor-react-native/src/icons/GearSix";
import { HeartIcon } from "phosphor-react-native/src/icons/Heart";
import { HourglassIcon } from "phosphor-react-native/src/icons/Hourglass";
import { ImageIcon } from "phosphor-react-native/src/icons/Image";
import { ImagesIcon } from "phosphor-react-native/src/icons/Images";
import { InfoIcon } from "phosphor-react-native/src/icons/Info";
import { LockSimpleIcon } from "phosphor-react-native/src/icons/LockSimple";
import { MinusIcon } from "phosphor-react-native/src/icons/Minus";
import { MoonIcon } from "phosphor-react-native/src/icons/Moon";
import { PaletteIcon } from "phosphor-react-native/src/icons/Palette";
import { PaperPlaneRightIcon } from "phosphor-react-native/src/icons/PaperPlaneRight";
import { PencilSimpleIcon } from "phosphor-react-native/src/icons/PencilSimple";
import { PlusIcon } from "phosphor-react-native/src/icons/Plus";
import { PlusCircleIcon } from "phosphor-react-native/src/icons/PlusCircle";
import { QrCodeIcon } from "phosphor-react-native/src/icons/QrCode";
import { ReceiptIcon } from "phosphor-react-native/src/icons/Receipt";
import { ScanIcon } from "phosphor-react-native/src/icons/Scan";
import { ShieldIcon } from "phosphor-react-native/src/icons/Shield";
import { ShieldCheckIcon } from "phosphor-react-native/src/icons/ShieldCheck";
import { SignOutIcon } from "phosphor-react-native/src/icons/SignOut";
import { StorefrontIcon } from "phosphor-react-native/src/icons/Storefront";
import { SunIcon } from "phosphor-react-native/src/icons/Sun";
import { TagIcon } from "phosphor-react-native/src/icons/Tag";
import { TrashIcon } from "phosphor-react-native/src/icons/Trash";
import { UserIcon } from "phosphor-react-native/src/icons/User";
import { UserCircleIcon } from "phosphor-react-native/src/icons/UserCircle";
import { UserPlusIcon } from "phosphor-react-native/src/icons/UserPlus";
import { UsersIcon } from "phosphor-react-native/src/icons/Users";
import { WalletIcon } from "phosphor-react-native/src/icons/Wallet";
import { WarningIcon } from "phosphor-react-native/src/icons/Warning";
import { WarningCircleIcon } from "phosphor-react-native/src/icons/WarningCircle";
import { XIcon } from "phosphor-react-native/src/icons/X";
import { XCircleIcon } from "phosphor-react-native/src/icons/XCircle";

// Keys keep the former Ionicons names so call sites and the `name` unions stayed as they were.
// Filled Ionicons shapes map to Phosphor "fill"; "-outline" and line glyphs map to "regular".
const ICONS = {
  add: [PlusIcon, "regular"],
  "add-circle-outline": [PlusCircleIcon, "regular"],
  "alert-circle": [WarningCircleIcon, "fill"],
  "alert-circle-outline": [WarningCircleIcon, "regular"],
  "arrow-back": [ArrowLeftIcon, "regular"],
  "arrow-down": [ArrowDownIcon, "regular"],
  "arrow-forward": [ArrowRightIcon, "regular"],
  "arrow-up": [ArrowUpIcon, "regular"],
  at: [AtIcon, "regular"],
  "backspace-outline": [BackspaceIcon, "regular"],
  bookmark: [BookmarkSimpleIcon, "fill"],
  "bookmark-outline": [BookmarkSimpleIcon, "regular"],
  business: [BuildingsIcon, "fill"],
  "business-outline": [BuildingsIcon, "regular"],
  camera: [CameraIcon, "fill"],
  "card-outline": [CreditCardIcon, "regular"],
  "chatbubble-outline": [ChatCircleIcon, "regular"],
  chatbubbles: [ChatCircleTextIcon, "fill"],
  "chatbubbles-outline": [ChatCircleTextIcon, "regular"],
  checkmark: [CheckIcon, "regular"],
  "checkmark-circle": [CheckCircleIcon, "fill"],
  "chevron-back": [CaretLeftIcon, "regular"],
  "chevron-forward": [CaretRightIcon, "regular"],
  close: [XIcon, "regular"],
  "close-circle": [XCircleIcon, "fill"],
  "color-palette": [PaletteIcon, "fill"],
  contrast: [CircleHalfIcon, "fill"],
  "copy-outline": [CopyIcon, "regular"],
  "create-outline": [PencilSimpleIcon, "regular"],
  "cube-outline": [CubeIcon, "regular"],
  "ellipse-outline": [CircleIcon, "regular"],
  "eye-off-outline": [EyeSlashIcon, "regular"],
  "eye-outline": [EyeIcon, "regular"],
  "finger-print-outline": [FingerprintIcon, "regular"],
  "heart-outline": [HeartIcon, "regular"],
  "hourglass-outline": [HourglassIcon, "regular"],
  image: [ImageIcon, "fill"],
  "image-outline": [ImageIcon, "regular"],
  images: [ImagesIcon, "fill"],
  "information-circle-outline": [InfoIcon, "regular"],
  "keypad-outline": [DotsNineIcon, "regular"],
  "lock-closed-outline": [LockSimpleIcon, "regular"],
  "log-out-outline": [SignOutIcon, "regular"],
  "mail-outline": [EnvelopeSimpleIcon, "regular"],
  moon: [MoonIcon, "fill"],
  people: [UsersIcon, "fill"],
  "people-outline": [UsersIcon, "regular"],
  "person-add-outline": [UserPlusIcon, "regular"],
  "person-circle-outline": [UserCircleIcon, "regular"],
  "person-outline": [UserIcon, "regular"],
  "pricetag-outline": [TagIcon, "regular"],
  pricetags: [TagIcon, "fill"],
  "pricetags-outline": [TagIcon, "regular"],
  "qr-code-outline": [QrCodeIcon, "regular"],
  receipt: [ReceiptIcon, "fill"],
  "receipt-outline": [ReceiptIcon, "regular"],
  refresh: [ArrowClockwiseIcon, "regular"],
  remove: [MinusIcon, "regular"],
  "scan-outline": [ScanIcon, "regular"],
  send: [PaperPlaneRightIcon, "fill"],
  "settings-outline": [GearSixIcon, "regular"],
  "share-outline": [ExportIcon, "regular"],
  "shield-checkmark": [ShieldCheckIcon, "fill"],
  "shield-checkmark-outline": [ShieldCheckIcon, "regular"],
  "shield-outline": [ShieldIcon, "regular"],
  storefront: [StorefrontIcon, "fill"],
  "storefront-outline": [StorefrontIcon, "regular"],
  sunny: [SunIcon, "fill"],
  "swap-horizontal": [ArrowsLeftRightIcon, "regular"],
  sync: [ArrowsClockwiseIcon, "regular"],
  time: [ClockIcon, "fill"],
  "time-outline": [ClockIcon, "regular"],
  "trash-outline": [TrashIcon, "regular"],
  wallet: [WalletIcon, "fill"],
  "wallet-outline": [WalletIcon, "regular"],
  warning: [WarningIcon, "fill"],
  "warning-outline": [WarningIcon, "regular"],
} satisfies Record<string, [PhosphorIcon, IconWeight]>;

export type IconName = keyof typeof ICONS;

export function Icon({
  name,
  color,
  ...props
}: Omit<IconProps, "weight" | "color"> & { name: IconName; color?: ColorValue }) {
  const [Component, weight] = ICONS[name];

  // SVG fills need a plain string; PlatformColor values fall back to Phosphor's default.
  return (
    <Component weight={weight} color={typeof color === "string" ? color : undefined} {...props} />
  );
}
