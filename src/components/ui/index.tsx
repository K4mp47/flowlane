import { Dialog } from '@base-ui/react/dialog'
import { Select } from '@base-ui/react/select'
import { cva, type VariantProps } from 'class-variance-authority'
import { Check, ChevronDown, LoaderCircle, X } from 'lucide-react'
import { motion } from 'motion/react'
import type { ButtonHTMLAttributes, CSSProperties, ElementType, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

const buttonVariants = cva('fl-button', {
  variants: {
    variant: { primary: 'fl-button-primary', secondary: 'fl-button-secondary', ghost: 'fl-button-ghost', danger: 'fl-button-danger' },
    size: { sm: 'fl-button-sm', md: 'fl-button-md', lg: 'fl-button-lg' },
  },
  defaultVariants: { variant: 'secondary', size: 'md' },
})

type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'disabled'> & VariantProps<typeof buttonVariants> & {
  label?: string
  children?: ReactNode
  icon?: ReactNode
  isLoading?: boolean
  isDisabled?: boolean
  width?: CSSProperties['width']
}

export function Button({ label, children, icon, isLoading = false, isDisabled = false, variant, size, width, className, type = 'button', ...props }: ButtonProps) {
  return <button type={type} className={cn(buttonVariants({ variant, size }), className)} disabled={isDisabled || isLoading} style={{ width }} {...props}>
    {isLoading ? <LoaderCircle className="fl-spin" size={15} aria-hidden="true" /> : icon}
    <span>{children ?? label}</span>
  </button>
}

export type BadgeVariant = 'neutral' | 'red' | 'orange' | 'blue' | 'green' | 'teal' | 'yellow' | 'error'
const badgeVariants = cva('fl-badge', {
  variants: {
    variant: {
      neutral: 'fl-badge-neutral', red: 'fl-badge-red', orange: 'fl-badge-orange', blue: 'fl-badge-blue',
      green: 'fl-badge-green', teal: 'fl-badge-teal', yellow: 'fl-badge-yellow', error: 'fl-badge-red',
    },
  },
  defaultVariants: { variant: 'neutral' },
})
export function Badge({ label, variant = 'neutral', className }: { label: string; variant?: BadgeVariant; className?: string }) {
  return <span className={cn(badgeVariants({ variant }), className)}>{label}</span>
}

export function IconButton({ label, icon, variant = 'ghost', size = 'md', isDisabled = false, className, ...props }: Omit<ButtonProps, 'label' | 'children'> & { label: string; icon: ReactNode }) {
  return <button type="button" aria-label={label} title={label} className={cn('fl-icon-button', `fl-icon-button-${variant}`, `fl-icon-button-${size}`, className)} disabled={isDisabled} {...props}>{icon}</button>
}

type FieldBase = { label: string; description?: string; isLabelHidden?: boolean; isRequired?: boolean; isOptional?: boolean; width?: CSSProperties['width'] }

type TextInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value' | 'width' | 'required'> & FieldBase & {
  value: string
  onChange: (value: string) => void
  startIcon?: ElementType
  hasClear?: boolean
}
export function TextInput({ label, description, isLabelHidden, isRequired, isOptional, width, value, onChange, startIcon: StartIcon, hasClear, className, ...props }: TextInputProps) {
  return <label className={cn('fl-field', className)} style={{ width }}>
    <span className={cn('fl-field-label', isLabelHidden && 'sr-only')}>{label}{isOptional ? <small>Optional</small> : null}</span>
    {description ? <span className="fl-field-description">{description}</span> : null}
    <span className="fl-input-shell">
      {StartIcon ? <StartIcon className="fl-input-icon" size={16} aria-hidden="true" /> : null}
      <input className="fl-input" value={value} onChange={(event) => onChange(event.target.value)} required={isRequired} aria-label={isLabelHidden ? label : undefined} {...props} />
      {hasClear && value ? <button type="button" className="fl-input-clear" aria-label={`Clear ${label}`} onClick={() => onChange('')}><X size={13} /></button> : null}
    </span>
  </label>
}

type TextAreaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange' | 'value' | 'required'> & FieldBase & { value: string; onChange: (value: string) => void }
export function TextArea({ label, description, isLabelHidden, isRequired, isOptional, width, value, onChange, className, ...props }: TextAreaProps) {
  return <label className={cn('fl-field', className)} style={{ width }}>
    <span className={cn('fl-field-label', isLabelHidden && 'sr-only')}>{label}{isOptional ? <small>Optional</small> : null}</span>
    {description ? <span className="fl-field-description">{description}</span> : null}
    <textarea className="fl-textarea" value={value} onChange={(event) => onChange(event.target.value)} required={isRequired} aria-label={isLabelHidden ? label : undefined} {...props} />
  </label>
}

