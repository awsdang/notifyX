/**
 * Brand marks for the push providers NotifyX talks to.
 *
 * These replace the generic lucide glyphs (`Apple`, `Smartphone`) that were
 * standing in for real logos. Each is an inline SVG so it inherits size from
 * props, needs no network request, and stays crisp at any scale.
 *
 * Paths are the vendors' own marks; keep them untouched so the icons stay
 * recognisable. Multicolour marks ignore `currentColor` by design.
 */

interface BrandIconProps {
  size?: number;
  className?: string;
  /** Render the mark in a single flat colour instead of full brand colours. */
  mono?: boolean;
}

/** Apple — APNs (iOS, macOS, Safari web push). */
export function AppleIcon({ size = 20, className, mono }: BrandIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      fill={mono ? "currentColor" : "#000000"}
      aria-label="Apple"
      role="img"
    >
      <path d="M17.05 12.536c-.03-3.026 2.47-4.478 2.582-4.55-1.406-2.056-3.594-2.34-4.373-2.372-1.862-.188-3.634 1.096-4.579 1.096-.943 0-2.4-1.069-3.945-1.04-2.03.03-3.903 1.18-4.947 2.996-2.108 3.657-.539 9.075 1.51 12.043 1.002 1.452 2.196 3.083 3.767 3.025 1.512-.06 2.083-.977 3.91-.977 1.828 0 2.342.977 3.943.947 1.628-.03 2.658-1.48 3.653-2.938 1.152-1.684 1.626-3.315 1.654-3.399-.036-.015-3.174-1.218-3.206-4.831zM14.09 3.744c.834-1.011 1.397-2.418 1.243-3.819-1.202.049-2.657.8-3.52 1.81-.773.895-1.45 2.327-1.268 3.7 1.34.104 2.71-.681 3.545-1.691z" />
    </svg>
  );
}

/** Google — FCM / Firebase Cloud Messaging (Android, Chrome web push). */
export function GoogleIcon({ size = 20, className, mono }: BrandIconProps) {
  if (mono) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        className={className}
        fill="currentColor"
        aria-label="Google"
        role="img"
      >
        <path d="M12.24 10.285V14.4h6.806c-.275 1.765-2.056 5.174-6.806 5.174-4.095 0-7.439-3.389-7.439-7.574s3.344-7.574 7.439-7.574c2.33 0 3.891.989 4.785 1.849l3.254-3.138C18.189 1.186 15.479 0 12.24 0c-6.635 0-12 5.365-12 12s5.365 12 12 12c6.926 0 11.52-4.869 11.52-11.726 0-.788-.085-1.39-.189-1.989H12.24z" />
      </svg>
    );
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      aria-label="Google"
      role="img"
    >
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.83z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.83C6.71 7.31 9.14 5.38 12 5.38z"
      />
    </svg>
  );
}

/** Firebase — the console you pull the FCM v1 service account from. */
export function FirebaseIcon({ size = 20, className, mono }: BrandIconProps) {
  const id = `nx-firebase-${size}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      aria-label="Firebase"
      role="img"
    >
      {!mono && (
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FFC24A" />
            <stop offset="100%" stopColor="#F4BD62" />
          </linearGradient>
        </defs>
      )}
      <path
        fill={mono ? "currentColor" : "#FFA000"}
        d="M3.89 15.673 6.255.461A.542.542 0 0 1 7.27.288l2.543 4.771zm16.794 3.692-2.25-14a.54.54 0 0 0-.919-.295L3.316 19.365l7.856 4.427a1.62 1.62 0 0 0 1.588 0z"
      />
      <path
        fill={mono ? "currentColor" : `url(#${id})`}
        d="M14.3 7.147 12.48 3.665a.542.542 0 0 0-.96 0L3.53 17.984z"
      />
    </svg>
  );
}

/**
 * Huawei — HMS Push Kit.
 * Drawn as the mark's signature four-petal bloom in Huawei red rather than a
 * traced logo, so it reads correctly at 16px without licence ambiguity.
 */
