type Props = { type: string; size?: number };

/** 线性图标：按设备族区分，颜色跟随 currentColor，保持黑白灰体系 */
export function DeviceIcon({ type, size = 18 }: Props) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (type) {
    case "light":
      return (
        <svg {...common}>
          <path d="M9 18h6M10 21h4" />
          <path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2h5c0-.8.4-1.5 1-2A6 6 0 0 0 12 3Z" />
        </svg>
      );
    case "ac":
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="7" rx="2" />
          <path d="M7 16c1.2 1 2.4 1 3.6 0M13 18c1.2 1 2.4 1 3.6 0M7 19c1.2 1 2.4 1 3.6 0" />
        </svg>
      );
    case "curtain":
      return (
        <svg {...common}>
          <path d="M3 4h18M6 4v16M18 4v16M6 7c3 1 3 5 0 6M18 7c-3 1-3 5 0 6" />
        </svg>
      );
    case "lock":
      return (
        <svg {...common}>
          <rect x="5" y="10" width="14" height="10" rx="2" />
          <path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v2" />
        </svg>
      );
    case "tv":
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="12" rx="2" />
          <path d="M8 21h8M12 17v4" />
        </svg>
      );
    case "purifier":
    case "speaker":
      return (
        <svg {...common}>
          <rect x="5" y="3" width="14" height="18" rx="3" />
          <circle cx="12" cy="9" r="2.5" />
          <path d="M9 16h6" />
        </svg>
      );
    case "robot":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8" />
          <path d="M9 10h.01M15 10h.01M9 15c2 1.5 4 1.5 6 0" />
        </svg>
      );
    case "hood":
      return (
        <svg {...common}>
          <path d="M4 5h16l-2 8H6L4 5ZM8 13v6M16 13v6" />
        </svg>
      );
    case "fridge":
      return (
        <svg {...common}>
          <rect x="6" y="3" width="12" height="18" rx="2" />
          <path d="M6 10h12M9 6v2M9 13v3" />
        </svg>
      );
    case "dishwasher":
    case "washer":
      return (
        <svg {...common}>
          <rect x="4" y="3" width="16" height="18" rx="2" />
          <circle cx="12" cy="14" r="4" />
          <path d="M8 6h.01M11 6h.01" />
        </svg>
      );
    case "ricecooker":
      return (
        <svg {...common}>
          <path d="M5 10h14v7a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3v-7Z" />
          <path d="M8 10V7a4 4 0 0 1 8 0v3M9 5h6" />
        </svg>
      );
    case "waterheater":
      return (
        <svg {...common}>
          <rect x="5" y="4" width="14" height="16" rx="3" />
          <path d="M12 8c1.6 2 2.5 3.2 2.5 4.4a2.5 2.5 0 0 1-5 0C9.5 11.2 10.4 10 12 8Z" />
        </svg>
      );
    case "socket":
      return (
        <svg {...common}>
          <rect x="5" y="5" width="14" height="14" rx="3" />
          <path d="M9 9v3M15 9v3M12 15v2" />
        </svg>
      );
    case "smoke":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="7" />
          <path d="M12 5v2M12 17v2M5 12h2M17 12h2" />
        </svg>
      );
    case "presence":
      return (
        <svg {...common}>
          <circle cx="12" cy="8" r="3" />
          <path d="M5 20c0-3.3 3.1-6 7-6s7 2.7 7 6" />
        </svg>
      );
    case "lux":
    case "thsensor":
      return (
        <svg {...common}>
          <path d="M10 14V5a2 2 0 1 1 4 0v9a4 4 0 1 1-4 0Z" />
          <path d="M12 9v6" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <rect x="5" y="5" width="14" height="14" rx="3" />
          <path d="M9 12h6" />
        </svg>
      );
  }
}