export type SelectOption = { value: string; label: string }
export function Selector({ label, options, value, onChange, isLabelHidden, startIcon, width, className, placeholder }: { label: string; options: SelectOption[]; value: string; onChange: (value: string) => void; isLabelHidden?: boolean; startIcon?: ReactNode; width?: CSSProperties['width']; size?: 'sm' | 'md'; className?: string; placeholder?: string }) {
  return <div className={cn('fl-field', className)} style={{ width }}>
    <Select.Root items={options} value={value} onValueChange={(next) => { if (typeof next === 'string') onChange(next) }}>
      <Select.Label className={cn('fl-field-label', isLabelHidden && 'sr-only')}>{label}</Select.Label>
      <Select.Trigger className="fl-select-trigger" aria-label={isLabelHidden ? label : undefined}>
        {startIcon ? <span className="fl-select-leading">{startIcon}</span> : null}
        <Select.Value className="fl-select-value" placeholder={placeholder} />
        <Select.Icon className="fl-select-icon"><ChevronDown size={14} /></Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner className="fl-select-positioner" sideOffset={6} alignItemWithTrigger={false}>
          <Select.Popup className="fl-select-popup">
            <Select.List className="fl-select-list">
              {options.map((option) => <Select.Item key={option.value || '__empty'} value={option.value} className="fl-select-item">
                <Select.ItemIndicator className="fl-select-item-indicator"><Check size={13} /></Select.ItemIndicator>
                <Select.ItemText>{option.label}</Select.ItemText>
              </Select.Item>)}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  </div>
}

export function CheckboxInput({ label, value, onChange, isReadOnly = false, width }: { label: string; value: boolean; onChange: (value: boolean) => void; isReadOnly?: boolean; size?: 'sm' | 'md'; width?: CSSProperties['width'] }) {
  return <label className={cn('fl-checkbox', isReadOnly && 'is-readonly')} style={{ width }}>
    <input type="checkbox" checked={value} disabled={isReadOnly} onChange={(event) => onChange(event.target.checked)} />
    <span className="fl-checkbox-box" aria-hidden="true">{value ? <Check size={12} strokeWidth={3} /> : null}</span>
    <span className="fl-checkbox-label">{label}</span>
  </label>
}

export type ISODateString = `${number}-${number}-${number}`
export function DateInput({ label, value, onChange, hasClear, width }: { label: string; value?: ISODateString; onChange: (value: ISODateString | undefined) => void; hasClear?: boolean; width?: CSSProperties['width'] }) {
  return <label className="fl-field" style={{ width }}>
    <span className="fl-field-label">{label}</span>
    <span className="fl-input-shell">
      <input className="fl-input" type="date" value={value ?? ''} onChange={(event) => onChange((event.target.value || undefined) as ISODateString | undefined)} />
      {hasClear && value ? <button type="button" className="fl-input-clear" aria-label={`Clear ${label}`} onClick={() => onChange(undefined)}><X size={13} /></button> : null}
    </span>
  </label>
}

export function SideNav({ header, footer, children, className }: { header?: ReactNode; footer?: ReactNode; children: ReactNode; className?: string; collapsible?: unknown }) {
  return <div className={cn('fl-side-nav', className)}>{header ? <div className="fl-side-nav-header">{header}</div> : null}<nav className="fl-side-nav-body">{children}</nav>{footer ? <div className="fl-side-nav-footer">{footer}</div> : null}</div>
}
export function SideNavItem({ label, icon, isSelected, onClick }: { label: string; icon?: ReactNode; isSelected?: boolean; onClick?: () => void }) {
  return <button type="button" className={cn('fl-nav-item', isSelected && 'is-selected')} onClick={onClick} aria-current={isSelected ? 'page' : undefined}>{icon ? <span className="fl-nav-icon">{icon}</span> : null}{label ? <span className="fl-nav-label">{label}</span> : null}</button>
}

export function Modal({ open, onOpenChange, title, description, children, className }: { open: boolean; onOpenChange: (open: boolean) => void; title: string; description?: string; children: ReactNode; className?: string }) {
  return <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog.Portal>
      <Dialog.Backdrop className="fl-dialog-backdrop" />
      <Dialog.Viewport className="fl-dialog-viewport">
        <Dialog.Popup className={cn('fl-dialog-popup', className)} render={<motion.div initial={{ opacity: 0, y: 10, scale: .985 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: .99 }} transition={{ duration: .16 }} />}>
          <div className="fl-dialog-a11y"><Dialog.Title>{title}</Dialog.Title>{description ? <Dialog.Description>{description}</Dialog.Description> : null}</div>
          {children}
        </Dialog.Popup>
      </Dialog.Viewport>
    </Dialog.Portal>
  </Dialog.Root>
}