export function HuaweiIcon({ size = 20, className, mono }: BrandIconProps) {
  const fill = mono ? "currentColor" : "#CF0A2C";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      aria-label="Huawei"
      role="img"
    >
      <path
        fill={fill}
        d="M12 1.5c1.9 2.6 2.85 5.1 2.85 7.5 0 2.4-.95 4.9-2.85 7.5-1.9-2.6-2.85-5.1-2.85-7.5 0-2.4.95-4.9 2.85-7.5z"
      />
      <path
        fill={fill}
        opacity="0.75"
        d="M2.4 7.05c3.05.55 5.4 1.65 7.05 3.3 1.65 1.65 2.75 4 3.3 7.05-3.05-.55-5.4-1.65-7.05-3.3-1.65-1.65-2.75-4-3.3-7.05z"
      />
      <path
        fill={fill}
        opacity="0.75"
        d="M21.6 7.05c-.55 3.05-1.65 5.4-3.3 7.05-1.65 1.65-4 2.75-7.05 3.3.55-3.05 1.65-5.4 3.3-7.05 1.65-1.65 4-2.75 7.05-3.3z"
      />
      <path fill={fill} opacity="0.5" d="M12 18.6c1.4 0 2.55 1.05 2.55 2.4H9.45c0-1.35 1.15-2.4 2.55-2.4z" />
    </svg>
  );
}

/** Web push — VAPID / Push API in the browser. */
export function WebPushIcon({ size = 20, className, mono }: BrandIconProps) {
  if (mono) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        className={className}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        aria-label="Web"
        role="img"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      </svg>
    );
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      aria-label="Web"
      role="img"
    >
      <circle cx="12" cy="12" r="11" fill="#4285F4" />
      <path fill="#EA4335" d="M12 1a11 11 0 0 1 9.53 5.5H12a5.5 5.5 0 0 0-4.76 2.75L3.3 5.5A11 11 0 0 1 12 1z" />
      <path fill="#FBBC05" d="M3.3 5.5 7.24 9.25A5.5 5.5 0 0 0 7.24 14.75L3.3 18.5A11 11 0 0 1 3.3 5.5z" />
      <path fill="#34A853" d="M21.53 6.5A11 11 0 0 1 12 23l4.76-8.25A5.5 5.5 0 0 0 16.76 6.5z" />
      <circle cx="12" cy="12" r="4.6" fill="#fff" />
      <circle cx="12" cy="12" r="3.4" fill="#4285F4" />
    </svg>
  );
}

/** GitHub — links out to the SDK sources in this repository. */
export function GitHubIcon({ size = 20, className }: BrandIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      fill="currentColor"
      aria-label="GitHub"
      role="img"
    >
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  );
}

/** Flutter — the Dart SDK shipped in sdks/flutter. */
export function FlutterIcon({ size = 20, className }: BrandIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      aria-label="Flutter"
      role="img"
    >
      <path fill="#47C5FB" d="M14.314 0 2.3 12l3.717 3.717L21.734 0z" />
      <path fill="#47C5FB" d="M14.314 11.171 7.844 17.64l3.72 3.766 3.716-3.716L21.734 11.17z" />
      <path fill="#00569E" d="m11.563 21.406 2.751 2.594h7.42l-6.454-6.31z" />
      <path fill="#00B5F8" d="m7.797 17.688 3.72-3.72 3.813 3.719-3.766 3.719z" />
    </svg>
  );
}

/** React — the React Native SDK shipped in sdks/react-native. */
export function ReactIcon({ size = 20, className }: BrandIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      fill="#61DAFB"
      aria-label="React Native"
      role="img"
    >
      <circle cx="12" cy="12" r="2.14" />
      <g stroke="#61DAFB" strokeWidth="1" fill="none">
        <ellipse cx="12" cy="12" rx="10" ry="4.2" />
        <ellipse cx="12" cy="12" rx="10" ry="4.2" transform="rotate(60 12 12)" />
        <ellipse cx="12" cy="12" rx="10" ry="4.2" transform="rotate(120 12 12)" />
      </g>
    </svg>
  );
}

/**
 * Resolve a provider key (as stored on credentials/devices) to its mark.
 * Falls back to the web glyph for anything unrecognised.
 */
export function ProviderBrandIcon({
  provider,
  size = 20,
  className,
  mono,
}: BrandIconProps & { provider: string }) {
  switch (provider?.toLowerCase()) {
    case "apns":
    case "ios":
    case "apple":
      return <AppleIcon size={size} className={className} mono={mono} />;
    case "fcm":
    case "android":
    case "firebase":
      return <FirebaseIcon size={size} className={className} mono={mono} />;
    case "google":
      return <GoogleIcon size={size} className={className} mono={mono} />;
    case "hms":
    case "huawei":
      return <HuaweiIcon size={size} className={className} mono={mono} />;
    default:
      return <WebPushIcon size={size} className={className} mono={mono} />;
  }
}
