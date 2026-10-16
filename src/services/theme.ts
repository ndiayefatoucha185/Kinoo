export type ThemeMode = 'dark' | 'light' | 'system';

const THEME_STORAGE_KEY = 'kinoo_color_theme';

let mediaQueryListener: ((e: MediaQueryListEvent) => void) | null = null;

export function getStoredTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'system';
  const val = localStorage.getItem(THEME_STORAGE_KEY);
  if (val === 'dark' || val === 'light' || val === 'system') {
    return val;
  }
  return 'system';
}

export function getSystemTheme(): 'dark' | 'light' {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function getResolvedTheme(theme: ThemeMode = getStoredTheme()): 'dark' | 'light' {
  if (theme === 'system') {
    return getSystemTheme();
  }
  return theme;
}

export function applyTheme(theme: ThemeMode): void {
  if (typeof window === 'undefined') return;

  const resolved = getResolvedTheme(theme);
  const root = document.documentElement;

  if (resolved === 'dark') {
    root.classList.add('dark');
    root.classList.remove('light');
    root.setAttribute('data-theme', 'dark');
    root.style.colorScheme = 'dark';
  } else {
    root.classList.add('light');
    root.classList.remove('dark');
    root.setAttribute('data-theme', 'light');
    root.style.colorScheme = 'light';
  }

  // Manage media query listener for 'system' mode
  const mql = window.matchMedia('(prefers-color-scheme: dark)');

  if (mediaQueryListener) {
    try {
      mql.removeEventListener('change', mediaQueryListener);
    } catch {
      mql.removeListener?.(mediaQueryListener as any);
    }
    mediaQueryListener = null;
  }

  if (theme === 'system') {
    mediaQueryListener = (e: MediaQueryListEvent) => {
      const newResolved = e.matches ? 'dark' : 'light';
      if (newResolved === 'dark') {
        root.classList.add('dark');
        root.classList.remove('light');
        root.setAttribute('data-theme', 'dark');
        root.style.colorScheme = 'dark';
      } else {
        root.classList.add('light');
        root.classList.remove('dark');
        root.setAttribute('data-theme', 'light');
        root.style.colorScheme = 'light';
      }
      notifyListeners();
    };

    try {
      mql.addEventListener('change', mediaQueryListener);
    } catch {
      mql.addListener?.(mediaQueryListener as any);
    }
  }

  notifyListeners();
}

export function setStoredTheme(theme: ThemeMode): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(THEME_STORAGE_KEY, theme);
  applyTheme(theme);
}

// Subscription support for UI components
type ThemeListener = (theme: ThemeMode, resolved: 'dark' | 'light') => void;
const listeners = new Set<ThemeListener>();

export function subscribeTheme(listener: ThemeListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notifyListeners() {
  const current = getStoredTheme();
  const resolved = getResolvedTheme(current);
  listeners.forEach((cb) => {
    try {
      cb(current, resolved);
    } catch (e) {
      console.warn('Error in theme listener:', e);
    }
  });
}

// Initial auto-mount
if (typeof window !== 'undefined') {
  try {
    applyTheme(getStoredTheme());
  } catch (err) {
    console.warn('Theme init error:', err);
  }
}
