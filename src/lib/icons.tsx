import * as React from 'react'
import * as L from 'lucide-react'
import type { LucideIcon, LucideProps } from 'lucide-react'

// The one icon source (docs/DESIGN_SYSTEM.md, Iconography).
//
// Every icon in the product ships through this module, wrapped once with the
// three decisions that make ~660 call sites read as one engineered family
// instead of a kit of parts:
//
// 1. CONSTANT PHYSICAL STROKE. `absoluteStrokeWidth` with a 1.75px default,
//    so a 12px glyph and a 24px glyph carry the same stroke weight — the
//    match for Archivo's line weight and the DrawnCheck mark. Without it,
//    lucide scales stroke with size: small icons render chunky, large ones
//    heavy, which is precisely the assembled-from-parts look. A call site
//    passing `strokeWidth` still wins, and it is absolute too (the nav's
//    2.25 active weight rides this).
// 2. A SNAPPED SIZE SCALE. Twenty ad-hoc pixel sizes (9–84) collapse onto
//    12 / 14 / 16 / 20 / 24 / 32 (larger sizes pass through) — a ±3px nudge
//    at worst, and the whole app lands on one rhythm without touching the
//    call sites.
// 3. ONE IMPORT PATH. `scripts/check-icons.mts` fails any direct
//    'lucide-react' import outside this file, so the wrapper cannot be
//    silently bypassed. New icons: add one line to the list below.
//
// Identity marks are NOT icons and stay hand-drawn: Logomark, AgentAvatar,
// DrawnCheck.

export type { LucideIcon, LucideProps }

/** The house stroke: constant physical width at every size. */
export const ICON_STROKE = 1.75

const STEPS: ReadonlyArray<readonly [number, number]> = [
  [12, 12], [15, 14], [18, 16], [22, 20], [26, 24], [34, 32],
]

function snap(size: LucideProps['size']): LucideProps['size'] {
  if (typeof size !== 'number') return size
  for (const [max, to] of STEPS) if (size <= max) return to
  return size
}

function premium(Base: LucideIcon, name: string): LucideIcon {
  const Icon = React.forwardRef<SVGSVGElement, Omit<LucideProps, 'ref'>>(
    ({ size, strokeWidth, ...rest }, ref) => (
      <Base
        ref={ref}
        size={snap(size)}
        strokeWidth={strokeWidth ?? ICON_STROKE}
        absoluteStrokeWidth
        {...rest}
      />
    ),
  )
  Icon.displayName = name
  return Icon as LucideIcon
}

