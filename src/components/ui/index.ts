// Barrel for the vendored primitive layer.
//
// These sit BENEATH src/components/shared/, they do not replace it.
// docs/DESIGN_SYSTEM.md: "Do not hand-roll a card, button, pill, or hero —
// extend the primitive." shared/Pressable, HeroCard, SwipeCard and
// DoThisNextHero keep their public API; they are re-implemented on top of these
// so both device classes and both themes stay coherent from one place.
export { Button, buttonVariants, type ButtonProps } from './button'
export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, cardVariants } from './card'
export { Input } from './input'
export { Textarea } from './textarea'
export { Badge, badgeVariants } from './badge'
export {
  Dialog, DialogPortal, DialogOverlay, DialogClose, DialogTrigger,
  DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription,
  DialogSrTitle,
} from './dialog'
export { Tabs, TabsList, TabsTrigger, TabsContent } from './tabs'
export {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuCheckboxItem, DropdownMenuLabel, DropdownMenuSeparator,
  DropdownMenuGroup, DropdownMenuSub, DropdownMenuRadioGroup,
} from './dropdown-menu'
export { Popover, PopoverTrigger, PopoverContent, PopoverAnchor } from './popover'
export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from './tooltip'
