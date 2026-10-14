type P = { color?: string; size?: number; fill?: string };

const svg = (size: number, color: string, children: React.ReactNode, sw = 1.4, fill = 'none', className?: string) => (
  <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={color} strokeWidth={sw} aria-hidden="true">
    {children}
  </svg>
);

export const SearchIcon = ({ color = 'currentColor', size = 20 }: P) =>
  svg(size, color, <><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></>);
export const UserIcon = ({ color = 'currentColor', size = 20 }: P) =>
  svg(size, color, <><circle cx="12" cy="8.5" r="3.8" /><path d="M4.5 20c1.2-3.8 4-5.6 7.5-5.6s6.3 1.8 7.5 5.6" /></>);
export const BagIcon = ({ color = 'currentColor', size = 20 }: P) =>
  svg(size, color, <><path d="M5 8h14l-1 12H6L5 8z" /><path d="M9 8V6.5a3 3 0 016 0V8" /></>, 1.5);
export const ArrowIcon = ({ color = 'currentColor', size = 16 }: P) =>
  svg(size, color, <path d="M5 12h14M13 6l6 6-6 6" />, 1.5, 'none', 'icon-arrow');
export const CloseIcon = ({ color = 'currentColor', size = 18 }: P) =>
  svg(size, color, <path d="M6 6l12 12M18 6L6 18" />);
export const MenuIcon = ({ color = 'currentColor', size = 22 }: P) =>
  svg(size, color, <path d="M3.5 9h17M3.5 15h17" />);
export const HeartIcon = ({ color = 'currentColor', size = 17, fill = 'none' }: P) =>
  svg(size, color, <path d="M12 20s-7-4.4-7-9.6A4 4 0 0112 8a4 4 0 017 2.4C19 15.6 12 20 12 20z" />, 1.4, fill);