export const Activity = premium(L.Activity, 'Activity')
export const AlertCircle = premium(L.AlertCircle, 'AlertCircle')
export const AlertOctagon = premium(L.AlertOctagon, 'AlertOctagon')
export const AlertTriangle = premium(L.AlertTriangle, 'AlertTriangle')
export const Archive = premium(L.Archive, 'Archive')
export const ArchiveRestore = premium(L.ArchiveRestore, 'ArchiveRestore')
export const ArrowDown = premium(L.ArrowDown, 'ArrowDown')
export const ArrowLeft = premium(L.ArrowLeft, 'ArrowLeft')
export const ArrowRight = premium(L.ArrowRight, 'ArrowRight')
export const ArrowUp = premium(L.ArrowUp, 'ArrowUp')
export const ArrowUpRight = premium(L.ArrowUpRight, 'ArrowUpRight')
export const AtSign = premium(L.AtSign, 'AtSign')
export const Ban = premium(L.Ban, 'Ban')
export const BarChart3 = premium(L.BarChart3, 'BarChart3')
export const BookOpen = premium(L.BookOpen, 'BookOpen')
export const Boxes = premium(L.Boxes, 'Boxes')
export const Brain = premium(L.Brain, 'Brain')
export const Calendar = premium(L.Calendar, 'Calendar')
export const CalendarCheck = premium(L.CalendarCheck, 'CalendarCheck')
export const CalendarClock = premium(L.CalendarClock, 'CalendarClock')
export const CalendarPlus = premium(L.CalendarPlus, 'CalendarPlus')
export const Check = premium(L.Check, 'Check')
export const CheckCircle2 = premium(L.CheckCircle2, 'CheckCircle2')
export const CheckSquare = premium(L.CheckSquare, 'CheckSquare')
export const ChevronDown = premium(L.ChevronDown, 'ChevronDown')
export const ChevronLeft = premium(L.ChevronLeft, 'ChevronLeft')
export const ChevronRight = premium(L.ChevronRight, 'ChevronRight')
export const ChevronUp = premium(L.ChevronUp, 'ChevronUp')
export const Circle = premium(L.Circle, 'Circle')
export const CircleDollarSign = premium(L.CircleDollarSign, 'CircleDollarSign')
export const Clipboard = premium(L.Clipboard, 'Clipboard')
export const ClipboardPaste = premium(L.ClipboardPaste, 'ClipboardPaste')
export const Clock = premium(L.Clock, 'Clock')
export const Cog = premium(L.Cog, 'Cog')
export const Compass = premium(L.Compass, 'Compass')
export const Copy = premium(L.Copy, 'Copy')
export const CornerDownLeft = premium(L.CornerDownLeft, 'CornerDownLeft')
export const Crown = premium(L.Crown, 'Crown')
export const DollarSign = premium(L.DollarSign, 'DollarSign')
export const ExternalLink = premium(L.ExternalLink, 'ExternalLink')
export const Eye = premium(L.Eye, 'Eye')
export const FileSearch = premium(L.FileSearch, 'FileSearch')
export const FileText = premium(L.FileText, 'FileText')
export const Film = premium(L.Film, 'Film')
export const Filter = premium(L.Filter, 'Filter')
export const Flame = premium(L.Flame, 'Flame')
export const Gauge = premium(L.Gauge, 'Gauge')
export const Gavel = premium(L.Gavel, 'Gavel')
export const GitBranch = premium(L.GitBranch, 'GitBranch')
export const GitMerge = premium(L.GitMerge, 'GitMerge')
export const Globe = premium(L.Globe, 'Globe')
export const Globe2 = premium(L.Globe2, 'Globe2')
export const HeartHandshake = premium(L.HeartHandshake, 'HeartHandshake')
export const HelpCircle = premium(L.HelpCircle, 'HelpCircle')
export const History = premium(L.History, 'History')
export const Home = premium(L.Home, 'Home')
export const ImagePlus = premium(L.ImagePlus, 'ImagePlus')
export const Inbox = premium(L.Inbox, 'Inbox')
export const Info = premium(L.Info, 'Info')
export const Instagram = premium(L.Instagram, 'Instagram')
export const Layers = premium(L.Layers, 'Layers')
export const LayoutDashboard = premium(L.LayoutDashboard, 'LayoutDashboard')
export const Link2 = premium(L.Link2, 'Link2')
export const Linkedin = premium(L.Linkedin, 'Linkedin')
export const List = premium(L.List, 'List')
export const ListChecks = premium(L.ListChecks, 'ListChecks')
export const ListOrdered = premium(L.ListOrdered, 'ListOrdered')
export const Lock = premium(L.Lock, 'Lock')
export const LogOut = premium(L.LogOut, 'LogOut')
export const Mail = premium(L.Mail, 'Mail')
export const MailCheck = premium(L.MailCheck, 'MailCheck')
export const MapPin = premium(L.MapPin, 'MapPin')
export const Maximize2 = premium(L.Maximize2, 'Maximize2')
export const Megaphone = premium(L.Megaphone, 'Megaphone')
export const MessageCircle = premium(L.MessageCircle, 'MessageCircle')
export const MessageSquare = premium(L.MessageSquare, 'MessageSquare')
export const Mic = premium(L.Mic, 'Mic')
export const Minus = premium(L.Minus, 'Minus')
export const Monitor = premium(L.Monitor, 'Monitor')
export const Moon = premium(L.Moon, 'Moon')
export const MoreHorizontal = premium(L.MoreHorizontal, 'MoreHorizontal')
export const Newspaper = premium(L.Newspaper, 'Newspaper')
export const Paperclip = premium(L.Paperclip, 'Paperclip')
export const Pause = premium(L.Pause, 'Pause')
export const PenLine = premium(L.PenLine, 'PenLine')
export const Pencil = premium(L.Pencil, 'Pencil')
export const PencilLine = premium(L.PencilLine, 'PencilLine')
export const Phone = premium(L.Phone, 'Phone')
export const Play = premium(L.Play, 'Play')
export const Plug = premium(L.Plug, 'Plug')
export const Plus = premium(L.Plus, 'Plus')
export const Radar = premium(L.Radar, 'Radar')
export const Radio = premium(L.Radio, 'Radio')
export const RefreshCw = premium(L.RefreshCw, 'RefreshCw')
export const Rocket = premium(L.Rocket, 'Rocket')
export const RotateCcw = premium(L.RotateCcw, 'RotateCcw')
export const Save = premium(L.Save, 'Save')
export const Scissors = premium(L.Scissors, 'Scissors')
export const Search = premium(L.Search, 'Search')
export const SearchX = premium(L.SearchX, 'SearchX')
export const Send = premium(L.Send, 'Send')
export const Server = premium(L.Server, 'Server')
export const ShieldAlert = premium(L.ShieldAlert, 'ShieldAlert')
export const ShieldCheck = premium(L.ShieldCheck, 'ShieldCheck')
export const SkipForward = premium(L.SkipForward, 'SkipForward')
export const SlidersHorizontal = premium(L.SlidersHorizontal, 'SlidersHorizontal')
export const Sparkles = premium(L.Sparkles, 'Sparkles')
export const StickyNote = premium(L.StickyNote, 'StickyNote')
export const Square = premium(L.Square, 'Square')
export const Sun = premium(L.Sun, 'Sun')
export const Table2 = premium(L.Table2, 'Table2')
export const Tag = premium(L.Tag, 'Tag')
export const Target = premium(L.Target, 'Target')
export const ThumbsDown = premium(L.ThumbsDown, 'ThumbsDown')
export const ThumbsUp = premium(L.ThumbsUp, 'ThumbsUp')
export const Trash2 = premium(L.Trash2, 'Trash2')
export const TrendingDown = premium(L.TrendingDown, 'TrendingDown')
export const TrendingUp = premium(L.TrendingUp, 'TrendingUp')
export const Trophy = premium(L.Trophy, 'Trophy')
export const Twitter = premium(L.Twitter, 'Twitter')
export const Undo2 = premium(L.Undo2, 'Undo2')
export const Upload = premium(L.Upload, 'Upload')
export const UploadCloud = premium(L.UploadCloud, 'UploadCloud')
export const Volume2 = premium(L.Volume2, 'Volume2')
export const VolumeX = premium(L.VolumeX, 'VolumeX')
export const UserCircle2 = premium(L.UserCircle2, 'UserCircle2')
export const UserCog = premium(L.UserCog, 'UserCog')
export const UserMinus = premium(L.UserMinus, 'UserMinus')
export const UserPlus = premium(L.UserPlus, 'UserPlus')
export const Users = premium(L.Users, 'Users')
export const Wand2 = premium(L.Wand2, 'Wand2')
export const Workflow = premium(L.Workflow, 'Workflow')
export const X = premium(L.X, 'X')
export const XCircle = premium(L.XCircle, 'XCircle')
export const Youtube = premium(L.Youtube, 'Youtube')
export const Zap = premium(L.Zap, 'Zap')
